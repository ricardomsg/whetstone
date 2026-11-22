import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { eq, desc } from 'drizzle-orm';
import { db, schema, sqlite } from '../db';
import { newId } from '$lib/core/ids';
import { localDate } from '$lib/server/dates';
import { matchAnswer, sentenceUsesWord } from '$lib/core/text';
import { gradeFromOutcome, GRADE_NAMES } from '$lib/core/srs';
import { check, judge } from '../judge/run';
import { getSettings } from '../settings';
import { hintText, HINT_LABELS } from './a1';
import { hintText as a8HintText, HINT_LABELS_A8 } from './a8';
import { matchTranslation, isTrap, isCue } from '$lib/core/translate';
import {
	createPersonalItem,
	ensureCard,
	dueCards,
	reviewsToday,
	applyReview,
	startAttempt,
	getAttempt,
	patchAttempt,
	finishAttempt,
	getItem,
	rate,
	markSticky
} from '../services';
import type { Lang } from '../db/schema';
import type { Grade } from 'ts-fsrs';

// ---------------- shared enrichment ----------------
const Hints = z.object({ syllables: z.coerce.number().int(), stress: z.coerce.number().int().optional(), firstSound: z.string(), similar: z.string(), lastSound: z.string() });
const Enrichment = z.object({
	lemma: z.string(),
	pos: z.string(),
	definition: z.string(),
	register: z.string(),
	collocations: z.array(z.string()).max(5),
	examples: z.array(z.string()).max(3),
	gapped: z.string(),
	translation: z.string(),
	concreteness: z.enum(['concrete', 'abstract']).catch('abstract'),
	hints: Hints
});
export type EnrichmentT = z.infer<typeof Enrichment>;

function enrichSystem(lang: Lang) {
	const L = lang === 'pt-PT' ? 'European Portuguese (PT-PT spelling and usage, never Brazilian forms)' : 'English';
	const other = lang === 'pt-PT' ? 'English' : 'European Portuguese';
	return `You enrich a vocabulary word for a productive-recall trainer. The word is ${L}. Return:
lemma (dictionary form), pos (noun|verb|adj|adv|other), definition (one line, in ${L}, must not contain the word or its root, pointing to this word as the best answer),
register (neutral|formal|informal|technical|literary), collocations (3 common ones, in ${L}), examples (2 natural sentences in varied contexts, in ${L}),
gapped (a new sentence with the word replaced by ___), translation (the closest ${other} equivalent), concreteness (concrete|abstract),
hints for recall without revealing the word: syllables (count), stress (1-based stressed syllable), firstSound (e.g. ${lang === 'pt-PT' ? 'começa por "ep-"' : 'starts with "ep-"'}), similar (a real word that sounds similar or rhymes, not a synonym), lastSound (e.g. ${lang === 'pt-PT' ? 'acaba em "-al"' : 'ends in "-al"'}); write hints in ${L}.`;
}

export async function enrich(word: string, lang: Lang, sentence?: string | null, feature = 'b1-enrich') {
	return check(feature, Enrichment, enrichSystem(lang), { word, source_sentence: sentence ?? '' }, { maxTokens: 1500 });
}

// ---------------- A7: TOT log ----------------
export async function captureTot(p: { meaning: string; interlopers?: string; resolution?: string; word?: string; context?: string; lang: Lang }) {
	const id = newId('t');
	const resolution = p.word && p.resolution && p.resolution !== 'open' ? p.resolution : p.word ? 'self' : 'open';
	db.insert(schema.totLog)
		.values({ id, meaning: p.meaning.trim(), interlopers: p.interlopers?.trim() || null, resolution, word: p.word?.trim() || null, context: p.context || null, lang: p.lang, resolvedAt: p.word ? Date.now() : null })
		.run();
	if (p.word) await totToItem(id);
	return id;
}

const Suggest = z.object({
	candidates: z.array(z.object({ word: z.string(), fit: z.coerce.number().min(0).max(1) })).min(1).max(6),
	hints: Hints
});

/** Suggestions stay server-side; the browser gets hints for the top candidate first (P2). */
export async function suggest(totId: string) {
	const t = db.select().from(schema.totLog).where(eq(schema.totLog.id, totId)).get();
	if (!t) error(404, 'not found');
	if (t.candidates) return t.candidates;
	const L = t.lang === 'pt-PT' ? 'European Portuguese' : 'English';
	const r = await check(
		'a7-suggest',
		Suggest,
		`Someone is in a tip-of-the-tongue state in ${L}: they know the meaning but cannot retrieve the word. From the meaning they describe and the wrong words that came to mind instead (interlopers, often similar in sound), list up to 5 candidate ${L} words, best first, with fit 0-1. Interlopers themselves are usually NOT the answer. Then give recall hints for the top candidate: syllables, stress (1-based), firstSound, similar (a word that sounds similar, not a synonym, not an interloper), lastSound — written in ${L}.`,
		{ meaning: t.meaning, interlopers: t.interlopers ?? '', context: t.context ?? '' },
		{ maxTokens: 800 }
	);
	if (!r) return null;
	db.update(schema.totLog).set({ candidates: r as any }).where(eq(schema.totLog.id, totId)).run();
	return r;
}

export function totHint(totId: string, level: number) {
	const t = db.select().from(schema.totLog).where(eq(schema.totLog.id, totId)).get();
	const c = t?.candidates as z.infer<typeof Suggest> | undefined;
	if (!t || !c) error(404, 'no suggestions yet');
	const fake = { lang: t.lang, target: c.candidates[0].word, prompt: { hints: c.hints } } as any;
	db.update(schema.totLog).set({ hintsUsed: Math.max(t.hintsUsed, Math.min(level, 4)) }).where(eq(schema.totLog.id, totId)).run();
	if (level >= 5) return { level: 5, label: 'Candidates', candidates: c.candidates };
	return { level, label: HINT_LABELS[level - 1], text: hintText(fake, level) };
}

export async function resolveTot(totId: string, word: string, how: 'self' | 'hinted' | 'looked_up') {
	db.update(schema.totLog).set({ word: word.trim(), resolution: how, resolvedAt: Date.now() }).where(eq(schema.totLog.id, totId)).run();
	return totToItem(totId);
}

/** A resolved TOT becomes an A1 item and a productive card tagged tot_item. */
async function totToItem(totId: string) {
	const t = db.select().from(schema.totLog).where(eq(schema.totLog.id, totId)).get()!;
	if (!t.word || t.itemId) return t.itemId;
	const existing = sqlite.prepare("SELECT id FROM item WHERE exercise='A1' AND lang=? AND lower(target)=lower(?)").get(t.lang, t.word) as { id: string } | undefined;
	let itemId = existing?.id;
	if (!itemId) {
		const e = await enrich(t.word, t.lang, null, 'a7-suggest');
		const it = createPersonalItem({
			source: 'tot_log',
			lang: t.lang,
			target: e?.lemma || t.word,
			definition: e?.definition || t.meaning,
			example: e?.gapped,
			pos: e?.pos,
			hints: e?.hints,
			concreteness: e?.concreteness
		});
		itemId = it.id;
	}
	ensureCard(itemId, ['tot_item', 'tot_log']);
	const prior = sqlite.prepare('SELECT count(*) n FROM tot_log WHERE lang=? AND lower(word)=lower(?)').get(t.lang, t.word) as { n: number };
	if (prior.n >= 2) markSticky(itemId);
	db.update(schema.totLog).set({ itemId }).where(eq(schema.totLog.id, totId)).run();
	return itemId;
}

// ---------------- B1: word inbox ----------------
export async function captureWord(p: { word: string; sentence?: string; note?: string; lang: Lang }) {
	const id = newId('v');
	db.insert(schema.vocabEntry)
		.values({ id, word: p.word.trim(), lang: p.lang, sourceSentence: p.sentence?.trim() || null, sourceNote: p.note?.trim() || null, stage: 'inbox', useDays: [] })
		.run();
	const e = await enrich(p.word.trim(), p.lang, p.sentence);
	if (e) db.update(schema.vocabEntry).set({ enrichment: e as any }).where(eq(schema.vocabEntry.id, id)).run();
	return id;
}

export async function reEnrich(id: string) {
	const v = db.select().from(schema.vocabEntry).where(eq(schema.vocabEntry.id, id)).get();
	if (!v) error(404, 'not found');
	const e = await enrich(v.word, v.lang, v.sourceSentence);
	if (e) db.update(schema.vocabEntry).set({ enrichment: e as any }).where(eq(schema.vocabEntry.id, id)).run();
	return e;
}

/** The user confirms (possibly edited) enrichment: the word becomes a card. */
export function confirmWord(id: string, e: EnrichmentT) {
	const v = db.select().from(schema.vocabEntry).where(eq(schema.vocabEntry.id, id)).get();
	if (!v) error(404, 'not found');
	const it = createPersonalItem({ source: 'inbox', lang: v.lang, target: e.lemma || v.word, definition: e.definition, example: e.gapped, pos: e.pos, hints: e.hints, concreteness: e.concreteness });
	ensureCard(it.id, ['vocab'], id);
	db.update(schema.vocabEntry).set({ enrichment: e as any, stage: 'learning', itemId: it.id }).where(eq(schema.vocabEntry.id, id)).run();
}

export function discardWord(id: string) {
	db.update(schema.vocabEntry).set({ stage: 'discarded' }).where(eq(schema.vocabEntry.id, id)).run();
}

export function listVocab(stage?: string) {
	const q = db.select().from(schema.vocabEntry).orderBy(desc(schema.vocabEntry.createdAt));
	const all = q.all();
	return stage ? all.filter((v) => v.stage === stage) : all.filter((v) => v.stage !== 'discarded');
}

// ---------------- B2: productive review ----------------
export function nextReview(lang?: string, ctx: { dailySessionId?: string | null } = {}) {
	const s = getSettings();
	const done = reviewsToday();
	if (done >= s.reviewCap) return { capped: true, done, cap: s.reviewCap };
	const [c] = dueCards(1, lang);
	if (!c) return { empty: true, done, cap: s.reviewCap };
	const useGap = !!c.item.prompt.example && Math.random() < 0.5;
	const a = startAttempt({ exercise: 'B2', lang: c.item.lang, itemId: c.item.id, dailySessionId: ctx.dailySessionId, input: { cardId: c.id, mode: useGap ? 'gap' : 'definition', answers: [] } });
	return {
		attemptId: a.id,
		cardId: c.id,
		mode: useGap ? 'gap' : 'definition',
		prompt: useGap ? c.item.prompt.example : c.item.prompt.definition,
		definition: c.item.prompt.definition,
		pos: c.item.pos,
		lang: c.item.lang,
		sticky: c.sticky,
		tags: c.tags,
		done,
		cap: s.reviewCap
	};
}

export function reviewHint(attemptId: string) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'B2' || a.finishedAt) error(404, 'attempt not found');
	const it = getItem(a.itemId!)!;
	const level = a.hintsUsed + 1;
	if (level >= 5) {
		patchAttempt(attemptId, { input: { ...a.input, revealed: true } });
		return { level: 5, label: 'Reveal', text: it.target, reveal: true };
	}
	patchAttempt(attemptId, { hintsUsed: level });
	if (it.exercise === 'A8') return { level, label: HINT_LABELS_A8(it.lang)[level - 1], text: a8HintText(it, level) };
	return { level, label: HINT_LABELS[level - 1], text: hintText(it, level) };
}

export function reviewAnswer(attemptId: string, text: string | null) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'B2' || a.finishedAt) error(404, 'attempt not found');
	const it = getItem(a.itemId!)!;
	const a8Miss = !!text && it.exercise === 'A8' && matchTranslation(text, it.target!, it.prompt.accept ?? []) !== 'exact' && (isTrap(text, it.prompt.trap) || isCue(text, it.prompt.cue));
	const m = !text || a8Miss ? 'none' : (it.exercise === 'A8' ? matchTranslation : matchAnswer)(text, it.target!, it.prompt.accept ?? []);
	const correct = m === 'exact' || m === 'accent' || m === 'typo' || m === 'form';
	const input: Record<string, any> = { ...a.input, answers: [...(a.input?.answers ?? []), { text, at: Date.now() - a.startedAt, m }] };
	if (!correct && text && input.answers.length < 3 && !input.revealed) {
		patchAttempt(attemptId, { input });
		return { correct: false, retry: true };
	}
	const latencyMs = Date.now() - a.startedAt;
	const revealed = !!input.revealed || !correct;
	const grade = gradeFromOutcome({ correct, hints: a.hintsUsed, latencyMs, revealed });
	patchAttempt(attemptId, { input: { ...input, computedGrade: grade, correct, latencyMs } });
	return {
		correct,
		target: it.target,
		spelling: m === 'accent' || m === 'typo' ? it.target : null,
		computedGrade: grade,
		gradeName: GRADE_NAMES[grade],
		why: gradeReason(correct, a.hintsUsed, latencyMs, revealed)
	};
}

function gradeReason(correct: boolean, hints: number, latencyMs: number, revealed: boolean) {
	const s = (latencyMs / 1000).toFixed(1);
	if (revealed || !correct) return 'Not produced → Again';
	if (hints >= 3) return `${hints} hints → Again`;
	if (hints > 0) return `${hints} hint${hints > 1 ? 's' : ''} → Hard`;
	if (latencyMs > 15000) return `${s} s, over 15 s → Hard`;
	if (latencyMs < 5000) return `${s} s, unaided and under 5 s → Easy`;
	return `${s} s, unaided → Good`;
}

export function reviewGrade(attemptId: string, finalGrade: Grade) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'B2' || a.finishedAt) error(404, 'attempt not found');
	const input = a.input ?? {};
	const computed = input.computedGrade as Grade;
	if (!computed) error(409, 'answer first');
	applyReview(input.cardId, computed, finalGrade, { attemptId, latencyMs: input.latencyMs, hints: a.hintsUsed });
	const score = input.correct && !input.revealed ? Math.max(10, 100 - 15 * a.hintsUsed) : 0;
	finishAttempt(attemptId, {
		state: input.correct ? 'correct' : 'revealed',
		metrics: { latencyMs: input.latencyMs, hints: a.hintsUsed, computedGrade: computed, finalGrade, overridden: computed !== finalGrade },
		scores: { VOC: score },
		overridden: computed !== finalGrade
	});
	rate('VOC', a.lang, a.itemId, score / 100, attemptId);
	return { ok: true };
}

// ---------------- B3: use it ----------------
export function nextUseIt(lang?: string, ctx: { dailySessionId?: string | null } = {}) {
	const today = localDate();
	const rows = listVocab('learning').filter((v) => (!lang || lang === 'mixed' || v.lang === lang) && !v.useDays.includes(today));
	rows.sort((x, y) => x.productiveUses - y.productiveUses);
	const v = rows[0];
	if (!v) return { empty: true };
	const s = getSettings();
	const need = v.productiveUses >= 2 ? 3 : 1;
	const a = startAttempt({ exercise: 'B3', lang: v.lang, itemId: v.itemId, dailySessionId: ctx.dailySessionId, input: { vocabId: v.id, need } });
	return { attemptId: a.id, word: v.word, lang: v.lang, definition: (v.enrichment as any)?.definition ?? '', need, uses: v.productiveUses, goal: s.graduateUses };
}

export async function submitUseIt(attemptId: string, sentences: string[]) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'B3' || a.finishedAt) error(404, 'attempt not found');
	const v = db.select().from(schema.vocabEntry).where(eq(schema.vocabEntry.id, a.input!.vocabId)).get()!;
	const clean = sentences.map((s) => s.trim()).filter(Boolean);
	const missing = clean.filter((s) => !sentenceUsesWord(s, v.word));
	if (missing.length) return { ok: false, feedback: `Each sentence must use "${v.word}".` };
	const j = await judge('b3-use-it', { word: v.word, definition: (v.enrichment as any)?.definition, sentences: clean, language: v.lang }, { attemptId });
	const correctUse = j ? j.scores.meaning >= 4 && j.scores.collocation >= 3 && j.scores.naturalness >= 3 : false;
	const s = getSettings();
	const today = localDate();
	let stage = v.stage;
	let uses = v.productiveUses;
	let days = v.useDays;
	if (correctUse) {
		uses += 1;
		days = Array.from(new Set([...days, today]));
		if (uses >= s.graduateUses && days.length >= s.graduateDays) stage = 'active';
	}
	db.update(schema.vocabEntry)
		.set({ productiveUses: uses, useDays: days, stage, activatedAt: stage === 'active' && v.stage !== 'active' ? Date.now() : v.activatedAt })
		.where(eq(schema.vocabEntry.id, v.id))
		.run();
	finishAttempt(attemptId, {
		state: j ? 'done' : 'ungraded',
		input: { ...a.input, sentences: clean },
		metrics: { correctUse, uses, days: days.length },
		scores: j ? { VOC: j.score } : {},
		feedback: j ? { rubric: j.rubricId, version: j.rubricVersion, scores: j.scores, evidence: j.evidence, tips: j.tips, evalId: j.evalId } : { note: 'Not graded.' }
	});
	if (j) rate('VOC', a.lang, a.itemId, j.score / 100, attemptId);
	return { ok: true, attemptId, judge: j, correctUse, uses, days: days.length, graduated: stage === 'active' && v.stage !== 'active', goal: s.graduateUses, goalDays: s.graduateDays };
}

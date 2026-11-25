import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { sentenceUsesWord } from '$lib/core/text';
import { matchTranslation, isTrap, isCue, shapeHint } from '$lib/core/translate';
import { scoreA1 } from '$lib/core/scoring';
import { newId } from '$lib/core/ids';
import { db, schema } from '../db';
import { check } from '../judge/run';
import { getSettings } from '../settings';
import { chooseItem, getItem, startAttempt, getAttempt, patchAttempt, finishAttempt, rate, ensureCard, markSticky, countWhere, type ItemRow } from '../services';
import type { Lang } from '../db/schema';
import { PAUSED } from '$lib/content/paused';

// A8 — Translate it. The item's language is the language of the ANSWER: pt-PT items show an
// English cue and want Portuguese; en items show a Portuguese cue and want English.
// Same rules as A1: the answer stays on the server until it is found or revealed, and hints
// unlock only after the effort window.

/** Review asks for the exact answer, so only one-word translations go there; expressions stay in the game, where the model judges the meaning. */
export const reviewable = (target: string | null | undefined) => !!target && !/\s/.test(target.trim());

export const fromLang = (lang: string) => (lang === 'pt-PT' ? 'en' : 'pt-PT');
const LANG_NAME = (lang: string) => (lang === 'pt-PT' ? 'European Portuguese' : 'English');

export function publicItem(it: ItemRow) {
	const p = it.prompt;
	return { id: it.id, cue: p.cue as string, context: (p.context as string) || '', kind: p.kind as string, category: p.category as string, pos: it.pos, lang: it.lang, from: fromLang(it.lang), source: it.source };
}

export const HINT_LABELS_A8 = (lang: string) => [lang === 'pt-PT' ? 'In Portuguese' : 'In English', 'Shape', 'First sound', 'Ending'];

/** A generated hint that quotes the whole answer (short words like "bem") is not used. */
const givesAway = (hint: string | undefined, target: string) => !!hint && new RegExp(`["“«]-?${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-?["”»]`, 'i').test(hint);

export function hintText(it: ItemRow, level: number): string {
	const h = (it.prompt.hints ?? {}) as Record<string, any>;
	const pt = it.lang === 'pt-PT';
	const target = it.target ?? '';
	switch (level) {
		case 1:
			return (it.prompt.gapped as string) || shapeHint(target, it.lang, h.syllables, h.stress);
		case 2:
			return shapeHint(target, it.lang, h.syllables, h.stress);
		case 3:
			return (!givesAway(h.firstSound, target) && h.firstSound) || (pt ? `Começa por "${target.slice(0, 1)}"` : `Starts with "${target.slice(0, 1)}"`);
		case 4: {
			const last = (!givesAway(h.lastSound, target) && h.lastSound) || (pt ? `Acaba em "-${target.slice(-2)}"` : `Ends in "-${target.slice(-2)}"`);
			return h.similar && !givesAway(h.similar, target) ? `${last} · ${h.similar}` : last;
		}
		default:
			return target;
	}
}

export function start(lang: Lang, ctx: { dailySessionId?: string | null; itemId?: string } = {}) {
	if (PAUSED.A8) error(409, PAUSED.A8);
	const own = ctx.itemId ? getItem(ctx.itemId) : undefined;
	const it = own && own.active && own.exercise === 'A8' && own.lang === lang ? own : chooseItem('A8', lang, 'WR', { preferSources: ['missed'] });
	if (!it) error(404, `No translation items for ${lang}. Run the seed.`);
	const a = startAttempt({ exercise: 'A8', lang, itemId: it.id, dailySessionId: ctx.dailySessionId, input: { answers: [], states: [] } });
	return { attemptId: a.id, item: publicItem(it), effortWindowMs: getSettings().effortWindowSec * 1000, startedAt: a.startedAt };
}

type Input = { answers: any[]; states: any[]; revealed?: boolean; solvedAt?: number; nearMiss?: boolean; synonym?: string; awaitingSentence?: boolean; trapHit?: boolean; cueTyped?: boolean };

function load(attemptId: string) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'A8') error(404, 'attempt not found');
	if (a.finishedAt) error(409, 'attempt already finished');
	const it = getItem(a.itemId!)!;
	return { a, it, input: (a.input ?? {}) as Input };
}

export async function answer(attemptId: string, text: string) {
	const { a, it, input } = load(attemptId);
	if (input.awaitingSentence) error(409, 'write the sentence first');
	const p = it.prompt;
	const pt = it.lang === 'pt-PT';
	const m = matchTranslation(text, it.target!, (p.accept as string[]) ?? []);
	let verdict: 'correct' | 'synonym' | 'close' | 'trap' | 'cue' | 'wrong';
	let note = '';
	let flags: Partial<Input> = {};
	// An exact answer wins; then the cue and the trap, so a look-alike never passes as an inflection.
	if (m === 'exact') {
		verdict = 'correct';
	} else if (isCue(text, p.cue)) {
		verdict = 'cue';
		note = pt ? 'That is the English word. Find the Portuguese one.' : 'That is the Portuguese word. Find the English one.';
		flags = { cueTyped: true };
	} else if (isTrap(text, p.trap)) {
		verdict = 'trap';
		note = `"${text.trim()}" is the trap here: it looks right but is not what a Portuguese speaker says for this.`;
		flags = { trapHit: true };
	} else if (m === 'accent' || m === 'typo') {
		verdict = 'correct';
		note = `Spelling: "${it.target}".`;
	} else if (m === 'form') {
		// The sentence often needs an inflected form ("adiaram" for "adiar"): that is a full answer here.
		verdict = 'correct';
		note = `Dictionary form: "${it.target}".`;
	} else {
		const r = await check(
			'a8-check',
			z.object({ verdict: z.enum(['equal', 'close', 'brazilian', 'anglicism', 'wrong']), reason: z.string() }),
			`You check answers in a translation drill. The learner saw a ${LANG_NAME(fromLang(it.lang))} expression in a sentence and had to give its ${LANG_NAME(it.lang)} equivalent. Decide whether the learner's answer is an equally good, natural translation of the cue in this sentence ("equal"), related but less precise, a different sense or unidiomatic ("close"), a Brazilian Portuguese form where European Portuguese is required ("brazilian"), an English loanword or calque where a natural Portuguese word exists ("anglicism"), or not a translation ("wrong"). Be strict: "equal" only when a careful native speaker of ${LANG_NAME(it.lang)} would use it here. Reply as {"verdict": "equal" | "close" | "brazilian" | "anglicism" | "wrong", "reason": "one short sentence in English, addressed to the learner as you, that never reveals the target"}.`,
			{ cue: p.cue, sentence: p.context, target: it.target, accepted: p.accept, answer: text },
			{ attemptId }
		);
		verdict = r?.verdict === 'equal' ? 'synonym' : r?.verdict === 'wrong' || !r ? 'wrong' : 'close';
		note = r?.reason ?? '';
		if ([it.target!, ...((p.accept as string[]) ?? [])].some((w) => w && sentenceUsesWord(note, w))) note = '';
		if (r?.verdict === 'brazilian') note = `That is the Brazilian form. ${note}`;
		if (r?.verdict === 'anglicism') note = `That is borrowed from English. ${note}`;
		if (verdict === 'synonym') note = `Accepted as an equally good translation. The intended one was "${it.target}".`;
	}
	const answers = [...input.answers, { text, at: Date.now() - a.startedAt, verdict }];
	const solved = verdict === 'correct' || verdict === 'synonym';
	if (!solved) {
		patchAttempt(attemptId, { input: { ...input, ...flags, answers } });
		return { verdict, note, done: false };
	}
	const nextInput = { ...input, answers, solvedAt: Date.now() - a.startedAt, synonym: verdict === 'synonym' ? text : undefined };
	if (a.hintsUsed > 0) {
		patchAttempt(attemptId, { input: { ...nextInput, awaitingSentence: true } });
		return { verdict, note, done: false, needSentence: true, target: it.target };
	}
	return { verdict, note, done: true, result: finalize(attemptId, nextInput) };
}

export function markState(attemptId: string, state: 'tot' | 'dont_know') {
	const { a, input } = load(attemptId);
	patchAttempt(attemptId, { input: { ...input, states: [...input.states, { state, at: Date.now() - a.startedAt }] } });
	const remaining = Math.max(0, a.startedAt + getSettings().effortWindowSec * 1000 - Date.now());
	return { ok: true, hintsInMs: remaining };
}

export function hint(attemptId: string, giveUp = false) {
	const { a, it, input } = load(attemptId);
	if (input.awaitingSentence) error(409, 'write the sentence first');
	const windowEnd = a.startedAt + getSettings().effortWindowSec * 1000;
	if (!giveUp && Date.now() < windowEnd) error(425, `Keep trying for ${Math.ceil((windowEnd - Date.now()) / 1000)} more seconds`);
	const level = giveUp ? 5 : a.hintsUsed + 1;
	if (level >= 5) {
		patchAttempt(attemptId, { input: { ...input, revealed: true, awaitingSentence: true, revealedAt: Date.now() - a.startedAt } as any });
		return { level: 5, label: 'Reveal', text: it.target!, reveal: true, needSentence: true };
	}
	patchAttempt(attemptId, { hintsUsed: level });
	return { level, label: HINT_LABELS_A8(it.lang)[level - 1], text: hintText(it, level), reveal: false };
}

export async function sentence(attemptId: string, text: string) {
	const { it, input } = load(attemptId);
	if (!input.awaitingSentence) error(409, 'no sentence needed');
	const word = input.synonym ?? it.target!;
	if (!sentenceUsesWord(text, word) && !sentenceUsesWord(text, it.target!)) return { ok: false, feedback: `Use "${it.target}" in the sentence.` };
	if (text.trim().split(/\s+/).length < 4) return { ok: false, feedback: 'Write a full sentence of your own (at least four words).' };
	const r = await check(
		'a8-sentence',
		z.object({ ok: z.boolean(), feedback: z.string() }),
		`A learner just retrieved a ${LANG_NAME(it.lang)} expression as the translation of "${it.prompt.cue}" and wrote an original sentence with it. Check that the expression is used with that meaning and that the sentence is grammatical ${LANG_NAME(it.lang)}${it.lang === 'pt-PT' ? ' (Portugal, not Brazil)' : ''}. ok=false only for a real misuse. Reply as {"ok": true | false, "feedback": "one short sentence in English, specific"}.`,
		{ expression: it.target, meaning_of: it.prompt.cue, sentence: text },
		{ attemptId }
	);
	if (r && !r.ok) return { ok: false, feedback: r.feedback };
	return { ok: true, feedback: r?.feedback ?? '', result: finalize(attemptId, { ...input, awaitingSentence: false, sentence: text } as any) };
}

function finalize(attemptId: string, input: any) {
	const a = getAttempt(attemptId)!;
	if (a.finishedAt) error(409, 'attempt already finished'); // a second request raced past load() during the model call
	const it = getItem(a.itemId!)!;
	const s = getSettings();
	const revealed = !!input.revealed;
	const solved = !revealed && input.solvedAt != null;
	const tot = (input.states ?? []).some((x: any) => x.state === 'tot');
	const score = scoreA1({ solved, nearMiss: false, hintsUsed: a.hintsUsed, revealed }, s.hintPenalty);
	const state = revealed ? 'revealed' : input.synonym ? 'synonym' : 'correct';
	const metrics = {
		tot,
		dontKnow: (input.states ?? []).some((x: any) => x.state === 'dont_know'),
		latencyMs: input.solvedAt ?? null,
		hints: a.hintsUsed,
		revealed,
		wrongAnswers: (input.answers ?? []).filter((x: any) => !['correct', 'synonym'].includes(x.verdict)).length,
		trapHit: !!input.trapHit,
		cueTyped: !!input.cueTyped,
		kind: it.prompt.kind,
		category: it.prompt.category,
		pos: it.pos,
		source: it.source
	};
	finishAttempt(attemptId, { state, input, metrics, scores: { WR: score } });
	const rating = rate('WR', a.lang, it.id, score / 100, attemptId);
	let card = null;
	if ((tot || a.hintsUsed > 0 || revealed || input.trapHit) && reviewable(it.target)) {
		card = ensureCard(it.id, [tot ? 'tot_item' : 'a8_missed']);
		const priorMisses = countWhere('attempt', "item_id = ? AND (json_extract(metrics, '$.revealed') = 1 OR json_extract(metrics, '$.hints') > 0)", it.id);
		if (priorMisses >= 2) markSticky(it.id);
	}
	const p = it.prompt;
	const trap = p.trap && !isCue(p.trap, p.cue) ? p.trap : '';
	return { score, state, metrics, target: it.target, accept: p.accept ?? [], cue: p.cue, note: p.note ?? '', trap, rating, addedToDeck: !!card };
}

// ---------------- a real miss, captured ----------------

const Capture = z.object({
	context: z.string(),
	target: z.string().trim().min(1),
	accept: z.array(z.string()).max(6),
	gapped: z.string(),
	trap: z.string(),
	note: z.string(),
	kind: z.enum(['word', 'phrase', 'idiom']).catch('word'),
	pos: z.string(),
	firstSound: z.string(),
	similar: z.string(),
	lastSound: z.string()
});

/**
 * The word came in one language and not the other: turn it into an A8 item, and a review card when the answer is one word.
 * The answer is stored, never returned: the caller sends the learner straight into an attempt.
 */
export async function captureMiss(p: { cue: string; context?: string; lang: Lang }) {
	const cue = p.cue.trim();
	if (!cue) error(400, 'Write the word that came to mind.');
	const target = p.lang;
	const from = fromLang(target);
	const r = await check(
		'a8-capture',
		Capture,
		`A learner could only find the ${LANG_NAME(from)} expression "${cue}" while speaking ${LANG_NAME(target)}. Make a translation-drill item. Return: context (one natural ${LANG_NAME(from)} sentence under 18 words using "${cue}" verbatim, close in meaning to the learner's sentence if one is given, and never containing the answer), target (the most natural ${LANG_NAME(target)} rendering in that sentence, dictionary form: infinitive, singular, no article), accept (other equally natural renderings, often empty), gapped (the ${LANG_NAME(target)} translation of the sentence with the target replaced by ___), trap (a tempting false friend or calque in ${LANG_NAME(target)}, never the cue itself, or ""), note (one short English sentence on a nuance worth remembering, or ""), kind (word|phrase|idiom), pos (noun|verb|adj|adv|other), firstSound (e.g. ${target === 'pt-PT' ? 'começa por "pra-"' : 'starts with "pra-"'}, at most the first syllable), similar (e.g. ${target === 'pt-PT' ? 'rima com "braço"' : 'rhymes with "spine"'}: a real word that rhymes or sounds like the target or its key word, not a synonym and not itself a word of the target), lastSound (e.g. ${target === 'pt-PT' ? 'termina em "-azo"' : 'ends in "-ine"'}). Hints in ${LANG_NAME(target)}. European Portuguese means Portugal's norm and post-1990 spelling, never Brazilian forms.`,
		{ cue, sentence: p.context?.trim() ?? '' },
		{ maxTokens: 900 }
	);
	if (!r) error(503, 'The model is switched off or unavailable, so the translation could not be prepared. Try again later.');
	// The context is shown before the attempt, so it must not contain the answer.
	const context = [r.target, ...r.accept].some((w) => w.trim() && sentenceUsesWord(r.context, w)) ? '' : r.context.trim();
	const id = newId('mis');
	db.insert(schema.item)
		.values({
			id,
			exercise: 'A8',
			lang: target,
			target: r.target.trim(),
			prompt: {
				cue,
				context,
				gapped: r.gapped.trim(),
				trap: r.trap.trim(),
				note: r.note.trim(),
				kind: r.kind,
				category: 'your misses',
				accept: r.accept.filter((x) => x.trim()),
				hints: { firstSound: r.firstSound, similar: r.similar, lastSound: r.lastSound },
				...reviewFields(cue, context, r.gapped, target)
			},
			pos: r.pos || null,
			rating: 1500,
			rd: 250,
			vol: 0.06,
			source: 'missed',
			parallelSet: 0,
			active: true
		})
		.run();
	if (reviewable(r.target)) ensureCard(id, ['missed']);
	return id;
}

/** Review (B2) reads `definition` and `example`; for a translation they are the cue and the gapped sentence. */
export function reviewFields(cue: string, context: string, gapped: string, lang: string) {
	const c = context.trim();
	const definition = lang === 'pt-PT' ? `In Portuguese: “${cue}”${c ? `, as in “${c}”` : ''}` : `Em inglês: “${cue}”${c ? `, como em “${c}”` : ''}`;
	return { definition, example: gapped.trim() };
}

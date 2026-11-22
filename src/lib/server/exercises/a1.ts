import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { matchAnswer, sentenceUsesWord } from '$lib/core/text';
import { scoreA1 } from '$lib/core/scoring';
import { check } from '../judge/run';
import { getSettings } from '../settings';
import { chooseItem, recentItems, getItem, startAttempt, getAttempt, patchAttempt, finishAttempt, rate, ensureCard, markSticky, countWhere, type ItemRow } from '../services';
import type { Lang } from '../db/schema';

// A1 — Definition → Word. The answer never reaches the browser before the reveal,
// and hints unlock only after the effort window (P2).

export function publicItem(it: ItemRow) {
	return { id: it.id, definition: it.prompt.definition as string, example: (it.prompt.example as string) || '', pos: it.pos, lang: it.lang, source: it.source };
}

export function hintText(it: ItemRow, level: number): string {
	const h = (it.prompt.hints ?? {}) as Record<string, any>;
	const pt = it.lang === 'pt-PT';
	const target = it.target ?? '';
	switch (level) {
		case 1: {
			if (!h.syllables) return pt ? `${target.length} letras` : `${target.length} letters`;
			const n = h.syllables;
			const s = h.stress;
			return pt
				? `${n} sílaba${n === 1 ? '' : 's'}${s ? `, acento na ${s}.ª` : ''}`
				: `${n} syllable${n === 1 ? '' : 's'}${s ? `, stress on syllable ${s}` : ''}`;
		}
		case 2:
			return h.firstSound || (pt ? `Começa por "${target.slice(0, 1)}"` : `Starts with "${target.slice(0, 1)}"`);
		case 3:
			return h.similar || (pt ? `Tem ${target.length} letras` : `${target.length} letters long`);
		case 4:
			return h.lastSound || (pt ? `Acaba em "-${target.slice(-2)}"` : `Ends in "-${target.slice(-2)}"`);
		default:
			return target;
	}
}

export const HINT_LABELS = ['Syllables and stress', 'First sound', 'Sounds like', 'Last sound', 'Reveal'];

export function start(lang: Lang, ctx: { dailySessionId?: string | null; benchmarkRunId?: string | null; parallelSet?: number; itemId?: string } = {}) {
	const it = ctx.itemId ? getItem(ctx.itemId) : chooseItem('A1', lang, 'WR', { parallelSet: ctx.parallelSet, preferSources: ['tot_log', 'inbox'] });
	if (!it) error(404, `No A1 items for ${lang}. Run the seed.`);
	const a = startAttempt({ exercise: 'A1', lang, itemId: it.id, dailySessionId: ctx.dailySessionId, benchmarkRunId: ctx.benchmarkRunId, input: { answers: [], states: [] } });
	return { attemptId: a.id, item: publicItem(it), effortWindowMs: getSettings().effortWindowSec * 1000, startedAt: a.startedAt };
}

/**
 * Cross-language play: the definition is read in `defLang` and the word is
 * answered in `lang`. Every practice card has a matching card in the other language (prompt.pair);
 * the shown card's id is the concept, so a second answer language reuses the same definition.
 */
export function startCross(defLang: Lang, lang: Lang, ctx: { dailySessionId?: string | null; conceptId?: string } = {}) {
	const answerOf = (c: ItemRow) => (lang === defLang ? c : getItem(c.prompt.pair as string));
	// The shown definition and example must not contain the matching word (cognates such as "volume"),
	// whichever language is answered, so both steps of a two-language round keep the same card.
	const fair = (c: ItemRow) => {
		const a = c.prompt.pair ? getItem(c.prompt.pair as string) : undefined;
		if (!a) return false;
		const text = `${c.prompt.definition ?? ''} ${c.prompt.example ?? ''}`;
		return ![a.target ?? '', ...((a.prompt.accept as string[]) ?? [])].some((w) => w && sentenceUsesWord(text, w));
	};
	let shown = ctx.conceptId ? getItem(ctx.conceptId) : undefined;
	if (shown && (shown.exercise !== 'A1' || shown.lang !== defLang || !shown.prompt.pair || !fair(shown))) shown = undefined;
	if (!shown) {
		// The answer card should be fresh too: skip concepts whose answer card was played recently.
		const recent = lang === defLang ? new Set<string>() : recentItems('A1', lang, 14);
		const where = (c: ItemRow) => !!c.prompt.pair && !recent.has(c.prompt.pair as string) && fair(c);
		shown = chooseItem('A1', defLang, 'WR', { where }) ?? chooseItem('A1', defLang, 'WR', { where: (c) => !!c.prompt.pair && fair(c) });
	}
	if (!shown) error(404, `No cards with a match in both languages yet. Run the seed.`);
	const it = answerOf(shown);
	if (!it) error(404, 'This card has no match in the other language.');
	const a = startAttempt({ exercise: 'A1', lang, itemId: it.id, dailySessionId: ctx.dailySessionId, input: { answers: [], states: [], shownDef: shown.id } });
	return {
		attemptId: a.id,
		conceptId: shown.id,
		item: { ...publicItem(it), definition: shown.prompt.definition as string, example: (shown.prompt.example as string) || '', defLang },
		effortWindowMs: getSettings().effortWindowSec * 1000,
		startedAt: a.startedAt
	};
}

function load(attemptId: string) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'A1') error(404, 'attempt not found');
	if (a.finishedAt) error(409, 'attempt already finished');
	const it = getItem(a.itemId!)!;
	return { a, it, input: (a.input ?? {}) as { answers: any[]; states: any[]; revealed?: boolean; solvedAt?: number; nearMiss?: boolean; synonym?: string; awaitingSentence?: boolean } };
}

export async function answer(attemptId: string, text: string) {
	const { a, it, input } = load(attemptId);
	if (input.awaitingSentence) error(409, 'write the sentence first');
	const m = matchAnswer(text, it.target!, (it.prompt.accept as string[]) ?? []);
	let verdict: 'correct' | 'near_miss' | 'synonym' | 'close' | 'wrong';
	let note = '';
	if (m === 'exact' || m === 'accent' || m === 'typo') {
		verdict = 'correct';
		if (m !== 'exact') note = `Spelling: "${it.target}".`;
	} else if (m === 'form') {
		verdict = 'near_miss';
		note = `Right word, different form: "${it.target}".`;
	} else {
		const r = await check(
			'a1-synonym',
			z.object({ verdict: z.enum(['equal', 'close', 'wrong']), reason: z.string() }),
			`You check answers to a definition-to-word exercise. Decide whether the learner's answer fits the definition EQUALLY well as the target word ("equal"), is related but less precise or a different sense ("close"), or does not fit ("wrong"). Be strict: "equal" only when a careful writer could use either word for this definition. Language: ${it.lang === 'pt-PT' ? 'European Portuguese' : 'English'}. Never reveal the target in the reason.`,
			{ definition: it.prompt.definition, example: it.prompt.example, target: it.target, answer: text },
			{ attemptId }
		);
		verdict = r?.verdict === 'equal' ? 'synonym' : r?.verdict === 'close' ? 'close' : 'wrong';
		note = r?.reason ?? '';
		if (verdict === 'synonym') note = `Accepted as an equally good fit. The intended word was "${it.target}".`;
	}
	const answers = [...input.answers, { text, at: Date.now() - a.startedAt, verdict }];
	const solved = verdict === 'correct' || verdict === 'near_miss' || verdict === 'synonym';
	if (!solved) {
		patchAttempt(attemptId, { input: { ...input, answers } });
		return { verdict, note, done: false };
	}
	const nextInput = { ...input, answers, solvedAt: Date.now() - a.startedAt, nearMiss: verdict === 'near_miss', synonym: verdict === 'synonym' ? text : undefined };
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
	return { level, label: HINT_LABELS[level - 1], text: hintText(it, level), reveal: false };
}

export async function sentence(attemptId: string, text: string) {
	const { it, input } = load(attemptId);
	if (!input.awaitingSentence) error(409, 'no sentence needed');
	const word = input.synonym ?? it.target!;
	if (!sentenceUsesWord(text, word) && !sentenceUsesWord(text, it.target!)) return { ok: false, feedback: `Use "${it.target}" in the sentence.` };
	if (text.trim().split(/\s+/).length < 4) return { ok: false, feedback: 'Write a full sentence of your own (at least four words).' };
	const r = await check(
		'a1-sentence',
		z.object({ ok: z.boolean(), feedback: z.string() }),
		`A learner just retrieved a word and wrote an original sentence with it. Check that the word is used with the meaning of the definition and in a grammatical way. ok=false only for a real misuse. feedback: one short sentence, specific. Language: ${it.lang === 'pt-PT' ? 'European Portuguese' : 'English'}.`,
		{ word: it.target, definition: it.prompt.definition, sentence: text },
		{ attemptId }
	);
	if (r && !r.ok) return { ok: false, feedback: r.feedback };
	return { ok: true, feedback: r?.feedback ?? '', result: finalize(attemptId, { ...input, awaitingSentence: false, sentence: text } as any) };
}

function finalize(attemptId: string, input: any) {
	const a = getAttempt(attemptId)!;
	if (a.finishedAt) error(409, 'attempt already finished');
	const it = getItem(a.itemId!)!;
	const s = getSettings();
	const revealed = !!input.revealed;
	const solved = !revealed && input.solvedAt != null;
	const tot = (input.states ?? []).some((x: any) => x.state === 'tot');
	const dontKnow = (input.states ?? []).some((x: any) => x.state === 'dont_know');
	const score = scoreA1({ solved, nearMiss: !!input.nearMiss, hintsUsed: a.hintsUsed, revealed }, s.hintPenalty);
	const state = revealed ? 'revealed' : input.synonym ? 'synonym' : input.nearMiss ? 'near_miss' : 'correct';
	const metrics = {
		tot,
		dontKnow,
		selfResolvedTot: tot && solved && a.hintsUsed === 0,
		latencyMs: input.solvedAt ?? null,
		hints: a.hintsUsed,
		revealed,
		wrongAnswers: (input.answers ?? []).filter((x: any) => x.verdict === 'wrong' || x.verdict === 'close').length,
		pos: it.pos,
		band: it.band,
		concreteness: it.concreteness,
		source: it.source
	};
	finishAttempt(attemptId, { state, input, metrics, scores: { WR: score } });
	const rating = a.benchmarkRunId ? null : rate('WR', a.lang, it.id, score / 100, attemptId);
	let card = null;
	if (!a.benchmarkRunId && (tot || a.hintsUsed > 0 || revealed)) {
		card = ensureCard(it.id, [tot ? 'tot_item' : 'a1_hinted']);
		const priorTots = countWhere('attempt', "item_id = ? AND json_extract(metrics, '$.tot') = 1", it.id);
		if (priorTots >= 2) markSticky(it.id);
	}
	return { score, state, metrics, target: it.target, definition: it.prompt.definition, rating, addedToDeck: !!card };
}

import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { fluencyMetrics } from '$lib/core/fluency';
import { scoreFluency } from '$lib/core/scoring';
import { normWord } from '$lib/core/text';
import { check } from '../judge/run';
import { chooseItem, getItem, startAttempt, getAttempt, finishAttempt, hasLexicon, rate, zipfOf } from '../services';
import { sqlite } from '../db';
import type { Lang } from '../db/schema';

export const A2_SECONDS = 60;

export function start(lang: Lang, ctx: { kind?: 'semantic' | 'letter'; exclude?: string[]; dailySessionId?: string | null; benchmarkRunId?: string | null; parallelSet?: number; itemId?: string } = {}) {
	let it = ctx.itemId ? getItem(ctx.itemId) : undefined;
	if (!it) it = chooseItem('A2', lang, 'FL', { parallelSet: ctx.parallelSet, exclude: ctx.exclude, where: ctx.kind ? (x) => x.prompt.kind === ctx.kind : undefined });
	if (!it) error(404, `No A2 prompts for ${lang}. Run the seed.`);
	const a = startAttempt({ exercise: 'A2', lang, itemId: it.id, dailySessionId: ctx.dailySessionId, benchmarkRunId: ctx.benchmarkRunId });
	return { attemptId: a.id, itemId: it.id, kind: it.prompt.kind as 'semantic' | 'letter', prompt: it.prompt.prompt as string, lang, seconds: A2_SECONDS };
}

/** The benchmark sprint opened but not finished, so a reload returns to it instead of moving on. */
export function pendingBenchmark(runId: string) {
	const r = sqlite.prepare("SELECT id FROM attempt WHERE benchmark_run_id = ? AND exercise = 'A2' AND finished_at IS NULL ORDER BY started_at DESC LIMIT 1").get(runId) as { id: string } | undefined;
	if (!r) return null;
	const a = getAttempt(r.id)!;
	const it = getItem(a.itemId!)!;
	return { attemptId: a.id, itemId: it.id, kind: it.prompt.kind as 'semantic' | 'letter', prompt: it.prompt.prompt as string, lang: a.lang, seconds: A2_SECONDS };
}

export async function submit(attemptId: string, words: string[], elapsedMs: number) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'A2' || a.finishedAt) error(404, 'attempt not found');
	const it = getItem(a.itemId!)!;
	const kind = it.prompt.kind as 'semantic' | 'letter';
	const uniq = Array.from(new Set(words.map(normWord).filter(Boolean)));
	let semantic: Record<string, { valid: boolean; subcategory?: string }> | undefined;
	let validated = true;
	if (kind === 'semantic' && uniq.length) {
		const r = await check(
			'a2-validate',
			z.preprocess(
				(v: any) => (v && typeof v === 'object' && !('words' in v) ? { words: v } : v),
				z.object({ words: z.record(z.string(), z.object({ valid: z.boolean(), subcategory: z.string().nullish() })) })
			).refine((v: any) => {
				const judged = new Set(Object.keys(v.words).map(normWord));
				return uniq.every((w) => judged.has(w));
			}, 'Give a verdict for every word'),
			`You score a semantic verbal-fluency task. For each word, decide whether it is a real ${a.lang === 'pt-PT' ? 'European Portuguese' : 'English'} word that belongs to the category (valid), allowing reasonable interpretations and minor misspellings. For valid words, give a short subcategory label (2-3 words) so that words of the same subcategory share exactly the same label (e.g. for "animals": "pets", "farm animals", "african animals", "birds", "sea animals"). Keep the input words exactly as keys. Reply as {"words": {"<word>": {"valid": true, "subcategory": "<label>"}, "<word>": {"valid": false}}}.`,
			{ category: it.prompt.prompt, words: uniq },
			{ attemptId }
		);
		if (r) semantic = Object.fromEntries(Object.entries(r.words).map(([k, v]) => [normWord(k), { valid: v.valid, subcategory: v.subcategory ?? undefined }]));
		else {
			validated = false;
			semantic = Object.fromEntries(uniq.map((w) => [w, { valid: true }]));
		}
	}
	// A letter round is checked against the word list. Without one, its words cannot be judged either way.
	const canCheckLetter = kind !== 'letter' || hasLexicon(a.lang);
	if (!canCheckLetter) validated = false;
	const m = fluencyMetrics({ words, kind, letter: kind === 'letter' ? (it.prompt.prompt as string) : undefined, semantic, isWord: (w) => !canCheckLetter || zipfOf(w, a.lang) != null });
	const baseline = (
		sqlite
			.prepare(
				`SELECT json_extract(a.metrics, '$.valid') v FROM attempt a JOIN item i ON i.id = a.item_id
				 WHERE a.exercise = 'A2' AND a.lang = ? AND json_extract(i.prompt, '$.kind') = ? AND a.finished_at IS NOT NULL AND a.id != ?
				 AND COALESCE(json_extract(a.metrics, '$.validated'), 1) = 1
				 ORDER BY a.started_at DESC LIMIT 10`
			)
			.all(a.lang, kind, attemptId) as { v: number }[]
	).map((r) => r.v);
	// An unchecked round is practice: it has no score, and it never moves a rating, a baseline or a benchmark.
	const score = validated ? scoreFluency(m.valid, baseline) : null;
	const baselineMean = baseline.length ? +(baseline.reduce((x, y) => x + y, 0) / baseline.length).toFixed(1) : null;
	finishAttempt(attemptId, { state: 'done', input: { words }, timings: { elapsedMs }, metrics: { ...m, kind, prompt: it.prompt.prompt, baselineMean, validated }, scores: score == null ? {} : { FL: score } });
	if (score != null && !a.benchmarkRunId) rate('FL', a.lang, it.id, score / 100, attemptId);
	return { score, metrics: m, baselineMean, baselineN: baseline.length, validated, kind, prompt: it.prompt.prompt };
}

/** A prompt skipped before the sprint began was never practised: forget the attempt so it stays in the roster. */
export function skip(attemptId: string) {
	const a = getAttempt(attemptId);
	if (a && a.exercise === 'A2' && !a.finishedAt && !a.benchmarkRunId) sqlite.prepare('DELETE FROM attempt WHERE id = ?').run(attemptId);
	return { ok: true };
}

import { error } from '@sveltejs/kit';
import { objective } from './a4-objective';
import { scoreA4 } from '$lib/core/scoring';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { judge, check } from '../judge/run';
import { db, schema } from '../db';
import { chooseItem, getItem, startAttempt, getAttempt, finishAttempt, rate } from '../services';
import type { Lang } from '../db/schema';

export function start(lang: Lang, ctx: { dailySessionId?: string | null; benchmarkRunId?: string | null; parallelSet?: number } = {}) {
	const it = chooseItem('A4', lang, 'PR', { parallelSet: ctx.parallelSet });
	if (!it) error(404, `No A4 items for ${lang}. Run the seed.`);
	const a = startAttempt({ exercise: 'A4', lang, itemId: it.id, dailySessionId: ctx.dailySessionId, benchmarkRunId: ctx.benchmarkRunId });
	return { attemptId: a.id, sentence: it.prompt.sentence as string, target: it.target!, register: it.prompt.register as string, n: 5, lang };
}

export async function submit(attemptId: string, body: { alternatives: string[]; pick: string; justification: string }) {
	const a = getAttempt(attemptId);
	if (!a || a.exercise !== 'A4' || a.finishedAt) error(404, 'attempt not found');
	const it = getItem(a.itemId!)!;
	const alternatives = body.alternatives.map((s) => s.trim()).filter(Boolean);
	const obj = objective(alternatives, it.target!);
	const latencyMs = Date.now() - a.startedAt;
	const [j, reference] = await Promise.all([
		judge(
			'a4-synonym-ladder',
			{ sentence: it.prompt.sentence, flat_word: it.target, register: it.prompt.register, alternatives, pick: body.pick, justification: body.justification, language: a.lang },
			{ attemptId }
		),
		referenceFor(it)
	]);
	const score = j ? scoreA4(j.score, obj) : null;
	finishAttempt(attemptId, {
		state: j ? 'done' : 'ungraded',
		input: { alternatives, pick: body.pick, justification: body.justification },
		timings: { latencyMs },
		metrics: { ...obj, latencyMs, register: it.prompt.register },
		scores: score != null ? { PR: score } : {},
		feedback: j ? { rubric: j.rubricId, version: j.rubricVersion, scores: j.scores, evidence: j.evidence, tips: j.tips, evalId: j.evalId } : { note: 'Not graded: the judge is off or unavailable.' }
	});
	if (score != null && !a.benchmarkRunId) rate('PR', a.lang, it.id, score / 100, attemptId);
	return { attemptId, score, objective: obj, judge: j, reference };
}

const Reference = z.object({
	alternatives: z
		.array(z.object({ word: z.string(), nuance: z.string(), fits: z.boolean().default(true) }))
		.min(4)
		.max(10),
	best: z.object({ word: z.string(), why: z.string() })
});
export type ReferenceT = z.infer<typeof Reference>;

/** Model answer to learn from: generated once per item, then cached on the item. */
export async function referenceFor(it: NonNullable<ReturnType<typeof getItem>>): Promise<ReferenceT | null> {
	if (it.prompt.reference) return it.prompt.reference as ReferenceT;
	const L = it.lang === 'pt-PT' ? 'European Portuguese (never Brazilian forms)' : 'English';
	const r = await check(
		'a4-reference',
		Reference,
		`You are a precise ${L} writing coach. For the flat word in the sentence, list 6 to 8 alternatives a skilled writer might consider, in ${L}, each with a one-line nuance (what it adds or claims: strength, register, connotation, grammar pattern). Mark fits=false for tempting words that break this sentence's grammar or meaning, and say why in the nuance. Include rewrites of the phrase when the flat word cannot be swapped one-for-one (e.g. "made X unavailable" → "left X unavailable", "rendered X unavailable"). Then give the single best choice for this sentence and register, with why. Write nuances in ${L}. Reply exactly in this shape: {"alternatives": [{"word": "<word or short phrase>", "nuance": "<one line>", "fits": true}], "best": {"word": "<word>", "why": "<one line>"}}`,
		{ sentence: it.prompt.sentence, flat_word: it.target, register: it.prompt.register },
		{ maxTokens: 1500 }
	);
	if (r) db.update(schema.item).set({ prompt: { ...it.prompt, reference: r } }).where(eq(schema.item.id, it.id)).run();
	return r;
}

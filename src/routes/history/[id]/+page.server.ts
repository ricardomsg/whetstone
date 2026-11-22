import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { historyItem } from '$lib/server/history';

export const load = ({ params }) => {
	const h = historyItem(params.id);
	if (!h) error(404, 'not found');
	const r = h.raw;
	const parse = (s: string | null) => (s ? JSON.parse(s) : null);
	// An open attempt must not leak its answer: accepted forms, hints and translation notes stay hidden too.
	const prompt = parse(r.item_prompt);
	if (prompt && !r.finished_at) for (const k of ['accept', 'hints', 'gapped', 'example', 'note', 'trap']) delete prompt[k];
	const note = r.exercise === 'D1' ? db.select().from(schema.resumeNote).where(eq(schema.resumeNote.attemptId, r.id)).get() : null;
	const threadReference = r.finished_at && ['C2', 'C3'].includes(r.exercise) ? db.select().from(schema.threadPractice).where(eq(schema.threadPractice.attemptId, r.id)).get()?.points : null;
	return {
		row: h.row,
		// The answer is shown only once the attempt is finished, so an open attempt can still be completed honestly.
		target: r.finished_at ? r.target : null,
		flat: r.exercise === 'A4' ? r.target : null,
		itemId: r.item_id,
		prompt,
		input: parse(r.input) ?? {},
		metrics: parse(r.metrics) ?? {},
		feedback: parse(r.feedback),
		scores: parse(r.scores) ?? {},
		note,
		threadReference,
		evals: r.finished_at ? db.select().from(schema.judgeEval).where(eq(schema.judgeEval.attemptId, params.id)).all() : [],
		overrides: db.select().from(schema.scoreOverride).where(eq(schema.scoreOverride.attemptId, params.id)).all()
	};
};

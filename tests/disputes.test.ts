import { expect, it } from 'vitest';
import { db, schema } from '../src/lib/server/db';
import { disputeAnalytics } from '../src/lib/server/analytics';

it('uses unique successfully judged attempts, with a denominator for each criterion', () => {
	const now = Date.now();
	for (const id of ['one', 'two', 'other', 'ungraded', 'failed', 'unfinished', 'old']) {
		db.insert(schema.attempt).values({ id, exercise: id === 'other' ? 'D2' : 'A4', lang: 'en', startedAt: id === 'old' ? now - 40 * 86400_000 : now, finishedAt: id === 'unfinished' ? null : now }).run();
	}
	for (const [id, attemptId, rubricId, ok, scores] of [
		['j1', 'one', 'a4', true, { clarity: 3, precision: 4 }],
		['j2', 'one', 'a4', true, { clarity: 3, precision: 4 }],
		['j3', 'two', 'a4', true, { clarity: 3 }],
		['j4', 'failed', 'a4', false, { clarity: 3 }],
		['j5', 'ungraded', null, true, { clarity: 3 }],
		['j6', 'unfinished', 'a4', true, { clarity: 3 }],
		['j7', 'old', 'a4', true, { clarity: 3 }],
		['j8', 'other', 'd2', true, { retrospective: 4 }]
	] as const) {
		db.insert(schema.judgeEval).values({ id, attemptId, rubricId, purpose: 'test', ok, parsed: { scores }, provider: 'test', model: 'test', promptHash: 'test' }).run();
	}
	for (const [id, attemptId, criterion] of [['o1', 'one', 'precision'], ['o2', 'one', 'precision'], ['o3', 'other', '_score'], ['o4', 'ungraded', '_score'], ['o5', 'old', 'clarity']]) {
		db.insert(schema.scoreOverride).values({ id, attemptId, criterion, newScore: 5 }).run();
	}
	expect(disputeAnalytics(28)).toEqual([
		{ exercise: 'A4', judged: 2, disputed: 1, rate: 0.5, criteria: [
			{ exercise: 'A4', criterion: 'clarity', judged: 2, disputed: 0, rate: 0 },
			{ exercise: 'A4', criterion: 'precision', judged: 1, disputed: 1, rate: 1 }
		] },
		{ exercise: 'D2', judged: 1, disputed: 1, rate: 1, criteria: [{ exercise: 'D2', criterion: 'retrospective', judged: 1, disputed: 0, rate: 0 }] }
	]);
});

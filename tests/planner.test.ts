import { beforeEach, expect, it } from 'vitest';
import { db, schema } from '../src/lib/server/db';
import { stepProgress } from '../src/lib/server/planner';

beforeEach(() => db.delete(schema.attempt).run());

it('counts both languages together while keeping single-language progress separate', () => {
	const rows = [
		{ id: 'en1', exercise: 'B2', lang: 'en' as const },
		{ id: 'en2', exercise: 'B2', lang: 'en' as const },
		{ id: 'pt', exercise: 'B2', lang: 'pt-PT' as const },
		{ id: 'other-drill', exercise: 'A1', lang: 'pt-PT' as const },
		{ id: 'unfinished', exercise: 'B2', lang: 'en' as const, finishedAt: null },
		{ id: 'other-session', exercise: 'B2', lang: 'en' as const, dailySessionId: 'yesterday' }
	];
	db.insert(schema.attempt).values(rows.map((r) => ({ startedAt: 1, finishedAt: 2, dailySessionId: 'today', ...r }))).run();
	expect(stepProgress('today')).toEqual({ 'B2:en': 2, 'B2:pt-PT': 1, 'B2:mixed': 3, 'A1:pt-PT': 1, 'A1:mixed': 1 });
	expect(stepProgress('empty')).toEqual({});
});

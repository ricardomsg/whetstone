import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { db, schema, sqlite } from '../src/lib/server/db';
import { env } from '../src/lib/server/env';
import { skillTrends, streak } from '../src/lib/server/analytics';

const zone = env.timezone;
const attempt = (id: string, at: string) =>
	db.insert(schema.attempt).values({ id, exercise: 'A1', lang: 'en', startedAt: Date.parse(at), finishedAt: Date.parse(at), scores: { WR: 80 } } as any).run();

beforeEach(() => {
	sqlite.prepare('DELETE FROM attempt').run();
	env.timezone = 'Europe/Lisbon';
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(new Date('2026-03-29T23:30:00Z')); // 00:30 on 30 March in Lisbon, the day after the clocks went forward
});

afterEach(() => {
	vi.useRealTimers();
	env.timezone = zone;
});

it('keeps every calendar day in a trend across a clock change', () => {
	attempt('a', '2026-03-29T12:00:00Z');
	expect(skillTrends(3).WR.map((d) => d.date)).toEqual(['2026-03-28', '2026-03-29', '2026-03-30']);
});

it('keeps a streak across a clock change', () => {
	attempt('a', '2026-03-29T12:00:00Z');
	attempt('b', '2026-03-29T23:15:00Z');
	expect(streak()).toBe(2);
});

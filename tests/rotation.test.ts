import { describe, it, expect } from 'vitest';
import { selectFresh } from '../src/lib/core/rotation';

const me = { rating: 1500, rd: 80, vol: 0.06 };
const items = Array.from({ length: 20 }, (_, i) => ({ id: `i${i}`, rating: 1300 + i * 10, rd: 80, vol: 0.06, source: 'seed' }));
const DAY = 86400_000;
const now = Date.UTC(2026, 8, 25);

describe('selectFresh', () => {
	it('never repeats while unseen items remain', () => {
		const seen = new Map<string, number>();
		for (let k = 0; k < 20; k++) {
			const s = selectFresh(items, seen, me, { now, rand: Math.random });
			expect(s.fresh).toBe(true);
			expect(seen.has(s.item!.id)).toBe(false);
			seen.set(s.item!.id, now + k);
		}
		expect(seen.size).toBe(20);
	});
	it('after the roster is exhausted, repeats come from the oldest-seen quarter', () => {
		const seen = new Map(items.map((it, k) => [it.id, now - (20 - k) * DAY] as [string, number]));
		const oldest = new Set(items.slice(0, 5).map((i) => i.id));
		for (let k = 0; k < 50; k++) {
			const s = selectFresh(items, seen, me, { now });
			expect(s.fresh).toBe(false);
			expect(oldest.has(s.item!.id)).toBe(true);
		}
	});
	it('respects the cooldown when anything else is eligible', () => {
		const seen = new Map(items.map((it, k) => [it.id, k < 19 ? now - DAY : now - 30 * DAY] as [string, number]));
		const s = selectFresh(items, seen, me, { now, cooldownMs: 14 * DAY });
		expect(s.item!.id).toBe('i19');
	});
	it('reports coverage', () => {
		const seen = new Map([['i0', now], ['i1', now]]);
		const s = selectFresh(items, seen, me, { now });
		expect([s.seen, s.total]).toEqual([2, 20]);
	});
	it('handles an empty roster', () => expect(selectFresh([], new Map(), me).item).toBeUndefined());
});

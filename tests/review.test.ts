import { beforeEach, expect, it } from 'vitest';
import { db, schema } from '../src/lib/server/db';
import { dueCards, dueCount, ensureCard, applyReview } from '../src/lib/server/services';
import { reviewable } from '../src/lib/server/exercises/a8';
import { Rating } from '../src/lib/core/srs';

beforeEach(() => {
	db.delete(schema.reviewLog).run();
	db.delete(schema.card).run();
	db.delete(schema.item).run();
});

const item = (id: string, lang: 'en' | 'pt-PT') =>
	db.insert(schema.item).values({ id, exercise: 'A1', lang, target: id, prompt: { definition: 'd' }, rating: 1500, rd: 250, vol: 0.06, source: 'test', parallelSet: 0, active: true }).run();

it('a card answered today, even with Again, is not served again until tomorrow', () => {
	item('psicanalista', 'pt-PT');
	item('wilt', 'en');
	const c = ensureCard('psicanalista', []);
	ensureCard('wilt', []);
	expect(dueCount()).toBe(2);
	const next = applyReview(c.id, Rating.Again, Rating.Again, {});
	expect(next.due - Date.now()).toBeLessThan(15 * 60_000); // FSRS's own learning step is minutes away
	db.update(schema.card).set({ due: Date.now() - 1 }).run(); // the learning step has passed: both cards look due
	expect(dueCount()).toBe(1);
	expect(dueCount('pt-PT')).toBe(0);
	expect(dueCards(10).map((x) => x.itemId)).toEqual(['wilt']);
});

it('only one-word translations become review cards', () => {
	expect(reviewable('berbequim')).toBe(true);
	expect(reviewable(' sabes ')).toBe(true);
	expect(reviewable('no fim de contas')).toBe(false);
	expect(reviewable('prisão de ventre')).toBe(false);
	expect(reviewable('')).toBe(false);
	expect(reviewable(null)).toBe(false);
});

it('cards of a paused exercise wait, and keep their schedule', () => {
	item('wilt', 'en');
	db.insert(schema.item).values({ id: 'vigiar', exercise: 'A8', lang: 'pt-PT', target: 'vigiar', prompt: { cue: 'keep an eye on' }, rating: 1500, rd: 250, vol: 0.06, source: 'test', parallelSet: 0, active: true }).run();
	ensureCard('wilt', []);
	const paused = ensureCard('vigiar', []);
	db.update(schema.card).set({ due: Date.now() - 1 }).run();
	expect(dueCount()).toBe(1);
	expect(dueCount('pt-PT')).toBe(0);
	expect(dueCards(10).map((x) => x.itemId)).toEqual(['wilt']);
	expect(db.select().from(schema.card).all().find((c) => c.id === paused.id)?.due).toBeLessThan(Date.now());
});

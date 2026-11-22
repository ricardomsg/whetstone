import { beforeEach, expect, it, vi } from 'vitest';
import { db, schema, sqlite } from '../src/lib/server/db';
import { start, submit } from '../src/lib/server/exercises/a2';
import { finishRun, getRun, startRun } from '../src/lib/server/benchmark';
import { complete, LlmUnavailable } from '../src/lib/server/llm/provider';
import { POST } from '../src/routes/api/a2/+server';

vi.mock('../src/lib/server/llm/provider', async (original) => ({
	...(await original<typeof import('../src/lib/server/llm/provider')>()),
	complete: vi.fn()
}));
const reply = (words: Record<string, unknown>) => ({ text: JSON.stringify({ words }), provider: 'test', model: 'test', tokensIn: 1, tokensOut: 1, costUsd: 0, promptHash: 'h' });
const model = vi.mocked(complete);
class LlmOff extends LlmUnavailable {}

function item(id: string, kind: 'semantic' | 'letter', prompt: string, parallelSet = 0) {
	db.insert(schema.item).values({ id, exercise: 'A2', lang: 'en', prompt: { kind, prompt }, rating: 1500, rd: 350, vol: 0.06, source: 'seed', parallelSet, active: true, createdAt: 1 } as any).run();
}
const ratings = () => (sqlite.prepare("SELECT count(*) n FROM skill_rating_history WHERE dimension = 'FL'").get() as { n: number }).n;

beforeEach(() => {
	model.mockReset();
	model.mockRejectedValue(new LlmOff());
	for (const t of ['skill_rating_history', 'skill_rating', 'attempt', 'benchmark_run', 'item', 'lexicon']) sqlite.prepare(`DELETE FROM ${t}`).run();
});

it('keeps a semantic round without a model as unscored practice', async () => {
	item('s', 'semantic', 'animals');
	const a = start('en', { itemId: 's' });
	const r = await submit(a.attemptId, ['dog', 'cat'], 1000);
	expect(r).toMatchObject({ validated: false, score: null });
	expect(ratings()).toBe(0);
	expect(db.select().from(schema.attempt).all()[0].scores).toEqual({});
});

it('keeps a letter round without a word list as unscored practice', async () => {
	item('l', 'letter', 'b');
	const a = start('en', { itemId: 'l' });
	const r = await submit(a.attemptId, ['bear', 'bird'], 1000);
	expect(r).toMatchObject({ validated: false, score: null });
	expect(r.metrics.valid).toBe(2);
	expect(ratings()).toBe(0);
});

it('scores a letter round when the word list is present, and ignores unchecked rounds in its baseline', async () => {
	item('s', 'semantic', 'animals');
	await submit(start('en', { itemId: 's' }).attemptId, ['dog'], 1000);
	item('l', 'letter', 'b');
	sqlite.prepare("INSERT INTO lexicon (lang, word, zipf) VALUES ('en', 'bear', 4), ('en', 'bird', 4)").run();
	const r = await submit(start('en', { itemId: 'l' }).attemptId, ['bear', 'bird', 'bzzt'], 1000);
	expect(r.validated).toBe(true);
	expect(r.metrics.valid).toBe(2);
	expect(r.score).toBeTypeOf('number');
	expect(r.baselineN).toBe(0);
	expect(ratings()).toBe(1);
});

it('leaves an unchecked round out of benchmark results', async () => {
	item('a1', 'semantic', 'animals', 1);
	db.insert(schema.item).values({ id: 'b1', exercise: 'A1', lang: 'en', target: 'x', prompt: {}, rating: 1500, rd: 350, vol: 0.06, source: 'seed', parallelSet: 1, active: true, createdAt: 1 } as any).run();
	const run = startRun('en');
	const a = start('en', { itemId: 'a1', benchmarkRunId: run });
	await submit(a.attemptId, ['dog'], 1000);
	expect(finishRun(run)).toMatchObject({ FL: null, fluencyValid: null });
});

it('retries a reply that skips a word, then keeps the round as practice', async () => {
	item('s', 'semantic', 'animals');
	model.mockResolvedValue(reply({ dog: { valid: true, subcategory: 'pets' } }));
	const r = await submit(start('en', { itemId: 's' }).attemptId, ['dog', 'cat'], 1000);
	expect(model).toHaveBeenCalledTimes(3);
	expect(r).toMatchObject({ validated: false, score: null });
	expect(ratings()).toBe(0);
});

it('scores a round when the model judges every word', async () => {
	item('s', 'semantic', 'animals');
	model.mockResolvedValue(reply({ dog: { valid: true, subcategory: 'pets' }, rock: { valid: false } }));
	const r = await submit(start('en', { itemId: 's' }).attemptId, ['dog', 'rock'], 1000);
	expect(r.validated).toBe(true);
	expect(r.metrics.valid).toBe(1);
	expect(r.score).toBeTypeOf('number');
	expect(ratings()).toBe(1);
});

it('leaves an unchecked round out of the baseline for the same kind, and treats a missing flag as checked', async () => {
	item('s1', 'semantic', 'animals');
	await submit(start('en', { itemId: 's1' }).attemptId, ['dog'], 1000);
	item('s2', 'semantic', 'fruit');
	db.insert(schema.attempt).values({ id: 'old', exercise: 'A2', lang: 'en', itemId: 's2', startedAt: 1, finishedAt: 2, metrics: { valid: 7, kind: 'semantic' } as any, scores: { FL: 40 } }).run();
	model.mockResolvedValue(reply({ pear: { valid: true, subcategory: 'tree fruit' } }));
	const r = await submit(start('en', { itemId: 's2' }).attemptId, ['pear'], 1000);
	expect(r.validated).toBe(true);
	expect(r.baselineN).toBe(1);
	expect(r.baselineMean).toBe(7);
});

it('reports benchmark fluency only when both kinds were checked', async () => {
	item('bs', 'semantic', 'animals', 1);
	item('bl', 'letter', 'b', 1);
	db.insert(schema.item).values({ id: 'b1', exercise: 'A1', lang: 'en', target: 'x', prompt: {}, rating: 1500, rd: 350, vol: 0.06, source: 'seed', parallelSet: 1, active: true, createdAt: 1 } as any).run();
	sqlite.prepare("INSERT INTO lexicon (lang, word, zipf) VALUES ('en', 'bear', 4)").run();
	const partial = startRun('en');
	await submit(start('en', { itemId: 'bs', benchmarkRunId: partial }).attemptId, ['dog'], 1000);
	await submit(start('en', { itemId: 'bl', benchmarkRunId: partial }).attemptId, ['bear'], 1000);
	expect(getRun(partial).steps.find((s) => s.key === 'A2')).toMatchObject({ done: 2, scored: 1, avg: null });
	expect(finishRun(partial)).toMatchObject({ FL: null, fluencyValid: null, fluencyScored: 1 });
	const full = startRun('en');
	model.mockResolvedValue(reply({ dog: { valid: true, subcategory: 'pets' } }));
	await submit(start('en', { itemId: 'bs', benchmarkRunId: full }).attemptId, ['dog'], 1000);
	await submit(start('en', { itemId: 'bl', benchmarkRunId: full }).attemptId, ['bear'], 1000);
	const done = finishRun(full);
	expect(done.FL).toBeTypeOf('number');
	expect(done).toMatchObject({ fluencyValid: 1, fluencyScored: 2 });
});

it('returns to an unfinished benchmark sprint on reload, then moves to the other kind', async () => {
	item('bs', 'semantic', 'animals', 1);
	item('bl', 'letter', 'b', 1);
	db.insert(schema.item).values({ id: 'b1', exercise: 'A1', lang: 'en', target: 'x', prompt: {}, rating: 1500, rd: 350, vol: 0.06, source: 'seed', parallelSet: 1, active: true, createdAt: 1 } as any).run();
	const bench = startRun('en');
	const api = async (body: unknown) => (await POST({ request: new Request('http://test/api/a2', { method: 'POST', body: JSON.stringify(body) }) } as any)).json();
	const first = await api({ action: 'start', bench });
	expect(first.kind).toBe('semantic');
	expect((await api({ action: 'start', bench })).attemptId).toBe(first.attemptId);
	await api({ action: 'submit', attemptId: first.attemptId, words: ['dog'], elapsedMs: 1000 });
	const second = await api({ action: 'start', bench });
	expect(second.kind).toBe('letter');
	await api({ action: 'submit', attemptId: second.attemptId, words: ['bear'], elapsedMs: 1000 });
	await expect(api({ action: 'start', bench })).rejects.toMatchObject({ status: 409 });
});

it('continues a letter-first benchmark with the kind still missing', async () => {
	item('bs', 'semantic', 'animals', 1);
	item('bl', 'letter', 'b', 1);
	db.insert(schema.item).values({ id: 'b1', exercise: 'A1', lang: 'en', target: 'x', prompt: {}, rating: 1500, rd: 350, vol: 0.06, source: 'seed', parallelSet: 1, active: true, createdAt: 1 } as any).run();
	sqlite.prepare("INSERT INTO lexicon (lang, word, zipf) VALUES ('en', 'bear', 4)").run();
	const run = startRun('en');
	await submit(start('en', { itemId: 'bl', benchmarkRunId: run }).attemptId, ['bear'], 1000);
	const res = await POST({ request: new Request('http://test/api/a2', { method: 'POST', body: JSON.stringify({ action: 'start', bench: run }) }) } as any);
	const { attemptId } = await res.json();
	expect((sqlite.prepare('SELECT item_id i FROM attempt WHERE id = ?').get(attemptId) as { i: string }).i).toBe('bs');
});

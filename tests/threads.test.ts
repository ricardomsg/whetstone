import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/lib/server/db';
import { complete } from '../src/lib/server/llm/provider';
import { captureThread, confirmThread, getThread, threadPoints, beginThread, answerThread, listThreads, dueThreads, archiveThread, recallHistory, practiceSetup } from '../src/lib/server/exercises/threads';
import { saveSettings } from '../src/lib/server/settings';
import { getAttempt } from '../src/lib/server/services';
import { load as historyLoad } from '../src/routes/history/[id]/+page.server';
import { reentryScore, reentrySpeed, threadGrade } from '../src/lib/core/threads';
import { overrideScore } from '../src/lib/server/analytics';
import { exportCsv } from '../src/lib/server/export';
import { strFromU8, unzipSync } from 'fflate';

vi.mock('../src/lib/server/llm/provider', async (original) => ({ ...await original<object>(), complete: vi.fn() }));
const model = vi.mocked(complete);
const points = [{ kind: 'decision' as const, text: 'SECRET: renew the certificate on Friday.' }, { kind: 'open' as const, text: 'SECRET: Ana checks it on Thursday.' }];
const capture = { requestId: 'thread-test-001', person: 'A', topic: 'Certificates', lang: 'en', recap: 'We agreed to renew the certificate on Friday. Ana will check on Thursday.' };
function reply(data: unknown) {
	return { text: JSON.stringify(data), provider: 'test', model: 'test', tokensIn: 10, tokensOut: 10, costUsd: 0, promptHash: 'test' };
}
function grade(scores = { coverage: 4, correctness: 5 }) {
	model.mockResolvedValue(reply({ scores, evidence: { coverage: 'Missed: a small detail.', correctness: 'Accurate.' }, tips: ['Recall the next step.'] }));
}
async function ready() {
	const { id } = await captureThread(capture);
	const t = getThread(id);
	confirmThread({ threadId: id, version: t.version, person: t.person, topic: t.topic, cue: t.cue, points });
	return getThread(id);
}
function makeDue(id: string) { db.update(schema.thread).set({ due: Date.now() - 1000 }).where(eq(schema.thread.id, id)).run(); }

beforeEach(() => {
	for (const table of [schema.threadPractice, schema.threadKeypoint, schema.thread, schema.scoreOverride, schema.judgeEval, schema.attempt, schema.skillRatingHistory, schema.skillRating, schema.settings]) db.delete(table).run();
	model.mockReset();
	model.mockResolvedValue(reply({ cue: 'That certificate thing', points }));
});

describe('conversation capture and confirmation', () => {
	it('persists the recap and an editable draft; confirmation schedules recall', async () => {
		const { id } = await captureThread(capture);
		expect(getThread(id)).toMatchObject({ status: 'draft', due: null, recap: capture.recap });
		expect(threadPoints(id).map(({ kind, text }) => ({ kind, text }))).toEqual(points);
		expect(dueThreads()).toBe(0);
		const t = getThread(id);
		confirmThread({ threadId: id, version: t.version, person: t.person, topic: t.topic, cue: t.cue, points: [{ kind: 'fact', text: 'Corrected reference.' }] });
		expect(getThread(id).status).toBe('active');
		expect(getThread(id).due).toBeGreaterThan(Date.now() + 86_000_000);
		expect(threadPoints(id)[0].text).toBe('Corrected reference.');
	});
	it('does not lose a recap when extraction is disabled or unavailable', async () => {
		saveSettings({ llm: { 'c1-extract': false } });
		await captureThread(capture);
		expect(model).not.toHaveBeenCalled();
		expect(getThread(capture.requestId).recap).toBe(capture.recap);
		expect(threadPoints(capture.requestId)).toEqual([]);
		saveSettings({ llm: { 'c1-extract': true } });
		model.mockRejectedValue(new Error('offline'));
		await captureThread({ ...capture, requestId: 'second-thread' });
		expect(getThread('second-thread').status).toBe('draft');
	});
	it('retries a capture without duplicating it or making another model call', async () => {
		await captureThread(capture);
		await captureThread(capture);
		expect(model).toHaveBeenCalledTimes(1);
		expect(listThreads()).toHaveLength(1);
		expect(db.select().from(schema.attempt).all()).toHaveLength(1);
		await expect(captureThread({ ...capture, recap: 'Different text.' })).rejects.toMatchObject({ status: 409 });
	});
	it('rejects invalid capture data and empty reference points', async () => {
		await expect(captureThread({ ...capture, lang: 'pt-BR' })).rejects.toMatchObject({ status: 400 });
		await expect(captureThread({ ...capture, person: '  ' })).rejects.toMatchObject({ status: 400 });
		const t = await ready();
		expect(() => confirmThread({ threadId: t.id, version: t.version, person: t.person, topic: t.topic, cue: t.cue, points: [] })).toThrow(expect.objectContaining({ status: 400 }));
		expect(threadPoints(t.id)).toHaveLength(2);
	});
	it('rejects stale edits and preserves an existing schedule on an unchanged confirmation', async () => {
		const t = await ready();
		confirmThread({ threadId: t.id, version: t.version, person: t.person, topic: t.topic, cue: t.cue, points });
		expect(getThread(t.id).due).toBe(t.due);
		expect(() => confirmThread({ threadId: t.id, version: t.version, person: t.person, topic: 'stale edit', cue: t.cue, points })).toThrow(expect.objectContaining({ status: 409 }));
	});
});

describe('recall boundary and scheduling', () => {
	it('rejects drafts and early delayed reviews; sends only cues when practice starts', async () => {
		await captureThread(capture);
		expect(() => beginThread({ threadId: capture.requestId, exercise: 'C3' })).toThrow(expect.objectContaining({ status: 409 }));
		const draft = getThread(capture.requestId);
		confirmThread({ threadId: draft.id, version: draft.version, person: draft.person, topic: draft.topic, cue: draft.cue, points });
		expect(() => beginThread({ threadId: draft.id, exercise: 'C2' })).toThrow(expect.objectContaining({ status: 409 }));
		const begun = beginThread({ threadId: draft.id, exercise: 'C3' });
		expect(begun.cue).toBe('That certificate thing');
		expect(JSON.stringify([begun, listThreads(), practiceSetup(draft.id, 'C3')])).not.toContain('SECRET');
		const h = historyLoad({ params: { id: begun.attemptId } } as Parameters<typeof historyLoad>[0]);
		expect(h.threadReference).toBeNull();
		expect(h.evals).toEqual([]);
		expect(JSON.stringify(h)).not.toContain('SECRET');
	});
	it('reuses an unfinished attempt without resetting its timer', async () => {
		const t = await ready();
		const a = beginThread({ threadId: t.id, exercise: 'C3' });
		expect(beginThread({ threadId: t.id, exercise: 'C3' })).toEqual(a);
	});
	it('grades C2 once, reveals the snapshot, and advances its FSRS schedule', async () => {
		const t = await ready(); makeDue(t.id); grade();
		const started = beginThread({ threadId: t.id, exercise: 'C2' });
		const result = await answerThread({ attemptId: started.attemptId, recall: 'Ana checks the certificate before renewal.' });
		expect(result.score).toBe(85);
		expect(result.points).toEqual(points);
		expect(getThread(t.id).due).toBeGreaterThan(Date.now());
		expect(dueThreads()).toBe(0);
		const calls = model.mock.calls.length;
		const due = getThread(t.id).due;
		expect(await answerThread({ attemptId: started.attemptId, recall: 'Changed after reveal' })).toEqual(result);
		expect(getThread(t.id).due).toBe(due);
		expect(model).toHaveBeenCalledTimes(calls);
		expect(recallHistory()).toHaveLength(1);
		const h = historyLoad({ params: { id: started.attemptId } } as Parameters<typeof historyLoad>[0]);
		expect(h.threadReference).toEqual(points);
	});
	it('deduplicates simultaneous submissions', async () => {
		const t = await ready(); makeDue(t.id);
		let resolve!: (r: ReturnType<typeof reply>) => void;
		model.mockImplementationOnce(() => new Promise((r) => { resolve = r; }));
		const a = beginThread({ threadId: t.id, exercise: 'C2' });
		const one = answerThread({ attemptId: a.attemptId, recall: 'First answer' });
		const two = answerThread({ attemptId: a.attemptId, recall: 'Second answer' });
		resolve(reply({ scores: { coverage: 5, correctness: 5 }, evidence: {}, tips: ['Next step.'] }));
		const [x, y] = await Promise.all([one, two]);
		expect(x).toEqual(y);
		expect(x.input?.recall).toBe('First answer');
		expect(db.select().from(schema.skillRatingHistory).all()).toHaveLength(1);
	});
	it('keeps old reference points after an edit, without changing the new schedule', async () => {
		const t = await ready(); makeDue(t.id); grade();
		const a = beginThread({ threadId: t.id, exercise: 'C2' });
		confirmThread({ threadId: t.id, version: t.version, person: t.person, topic: t.topic, cue: t.cue, points: [{ kind: 'open', text: 'NEW REFERENCE' }] });
		const due = getThread(t.id).due;
		const result = await answerThread({ attemptId: a.attemptId, recall: 'Old state' });
		expect(result.points).toEqual(points);
		expect(getThread(t.id).due).toBe(due);
		expect(result.metrics?.nextDue).toBeNull();
	});
	it('does not award a score or advance scheduling when the judge is switched off', async () => {
		const t = await ready(); makeDue(t.id);
		const due = getThread(t.id).due;
		saveSettings({ llm: { 'c2-recall': false } });
		const a = beginThread({ threadId: t.id, exercise: 'C2' });
		const r = await answerThread({ attemptId: a.attemptId, recall: '' });
		expect(r.score).toBeNull();
		expect(r.points).toEqual(points);
		expect(getThread(t.id).due).toBe(due);
		expect(model).toHaveBeenCalledTimes(1); // capture only
	});
	it('uses server time for C3, preserves the C2 schedule, and retains speed when a criterion is disputed', async () => {
		const t = await ready();
		model.mockResolvedValue(reply({ scores: { accuracy: 5, opener: 5 }, evidence: {}, tips: ['Next step.'] }));
		const a = beginThread({ threadId: t.id, exercise: 'C3' });
		db.update(schema.attempt).set({ startedAt: Date.now() - 60001 }).where(eq(schema.attempt.id, a.attemptId)).run();
		const result = await answerThread({ attemptId: a.attemptId, opener: 'The certificates', recall: 'The current state', elapsedMs: 1 });
		expect(result.metrics?.speed).toBe(0);
		expect(result.score).toBe(80);
		expect(getThread(t.id).due).toBe(t.due);
		const overridden = overrideScore(a.attemptId, 'opener', 1, 'Unhelpful opener');
		expect(overridden.scores.TRP).toBe(56);
	});
	it('archives without deleting records; restoring requires confirmation', async () => {
		const t = await ready();
		archiveThread(t.id, t.version, true);
		expect(listThreads()).toEqual([]);
		expect(listThreads(true)).toHaveLength(1);
		expect(() => beginThread({ threadId: t.id, exercise: 'C3' })).toThrow(expect.objectContaining({ status: 409 }));
		archiveThread(t.id, getThread(t.id).version, false);
		expect(getThread(t.id).status).toBe('draft');
		expect(threadPoints(t.id)).toHaveLength(2);
	});
	it('includes conversations and their reference snapshots in the data export', async () => {
		const t = await ready();
		beginThread({ threadId: t.id, exercise: 'C3' });
		const archive = unzipSync(exportCsv());
		expect(strFromU8(archive['thread.csv'])).toContain(capture.recap);
		expect(strFromU8(archive['thread_keypoint.csv'])).toContain('SECRET');
		expect(strFromU8(archive['thread_practice.csv'])).toContain(t.id);
	});
});

describe('thread scoring', () => {
	it('maps the typed re-entry speed boundaries and combines the score', () => {
		expect([0, 10000, 35000, 60000, 90000].map(reentrySpeed)).toEqual([100, 100, 50, 0, 0]);
		expect(reentryScore(50, 35000)).toBe(50);
		expect(reentryScore(100, 60000)).toBe(80);
	});
	it('maps recall scores into FSRS grades', () => {
		expect([0, 49, 50, 74, 75, 89, 90, 100].map(threadGrade)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
	});
});

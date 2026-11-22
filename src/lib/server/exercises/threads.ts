import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';
import { db, schema, sqlite } from '../db';
import { check, judge } from '../judge/run';
import { newId } from '$lib/core/ids';
import { newCardState, review, type StoredCard } from '$lib/core/srs';
import { reentryScore, reentrySpeed, threadGrade } from '$lib/core/threads';
import { startAttempt, finishAttempt, getAttempt, patchAttempt, rate } from '../services';

const text = (max: number) => z.string().trim().min(1).max(max);
const Point = z.object({ kind: z.enum(['fact', 'decision', 'open']), text: text(600) });
const Points = z.array(Point).min(1).max(30);
const Extracted = z.object({ cue: text(240), points: Points });
export const Capture = z.object({ requestId: z.string().regex(/^[\w-]{8,80}$/), person: text(120), topic: text(240), lang: z.enum(['en', 'pt-PT']), recap: text(6000) });
export const Confirm = z.object({ threadId: text(80), version: z.number().int().positive(), person: text(120), topic: text(240), cue: text(240), points: Points });
export const Begin = z.object({ threadId: text(80), exercise: z.enum(['C2', 'C3']) });
export const Answer = z.object({ attemptId: text(80), recall: z.string().trim().max(6000), opener: z.string().trim().max(1500).default('') });
export function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
	const result = schema.safeParse(body);
	if (!result.success) error(400, result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
	return result.data;
}

export function getThread(id: string) {
	const t = db.select().from(schema.thread).where(eq(schema.thread.id, id)).get();
	if (!t) error(404, 'Conversation not found.');
	return t;
}
export function threadPoints(id: string) {
	return db.select().from(schema.threadKeypoint).where(eq(schema.threadKeypoint.threadId, id)).orderBy(asc(schema.threadKeypoint.position)).all();
}
export function listThreads(archived = false) {
	return sqlite.prepare(`SELECT id, person, topic, lang, status, due, captured_at capturedAt,
		(SELECT count(*) FROM thread_keypoint p WHERE p.thread_id = thread.id) points
		FROM thread WHERE ${archived ? "status = 'archived'" : "status != 'archived'"}
		ORDER BY CASE WHEN status = 'draft' THEN 0 ELSE 1 END, due, captured_at DESC`).all() as {
		id: string; person: string; topic: string; lang: string; status: string; due: number | null; capturedAt: number; points: number
	}[];
}
export function dueThreads() {
	return (sqlite.prepare("SELECT count(*) n FROM thread WHERE status = 'active' AND due <= ?").get(Date.now()) as { n: number }).n;
}
function replacePoints(id: string, points: z.infer<typeof Points>) {
	db.delete(schema.threadKeypoint).where(eq(schema.threadKeypoint.threadId, id)).run();
	db.insert(schema.threadKeypoint).values(points.map((p, position) => ({ ...p, id: newId('kp'), threadId: id, position }))).run();
}

export async function captureThread(body: unknown) {
	const p = parse(Capture, body);
	const existing = db.select().from(schema.thread).where(eq(schema.thread.id, p.requestId)).get();
	if (existing) {
		if (existing.recap !== p.recap || existing.person !== p.person || existing.topic !== p.topic || existing.lang !== p.lang) error(409, 'This recap was already saved. Open it before making changes.');
		return { id: existing.id };
	}
	const a = db.transaction(() => {
		db.insert(schema.thread).values({ id: p.requestId, person: p.person, topic: p.topic, lang: p.lang, recap: p.recap, cue: p.topic }).run();
		return startAttempt({ exercise: 'C1', lang: p.lang, input: { threadId: p.requestId, person: p.person, topic: p.topic, recap: p.recap } });
	});
	// Save first: provider failures must never lose a recap.
	let extracted: z.infer<typeof Extracted> | null = null;
	try {
		extracted = await check('c1-extract', Extracted,
			'Extract atomic key points from this conversation recap. Return {cue, points:[{kind:"fact"|"decision"|"open",text}]}. Each point states one fact, decision, open question or next action (open). Use only the recap; do not invent or resolve uncertainty. The short, vague cue names the topic without disclosing the state, decisions or next steps. Keep labels/initials exactly as supplied. Write in the specified language; pt-PT means European Portuguese, never Brazilian forms.',
			{ person: p.person, topic: p.topic, lang: p.lang, recap: p.recap }, { attemptId: a.id, maxTokens: 2400 });
	} catch { /* The saved draft can be completed manually. */ }
	db.transaction(() => {
		const current = getThread(p.requestId);
		if (extracted && current.version === 1 && current.status === 'draft') {
			replacePoints(p.requestId, extracted.points);
			db.update(schema.thread).set({ cue: extracted.cue, version: 2, updatedAt: Date.now() }).where(eq(schema.thread.id, p.requestId)).run();
		}
		finishAttempt(a.id, { state: 'done', metrics: { extracted: !!extracted }, scores: {}, feedback: { note: extracted ? 'Review the suggested key points before practising.' : 'Saved. Add key points manually; extraction was off or unavailable.' } });
	});
	return { id: p.requestId };
}

export function confirmThread(body: unknown) {
	const p = parse(Confirm, body);
	return db.transaction(() => {
		const t = getThread(p.threadId);
		if (t.version !== p.version) error(409, 'This conversation changed in another tab. Reload before saving.');
		const oldPoints = threadPoints(t.id).map(({ kind, text }) => ({ kind, text }));
		const changed = t.status !== 'active' || JSON.stringify(oldPoints) !== JSON.stringify(p.points);
		const due = changed ? Date.now() + 86400_000 : t.due;
		replacePoints(t.id, p.points);
		db.update(schema.thread).set({ person: p.person, topic: p.topic, cue: p.cue, status: 'active', version: t.version + 1,
			fsrs: changed ? newCardState() : t.fsrs, due, updatedAt: Date.now() }).where(eq(schema.thread.id, t.id)).run();
		return { id: t.id, due };
	});
}

export function archiveThread(id: string, version: number, archived: boolean) {
	const result = db.update(schema.thread).set({ status: archived ? 'archived' : 'draft', version: version + 1, updatedAt: Date.now() })
		.where(and(eq(schema.thread.id, id), eq(schema.thread.version, version))).run();
	if (!result.changes) error(409, 'This conversation changed. Reload before updating it.');
}

export function practiceSetup(id: string, exercise: 'C2' | 'C3') {
	const t = getThread(id);
	if (t.status !== 'active') error(409, 'Review and confirm the key points first.');
	return { threadId: id, exercise, lang: t.lang, due: t.due };
}
export function beginThread(body: unknown) {
	const p = parse(Begin, body);
	return db.transaction(() => {
		const t = getThread(p.threadId);
		practiceSetup(t.id, p.exercise);
		const previous = sqlite.prepare(`SELECT a.id FROM attempt a JOIN thread_practice p ON p.attempt_id = a.id
			WHERE p.thread_id = ? AND p.version = ? AND a.exercise = ? AND a.finished_at IS NULL ORDER BY a.started_at DESC LIMIT 1`).get(t.id, t.version, p.exercise) as { id: string } | undefined;
		if (previous) return cueResponse(getAttempt(previous.id)!);
		if (p.exercise === 'C2' && (t.due == null || t.due > Date.now())) error(409, 'This conversation is not due for delayed recall yet. Try the re-entry drill, or return when it is due.');
		const points = threadPoints(t.id).map(({ kind, text }) => ({ kind, text }));
		if (!points.length) error(409, 'Confirm at least one key point first.');
		const cue = p.exercise === 'C2' ? `${t.person} — ${t.topic}` : t.cue;
		const a = startAttempt({ exercise: p.exercise, lang: t.lang, input: { threadId: t.id, cue } });
		db.insert(schema.threadPractice).values({ attemptId: a.id, threadId: t.id, version: t.version, points, capturedAt: t.capturedAt }).run();
		return cueResponse(a);
	});
}
function cueResponse(a: NonNullable<ReturnType<typeof getAttempt>>) {
	return { attemptId: a.id, exercise: a.exercise, lang: a.lang, cue: String(a.input?.cue ?? ''), startedAt: a.startedAt };
}
function completedResult(id: string) {
	const a = getAttempt(id)!;
	if (!a.finishedAt) error(409, 'The answer is still being graded.');
	const reference = db.select().from(schema.threadPractice).where(eq(schema.threadPractice.attemptId, id)).get()!;
	return { attemptId: id, score: a.scores?.TRP ?? null, feedback: a.feedback, metrics: a.metrics, input: a.input, points: reference.points };
}
const pending = new Map<string, Promise<ReturnType<typeof completedResult>>>();
export async function answerThread(body: unknown) {
	const p = parse(Answer, body);
	const a = getAttempt(p.attemptId);
	if (!a || !['C2', 'C3'].includes(a.exercise)) error(404, 'Recall attempt not found.');
	if (a.finishedAt) return completedResult(a.id);
	const prior = pending.get(a.id);
	if (prior) return prior;
	const work = gradeThread(a.id, p);
	pending.set(a.id, work);
	try { return await work; } finally { pending.delete(a.id); }
}
async function gradeThread(id: string, submitted: z.infer<typeof Answer>) {
	let a = getAttempt(id)!;
	const reference = db.select().from(schema.threadPractice).where(eq(schema.threadPractice.attemptId, id)).get();
	if (!reference) error(404, 'Recall reference not found.');
	if (a.state !== 'submitted') {
		const elapsedMs = Math.max(0, Date.now() - a.startedAt);
		patchAttempt(id, { state: 'submitted', input: { ...a.input, recall: submitted.recall, opener: a.exercise === 'C3' ? submitted.opener : '' }, timings: { elapsedMs } });
		a = getAttempt(id)!;
	}
	const elapsedMs = Number(a.timings?.elapsedMs ?? 0);
	let j = null;
	try {
		j = await judge(a.exercise === 'C2' ? 'c2-recall' : 'c3-reentry',
			{ key_points: reference.points, cue: a.input?.cue, recall: a.input?.recall, opener: a.input?.opener, lang: a.lang }, { attemptId: id });
	} catch { /* The completed recall and reference remain available without a score. */ }
	return db.transaction(() => {
		if (getAttempt(id)!.finishedAt) return completedResult(id);
		const score = j ? (a.exercise === 'C3' ? reentryScore(j.score, elapsedMs) : j.score) : null;
		const t = getThread(reference.threadId);
		let nextDue: number | null = null;
		let scheduleLog: Record<string, unknown> | null = null;
		if (score != null && a.exercise === 'C2' && t.status === 'active' && t.version === reference.version && t.fsrs) {
			const scheduled = review(t.fsrs as StoredCard, threadGrade(score));
			nextDue = scheduled.card.due;
			scheduleLog = { grade: threadGrade(score), before: t.fsrs, after: scheduled.card, review: scheduled.log };
			db.update(schema.thread).set({ fsrs: scheduled.card, due: nextDue }).where(eq(schema.thread.id, t.id)).run();
		}
		finishAttempt(id, { state: j ? 'done' : 'ungraded', scores: score != null ? { TRP: score } : {},
			metrics: { threadId: t.id, referenceVersion: reference.version, delayMs: Math.max(0, a.startedAt - reference.capturedAt), elapsedMs,
				...(a.exercise === 'C3' ? { speed: reentrySpeed(elapsedMs) } : {}), nextDue, scheduleLog },
			feedback: j ? { rubric: j.rubricId, version: j.rubricVersion, scores: j.scores, evidence: j.evidence, tips: j.tips, evalId: j.evalId }
				: { note: 'Not graded: the judge is off or unavailable. Compare your recall with the key points. The recall schedule has not advanced.' } });
		if (score != null) rate('TRP', a.lang, null, score / 100, id);
		return completedResult(id);
	});
}

export function recallHistory(days = 90) {
	return sqlite.prepare(`SELECT id, started_at at, lang, json_extract(metrics, '$.delayMs') delayMs,
		json_extract(scores, '$.TRP') score FROM attempt WHERE exercise = 'C2' AND finished_at IS NOT NULL
		AND json_extract(scores, '$.TRP') IS NOT NULL AND started_at >= ? ORDER BY started_at`).all(Date.now() - days * 86400_000) as {
		id: string; at: number; lang: string; delayMs: number; score: number
	}[];
}

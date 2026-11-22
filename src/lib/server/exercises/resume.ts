import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { newId } from '$lib/core/ids';
import { scoreResumeRecall } from '$lib/core/scoring';
import { check, judge } from '../judge/run';
import { featureEnabled, getSettings, saveSettings } from '../settings';
import { listSessions, tail, available } from '../claude-code/transcripts';
import { startAttempt, finishAttempt, getAttempt, rate } from '../services';

// D1 ready-to-resume notes and D2 resume drills (Leroy & Glomb 2018; Altmann & Trafton 2002).

export function upsertClaudeSessions() {
	for (const s of listSessions()) {
		const row = { id: s.id, source: 'claude_code', projectPath: s.cwd, title: s.title, lastActivity: s.lastActivity };
		db.insert(schema.workSession)
			.values(row)
			.onConflictDoUpdate({ target: schema.workSession.id, set: { projectPath: s.cwd, title: s.title, lastActivity: s.lastActivity } })
			.run();
	}
}

export function sessions() {
	upsertClaudeSessions();
	const rows = db.select().from(schema.workSession).where(eq(schema.workSession.archived, false)).orderBy(desc(schema.workSession.lastActivity)).all();
	return rows.map((s) => {
		const note = latestNote(s.id);
		// Lists need age and score, never the recall answer or judge's quoted evidence.
		return { ...s, note: note ? { createdAt: note.createdAt, quality: note.quality ? { score: note.quality.score } : null } : null };
	});
}

export function isWorkSession(s: ReturnType<typeof sessions>[number]): boolean {
	return s.source === 'manual' || !!s.note || (!!s.title && !/\/\.local\//.test(s.projectPath ?? ''));
}

export function getSession(id: string) {
	upsertClaudeSessions();
	const s = db.select().from(schema.workSession).where(eq(schema.workSession.id, id)).get();
	if (!s) error(404, 'session not found');
	return s;
}

export function createManualSession(title: string, projectPath?: string) {
	const id = newId('w');
	db.insert(schema.workSession).values({ id, source: 'manual', title, projectPath: projectPath ?? null, lastActivity: Date.now() }).run();
	return id;
}

/** For the CLI: the most recently active Claude Code session whose working directory is `cwd`. */
export function sessionForCwd(cwd: string) {
	upsertClaudeSessions();
	const rows = db.select().from(schema.workSession).where(eq(schema.workSession.projectPath, cwd)).orderBy(desc(schema.workSession.lastActivity)).all();
	return rows[0] ?? null;
}

export function latestNote(sessionId: string) {
	return db.select().from(schema.resumeNote).where(eq(schema.resumeNote.sessionId, sessionId)).orderBy(desc(schema.resumeNote.createdAt)).get();
}

export async function addNote(p: { sessionId: string; stoppedAt: string; nextAction: string; openRisks?: string; waitingOn?: string; via?: string }) {
	getSession(p.sessionId);
	const id = newId('n');
	db.insert(schema.resumeNote)
		.values({ id, sessionId: p.sessionId, stoppedAt: p.stoppedAt.trim(), nextAction: p.nextAction.trim(), openRisks: p.openRisks?.trim() || null, waitingOn: p.waitingOn?.trim() || null, via: p.via ?? 'web' })
		.run();
	const a = startAttempt({ exercise: 'D1', lang: 'en', input: { noteId: id } });
	const j = await judge('d1-note-quality', { stopped_at: p.stoppedAt, next_action: p.nextAction, open_risks: p.openRisks ?? '', waiting_on: p.waitingOn ?? '' }, { attemptId: a.id });
	finishAttempt(a.id, {
		state: j ? 'done' : 'ungraded',
		metrics: { noteId: id, sessionId: p.sessionId, via: p.via ?? 'web' },
		scores: j ? { TRA: j.score } : {},
		feedback: j ? { rubric: j.rubricId, version: j.rubricVersion, scores: j.scores, evidence: j.evidence, tips: j.tips, evalId: j.evalId } : { note: 'Not graded.' }
	});
	if (j) {
		db.update(schema.resumeNote).set({ quality: { score: j.score, scores: j.scores, tips: j.tips }, attemptId: a.id }).where(eq(schema.resumeNote.id, id)).run();
		rate('TRA', 'all', null, j.score / 100, a.id);
	}
	return { id, attemptId: a.id, quality: j };
}

export function resumeSwitch(on?: boolean) {
	if (on !== undefined) saveSettings({ resumePrompting: on });
	return getSettings().resumePrompting;
}

const Truth = z.object({ stoppedAt: z.string(), nextAction: z.string(), openRisks: z.string().default(''), waitingOn: z.string().default('') });

/** Open a resume drill. The note is NOT returned here: recall comes first. */
export async function openDrill(sessionId: string) {
	const s = getSession(sessionId);
	const note = latestNote(sessionId);
	let truthSource: 'note' | 'transcript' | 'none' = note ? 'note' : 'none';
	if (!note && available() && s.source === 'claude_code' && featureEnabled('d2-transcript-tail')) truthSource = 'transcript';
	const id = newId('ra');
	db.insert(schema.resumeAttempt).values({ id, sessionId, noteId: note?.id ?? null, truthSource: truthSource === 'none' ? 'note' : truthSource, openedAt: Date.now() }).run();
	return { drillId: id, session: s, truthSource, prompting: getSettings().resumePrompting, noteAge: note ? Date.now() - note.createdAt : null };
}

export async function answerDrill(drillId: string, retrospective: string, prospective: string) {
	const r = db.select().from(schema.resumeAttempt).where(eq(schema.resumeAttempt.id, drillId)).get();
	if (!r) error(404, 'drill not found');
	const s = getSession(r.sessionId);
	let truth: z.infer<typeof Truth> | null = null;
	if (r.noteId) {
		const n = db.select().from(schema.resumeNote).where(eq(schema.resumeNote.id, r.noteId)).get()!;
		truth = { stoppedAt: n.stoppedAt, nextAction: n.nextAction, openRisks: n.openRisks ?? '', waitingOn: n.waitingOn ?? '' };
	} else if (r.truthSource === 'transcript') {
		const t = tail(r.sessionId, getSettings().transcriptTailTurns);
		if (t?.length)
			truth = await check(
				'd2-transcript-tail',
				Truth,
				'From the last turns of a Claude Code session, write where the human left off, as a ready-to-resume note: stoppedAt (last thing done), nextAction (the concrete next step), openRisks, waitingOn. Short, specific, factual; use only what the transcript says.',
				{ title: s.title, project: s.projectPath, turns: t },
				{ feature: 'd2-transcript-tail', maxTokens: 800 }
			);
	}
	const answeredAt = Date.now();
	db.update(schema.resumeAttempt).set({ retrospective, prospective, answeredAt }).where(eq(schema.resumeAttempt.id, drillId)).run();
	if (!truth) {
		// Nothing to score against: keep the recall as a new note so the next resume has ground truth.
		await addNote({ sessionId: r.sessionId, stoppedAt: retrospective || '(not recalled)', nextAction: prospective || '(not recalled)', via: 'recall' });
		return { truth: null, score: null, judge: null };
	}
	const a = startAttempt({ exercise: 'D2', lang: 'en', input: { drillId, retrospective, prospective } });
	const j = await judge('d2-resume-recall', { note: truth, recall: { retrospective, prospective }, minutes_since_note: r.noteId ? Math.round((answeredAt - (latestNote(r.sessionId)?.createdAt ?? answeredAt)) / 60000) : null }, { attemptId: a.id });
	const score = j ? scoreResumeRecall(((j.scores.retrospective - 1) / 4) * 100, ((j.scores.prospective - 1) / 4) * 100) : null;
	finishAttempt(a.id, {
		state: j ? 'done' : 'ungraded',
		timings: { recallMs: answeredAt - r.openedAt },
		metrics: { sessionId: r.sessionId, truthSource: r.truthSource, recallMs: answeredAt - r.openedAt },
		scores: score != null ? { TRA: score } : {},
		feedback: j ? { rubric: j.rubricId, version: j.rubricVersion, scores: j.scores, evidence: j.evidence, tips: j.tips, evalId: j.evalId } : { note: 'Not graded.' }
	});
	db.update(schema.resumeAttempt).set({ attemptId: a.id }).where(eq(schema.resumeAttempt.id, drillId)).run();
	if (score != null) rate('TRA', 'all', null, score / 100, a.id);
	return { truth, score, judge: j, attemptId: a.id };
}

export function backInFlow(drillId: string) {
	const r = db.select().from(schema.resumeAttempt).where(eq(schema.resumeAttempt.id, drillId)).get();
	if (!r) error(404, 'drill not found');
	const at = Date.now();
	db.update(schema.resumeAttempt).set({ backInFlowAt: at }).where(eq(schema.resumeAttempt.id, drillId)).run();
	if (r.attemptId) {
		const a = getAttempt(r.attemptId);
		if (a) db.update(schema.attempt).set({ metrics: { ...(a.metrics ?? {}), resumeMs: at - r.openedAt } }).where(eq(schema.attempt.id, a.id)).run();
	}
	return { resumeMs: at - r.openedAt };
}

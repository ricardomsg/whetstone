import { json, error } from '@sveltejs/kit';
import { addNote, sessionForCwd, createManualSession, getSession } from '$lib/server/exercises/resume';

// D1 capture from the CLI or a hook: { session? | cwd?, title?, stoppedAt, nextAction, openRisks?, waitingOn?, via? }
export const POST = async ({ request }) => {
	const b = await request.json();
	if (!b.stoppedAt?.trim() || !b.nextAction?.trim()) error(400, 'stoppedAt and nextAction are required');
	let sessionId: string | null = b.session ?? null;
	if (sessionId) getSession(sessionId);
	if (!sessionId && b.cwd) sessionId = sessionForCwd(b.cwd)?.id ?? null;
	if (!sessionId) sessionId = createManualSession(b.title ?? (b.cwd ? String(b.cwd).split('/').pop() : 'Manual session'), b.cwd);
	const r = await addNote({ sessionId, stoppedAt: b.stoppedAt, nextAction: b.nextAction, openRisks: b.openRisks, waitingOn: b.waitingOn, via: b.via ?? 'cli' });
	return json({ sessionId, noteId: r.id, attemptId: r.attemptId, quality: r.quality ? { score: r.quality.score, scores: r.quality.scores, evidence: r.quality.evidence, tips: r.quality.tips, rubricId: r.quality.rubricId } : null });
};

import { getSession, latestNote, resumeSwitch } from '$lib/server/exercises/resume';
import { db, schema } from '$lib/server/db';
import { desc, eq } from 'drizzle-orm';

export const load = ({ params, url }) => {
	const s = getSession(params.id);
	const prompting = resumeSwitch();
	const mode = url.searchParams.has('note') ? 'note' : url.searchParams.has('resume') && prompting ? 'drill' : 'view';
	const notes = mode === 'view' ? db.select().from(schema.resumeNote).where(eq(schema.resumeNote.sessionId, params.id)).orderBy(desc(schema.resumeNote.createdAt)).limit(10).all() : [];
	return { s, hasNote: !!latestNote(params.id), notes, prompting, mode };
};

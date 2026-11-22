import { redirect, fail } from '@sveltejs/kit';
import { sessions, createManualSession, resumeSwitch, isWorkSession } from '$lib/server/exercises/resume';
import { available } from '$lib/server/claude-code/transcripts';
import { db, schema } from '$lib/server/db';
import { eq } from 'drizzle-orm';

// By default: the 20 most recent sessions that have a title and are not automated agents
// (those run from ~/.local/…). ?all=1 shows everything.
export const load = ({ url }) => {
	const all = sessions();
	const all1 = url.searchParams.get('all') === '1';
	const shown = all1 ? all : all.filter(isWorkSession).slice(0, 20);
	return { sessions: shown, total: all.length, showingAll: all1, transcripts: available(), prompting: resumeSwitch() };
};

export const actions = {
	create: async ({ request }) => {
		const f = await request.formData();
		const title = String(f.get('title') ?? '').trim();
		if (!title) return fail(400, { error: 'Name the session.' });
		redirect(303, `/sessions/${createManualSession(title)}?note=1`);
	},
	toggle: async ({ request }) => {
		const f = await request.formData();
		resumeSwitch(f.get('on') === '1');
	},
	archive: async ({ request }) => {
		const f = await request.formData();
		db.update(schema.workSession).set({ archived: true }).where(eq(schema.workSession.id, String(f.get('id')))).run();
	}
};

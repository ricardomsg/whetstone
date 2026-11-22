import { fail, isHttpError, redirect } from '@sveltejs/kit';
import { journalAvailable, listEntries, listReports } from '$lib/server/journal/store';
import { generateReport } from '$lib/server/journal/coach';

export const load = ({ url }) => {
	if (!journalAvailable()) return { available: false as const };
	return {
		available: true as const,
		metas: listEntries().map((m) => ({ id: m.id, day: m.day, title: m.title, kind: m.kind, bytes: m.bytes })),
		picked: url.searchParams.getAll('e'),
		reports: listReports()
	};
};

export const actions = {
	default: async ({ request }) => {
		const f = await request.formData();
		const ids = f.getAll('e').map(String);
		const notes = String(f.get('notes') ?? '');
		let name: string;
		try {
			name = await generateReport(ids, notes);
		} catch (e) {
			if (isHttpError(e)) return fail(e.status, { error: e.body.message, ids, notes });
			throw e;
		}
		redirect(303, `/journal/report/${encodeURIComponent(name)}`);
	}
};

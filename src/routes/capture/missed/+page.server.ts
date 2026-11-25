import { redirect, fail } from '@sveltejs/kit';
import { sqlite } from '$lib/server/db';
import { captureMiss } from '$lib/server/exercises/a8';
import { PAUSED } from '$lib/content/paused';

// The answer is not sent here: an item you have not tried yet shows only its English side.
export const load = () => {
	const rows = sqlite
		.prepare(
			`SELECT i.id, i.target, json_extract(i.prompt, '$.cue') cue, i.created_at at,
			   (SELECT count(*) FROM attempt a WHERE a.item_id = i.id AND a.finished_at IS NOT NULL) tries
			 FROM item i WHERE i.exercise = 'A8' AND i.source = 'missed' ORDER BY i.created_at DESC LIMIT 30`
		)
		.all() as { id: string; target: string; cue: string; at: number; tries: number }[];
	return { paused: PAUSED.A8 ?? null, misses: rows.map((r) => ({ id: r.id, cue: r.cue, at: r.at, tries: r.tries, target: r.tries ? r.target : null })) };
};

export const actions = {
	default: async ({ request }) => {
		const f = Object.fromEntries(await request.formData()) as Record<string, string>;
		if (!f.cue?.trim()) return fail(400, { error: 'Write the English word or phrase that came to mind.' });
		let id: string;
		try {
			id = await captureMiss({ cue: f.cue, context: f.context, lang: 'pt-PT' });
		} catch (e: any) {
			return fail(e?.status ?? 500, { error: e?.body?.message ?? 'Could not prepare it. Try again.' });
		}
		redirect(303, PAUSED.A8 ? '/capture/missed?saved=1' : `/x/a8?lang=pt-PT&item=${id}&n=1`);
	}
};

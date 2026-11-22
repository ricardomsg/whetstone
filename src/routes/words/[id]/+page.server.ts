import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';
import { confirmWord, discardWord, reEnrich } from '$lib/server/exercises/vocab';

export const load = ({ params }) => {
	const v = db.select().from(schema.vocabEntry).where(eq(schema.vocabEntry.id, params.id)).get();
	if (!v) error(404, 'not found');
	return { v };
};

const lines = (s: FormDataEntryValue | null) => String(s ?? '').split('\n').map((x) => x.trim()).filter(Boolean);

export const actions = {
	confirm: async ({ request, params }) => {
		const f = await request.formData();
		const g = (k: string) => String(f.get(k) ?? '').trim();
		confirmWord(params.id, {
			lemma: g('lemma'),
			pos: g('pos'),
			definition: g('definition'),
			register: g('register'),
			collocations: lines(f.get('collocations')),
			examples: lines(f.get('examples')),
			gapped: g('gapped'),
			translation: g('translation'),
			concreteness: g('concreteness') === 'concrete' ? 'concrete' : 'abstract',
			hints: { syllables: Number(g('syllables')) || 0, stress: Number(g('stress')) || undefined, firstSound: g('firstSound'), similar: g('similar'), lastSound: g('lastSound') }
		});
		redirect(303, '/words');
	},
	discard: ({ params }) => {
		discardWord(params.id);
		redirect(303, '/words');
	},
	enrich: async ({ params }) => {
		await reEnrich(params.id);
	}
};

import { redirect, fail } from '@sveltejs/kit';
import { captureTot } from '$lib/server/exercises/vocab';
import { getSettings } from '$lib/server/settings';

export const load = () => ({ lang: getSettings().defaultLang === 'pt-PT' ? 'pt-PT' : 'en' });

export const actions = {
	default: async ({ request }) => {
		const f = Object.fromEntries(await request.formData()) as Record<string, string>;
		if (!f.meaning?.trim()) return fail(400, { error: 'Write the meaning you were reaching for.' });
		const id = await captureTot({ meaning: f.meaning, interlopers: f.interlopers, word: f.word, resolution: f.resolution, context: f.context, lang: (f.lang as any) || 'en' });
		redirect(303, f.word?.trim() ? `/tot?saved=${id}` : `/tot/${id}`);
	}
};

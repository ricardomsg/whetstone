import { redirect, fail } from '@sveltejs/kit';
import { captureWord } from '$lib/server/exercises/vocab';
import { getSettings } from '$lib/server/settings';

// Also the Android share target: GET /capture/word?title=&text=&url=
export const load = ({ url }) => {
	const text = [url.searchParams.get('text'), url.searchParams.get('title')].filter(Boolean).join(' ').trim();
	const oneWord = text && !/\s/.test(text) ? text : '';
	return { lang: getSettings().defaultLang === 'pt-PT' ? 'pt-PT' : 'en', word: oneWord, sentence: oneWord ? '' : text, source: url.searchParams.get('url') ?? '' };
};

export const actions = {
	default: async ({ request }) => {
		const f = Object.fromEntries(await request.formData()) as Record<string, string>;
		if (!f.word?.trim()) return fail(400, { error: 'Which word?' });
		const id = await captureWord({ word: f.word, sentence: f.sentence, note: f.source, lang: (f.lang as any) || 'en' });
		redirect(303, `/words/${id}`);
	}
};

import { json, error } from '@sveltejs/kit';
import { captureWord } from '$lib/server/exercises/vocab';
import { getSettings } from '$lib/server/settings';

export const POST = async ({ request }) => {
	const b = await request.json();
	if (!b.word?.trim()) error(400, 'word is required');
	const lang = b.lang ?? (getSettings().defaultLang === 'pt-PT' ? 'pt-PT' : 'en');
	const id = await captureWord({ word: b.word, sentence: b.sentence, note: b.note, lang });
	return json({ id, url: `/words/${id}` });
};

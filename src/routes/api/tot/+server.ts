import { json, error } from '@sveltejs/kit';
import { captureTot } from '$lib/server/exercises/vocab';
import { getSettings } from '$lib/server/settings';

// Quick capture (PWA and CLI). Minimum is the meaning.
export const POST = async ({ request }) => {
	const b = await request.json();
	if (!b.meaning?.trim()) error(400, 'meaning is required');
	const lang = b.lang ?? (getSettings().defaultLang === 'pt-PT' ? 'pt-PT' : 'en');
	const id = await captureTot({ meaning: b.meaning, interlopers: b.interlopers, resolution: b.resolution, word: b.word, context: b.context, lang });
	return json({ id, url: `/tot/${id}` });
};

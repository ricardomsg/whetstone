import { error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db';

export const load = ({ params }) => {
	const t = db.select().from(schema.totLog).where(eq(schema.totLog.id, params.id)).get();
	if (!t) error(404, 'not found');
	return { t: { id: t.id, meaning: t.meaning, interlopers: t.interlopers, lang: t.lang, word: t.word, resolution: t.resolution } };
};

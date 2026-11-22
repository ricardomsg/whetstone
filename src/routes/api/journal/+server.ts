import { json, error } from '@sveltejs/kit';
import { saveEntry } from '$lib/server/journal/store';

export const POST = async ({ request }) => {
	const b = await request.json();
	if (typeof b.id !== 'string' || typeof b.text !== 'string') error(400, 'id and text are required');
	const r = saveEntry(b.id, b.text, typeof b.baseHash === 'string' ? b.baseHash : null);
	return json(r, { status: r.ok ? 200 : 409 });
};

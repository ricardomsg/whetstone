import { json } from '@sveltejs/kit';
import { wording } from '$lib/server/journal/coach';

export const POST = async ({ request }) => {
	const b = await request.json();
	const r = await wording({ selection: String(b.selection ?? ''), sentence: String(b.sentence ?? ''), want: String(b.want ?? '') });
	return json(r);
};

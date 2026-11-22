import { json, error } from '@sveltejs/kit';
import { overrideScore } from '$lib/server/analytics';

export const POST = async ({ request, params }) => {
	const b = await request.json();
	const v = Number(b.score);
	if (!Number.isFinite(v)) error(400, 'score required');
	return json(overrideScore(params.id, String(b.criterion ?? '_score'), v, String(b.reason ?? '')));
};

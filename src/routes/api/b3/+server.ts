import { json, error } from '@sveltejs/kit';
import * as V from '$lib/server/exercises/vocab';

export const POST = async ({ request }) => {
	const b = await request.json();
	if (b.action === 'next') return json(V.nextUseIt(b.lang, { dailySessionId: b.ds ?? null }));
	if (b.action === 'submit') return json(await V.submitUseIt(b.attemptId, (b.sentences ?? []).map(String)));
	error(400, 'unknown action');
};

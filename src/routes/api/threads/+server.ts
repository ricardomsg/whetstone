import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import * as T from '$lib/server/exercises/threads';

export const POST = async ({ request }) => {
	let body;
	try { body = await request.json(); } catch { error(400, 'Send a JSON object.'); }
	switch (body?.action) {
		case 'capture': return json(await T.captureThread(body));
		case 'confirm': return json(T.confirmThread(body));
		case 'begin': return json(T.beginThread(body));
		case 'answer': return json(await T.answerThread(body));
		case 'archive': {
			const p = T.parse(z.object({ threadId: z.string().min(1).max(80), version: z.number().int().positive(), archived: z.boolean() }), body);
			T.archiveThread(p.threadId, p.version, p.archived);
			return json({ ok: true });
		}
		default: error(400, 'Unknown conversation action.');
	}
};

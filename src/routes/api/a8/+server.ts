import { json, error } from '@sveltejs/kit';
import * as A8 from '$lib/server/exercises/a8';
import { PAUSED } from '$lib/content/paused';

export const POST = async ({ request }) => {
	const b = await request.json();
	switch (b.action) {
		case 'start':
			return json(A8.start(b.lang === 'en' ? 'en' : 'pt-PT', { dailySessionId: b.ds ?? null, itemId: b.item ?? undefined }));
		case 'answer':
			return json(await A8.answer(b.attemptId, String(b.text ?? '')));
		case 'state':
			return json(A8.markState(b.attemptId, b.state));
		case 'hint':
			return json(A8.hint(b.attemptId, !!b.giveUp));
		case 'sentence':
			return json(await A8.sentence(b.attemptId, String(b.text ?? '')));
		case 'capture':
			return json({ itemId: await A8.captureMiss({ cue: String(b.cue ?? ''), context: b.context ? String(b.context) : undefined, lang: b.lang === 'en' ? 'en' : 'pt-PT' }), paused: PAUSED.A8 ?? null });
	}
	error(400, 'unknown action');
};

import { json, error } from '@sveltejs/kit';
import * as R from '$lib/server/exercises/resume';

export const POST = async ({ request }) => {
	const b = await request.json();
	switch (b.action) {
		case 'open':
			return json(await R.openDrill(b.sessionId));
		case 'answer':
			return json(await R.answerDrill(b.drillId, String(b.retrospective ?? ''), String(b.prospective ?? '')));
		case 'flow':
			return json(R.backInFlow(b.drillId));
	}
	error(400, 'unknown action');
};

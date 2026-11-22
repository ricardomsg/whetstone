import { json, error } from '@sveltejs/kit';
import * as V from '$lib/server/exercises/vocab';

export const POST = async ({ request, params }) => {
	const b = await request.json();
	switch (b.action) {
		case 'suggest': {
			const r = await V.suggest(params.id);
			return json({ ready: !!r });
		}
		case 'hint':
			return json(V.totHint(params.id, Number(b.level)));
		case 'resolve':
			return json({ itemId: await V.resolveTot(params.id, String(b.word), b.how ?? 'self') });
	}
	error(400, 'unknown action');
};

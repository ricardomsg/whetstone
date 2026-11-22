import { json, error } from '@sveltejs/kit';
import * as V from '$lib/server/exercises/vocab';

export const POST = async ({ request }) => {
	const b = await request.json();
	switch (b.action) {
		case 'next':
			return json(V.nextReview(b.lang, { dailySessionId: b.ds ?? null }));
		case 'hint':
			return json(V.reviewHint(b.attemptId));
		case 'answer':
			return json(V.reviewAnswer(b.attemptId, b.text == null ? null : String(b.text)));
		case 'grade':
			return json(V.reviewGrade(b.attemptId, Number(b.grade) as any));
	}
	error(400, 'unknown action');
};

import { error } from '@sveltejs/kit';
import { practiceSetup } from '$lib/server/exercises/threads';
export const load = ({ params, url }) => {
	const exercise = url.searchParams.get('exercise') ?? 'C2';
	if (exercise !== 'C2' && exercise !== 'C3') error(400, 'Unknown recall drill.');
	return practiceSetup(params.id, exercise);
};

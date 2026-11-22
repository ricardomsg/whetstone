import { listThreads } from '$lib/server/exercises/threads';
export const load = ({ url }) => {
	const archived = url.searchParams.get('archived') === '1';
	return { threads: listThreads(archived), archived, now: Date.now() };
};

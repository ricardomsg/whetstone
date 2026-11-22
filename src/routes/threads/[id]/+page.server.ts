import { getThread, threadPoints } from '$lib/server/exercises/threads';
export const load = ({ params }) => ({ thread: getThread(params.id), points: threadPoints(params.id) });

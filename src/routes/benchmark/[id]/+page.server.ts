import { getRun, finishRun } from '$lib/server/benchmark';

export const load = ({ params }) => {
	const r = getRun(params.id);
	if (!r.current && !r.run.finishedAt) finishRun(params.id);
	return getRun(params.id);
};

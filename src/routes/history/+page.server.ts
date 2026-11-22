import { listHistory, totals } from '$lib/server/history';
import { coverage } from '$lib/server/services';

export const load = ({ url }) => {
	const q = url.searchParams;
	const f = { exercise: q.get('ex') ?? undefined, lang: q.get('lang') ?? undefined, before: q.get('before') ? Number(q.get('before')) : undefined, unfinished: q.get('all') === '1' };
	return { ...listHistory(f), filters: f, coverage: coverage(), totals: totals() };
};

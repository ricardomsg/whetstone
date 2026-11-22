import { todayCheckin, todayPlan } from '$lib/server/planner';
import { snapshot, streak, skillTrends } from '$lib/server/analytics';
import { dueCount, countWhere } from '$lib/server/services';
import { runs } from '$lib/server/benchmark';
import { listHistory } from '$lib/server/history';
import { dueThreads } from '$lib/server/exercises/threads';
import { env } from '$lib/server/env';

export const load = () => {
	const { plan, progress } = todayPlan();
	const lastBench = runs().find((r) => r.finishedAt);
	const trends = skillTrends(14);
	return {
		displayName: env.displayName,
		checkin: todayCheckin(),
		plan,
		progress,
		snapshot: snapshot().map((s) => ({ ...s, spark: (trends[s.dim] ?? []).map((p) => p.r7) })),
		streak: streak(),
		due: dueCount(),
		threadsDue: dueThreads(),
		inbox: countWhere('vocab_entry', "stage = 'inbox'"),
		openTots: countWhere('tot_log', "resolution = 'open'"),
		benchDue: !lastBench || Date.now() - lastBench.finishedAt! > 28 * 86400_000,
		lastBench: lastBench?.finishedAt ?? null,
		recent: listHistory({ limit: 4 }).rows
	};
};

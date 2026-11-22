import { skillTrends, totTrend, fluencyHistory, vocabFunnel, resumeHistory, streak, overridesCount, stateCorrelations, disputeAnalytics } from '$lib/server/analytics';
import { weaknesses, DIMS } from '$lib/server/planner';
import { runs } from '$lib/server/benchmark';
import { recallHistory } from '$lib/server/exercises/threads';
import { env } from '$lib/server/env';

export const load = ({ url }) => {
	const requestedDays = Number(url.searchParams.get('days') ?? 28);
	const days = [7, 28, 90].includes(requestedDays) ? requestedDays : 28;
	return {
		days,
		timezone: env.timezone,
		dims: DIMS as Record<string, string>,
		trends: skillTrends(days),
		tot: totTrend(12),
		fluency: fluencyHistory(),
		funnel: vocabFunnel(),
		resume: resumeHistory(),
		streak: streak(),
		overrides: overridesCount(),
		disputes: disputeAnalytics(days),
		threadRecall: recallHistory(days),
		weak: weaknesses().slice(0, 3),
		bench: runs().filter((r) => r.finishedAt).reverse(),
		state: stateCorrelations()
	};
};

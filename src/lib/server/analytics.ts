import { sqlite, db, schema } from './db';
import { desc, eq } from 'drizzle-orm';
import { addDays, newId } from '$lib/core/ids';
import { localDate } from '$lib/server/dates';
import { rubricToScore } from '$lib/core/scoring';
import { reentryScore } from '$lib/core/threads';
import { getRubric, weightsOf } from './judge/rubrics';
import { getAttempt, DIMS, type Dim } from './services';

const DAY = 86400_000;

/** Daily mean score per skill over the last `days`, with 7- and 28-day rolling means. */
export function skillTrends(days = 90) {
	const since = Date.now() - days * DAY;
	const rows = sqlite
		.prepare(`SELECT started_at t, scores FROM attempt WHERE finished_at IS NOT NULL AND benchmark_run_id IS NULL AND started_at > ? AND scores IS NOT NULL`)
		.all(since - 30 * DAY) as { t: number; scores: string }[]; // two spare days cover clock changes
	const byDim: Record<string, Map<string, number[]>> = {};
	for (const r of rows) {
		const d = localDate(r.t);
		for (const [dim, v] of Object.entries(JSON.parse(r.scores) as Record<string, number>)) {
			if (typeof v !== 'number') continue;
			(byDim[dim] ??= new Map()).set(d, [...(byDim[dim].get(d) ?? []), v]);
		}
	}
	const out: Record<string, { date: string; mean: number | null; r7: number | null; r28: number | null; n: number }[]> = {};
	const lastDay = localDate();
	for (const [dim, m] of Object.entries(byDim)) {
		const series = [];
		for (let i = days - 1; i >= 0; i--) {
			const date = addDays(lastDay, -i);
			const win = (n: number) => {
				const vals: number[] = [];
				for (let k = 0; k < n; k++) vals.push(...(m.get(addDays(date, -k)) ?? []));
				return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
			};
			const today = m.get(date) ?? [];
			series.push({ date, mean: today.length ? today.reduce((a, b) => a + b, 0) / today.length : null, r7: win(7), r28: win(28), n: today.length });
		}
		out[dim] = series;
	}
	return out;
}

/** A1 TOT rate per week and language, plus real-life TOT log counts per week. */
export function totTrend(weeks = 12) {
	const since = Date.now() - weeks * 7 * DAY;
	const drills = sqlite
		.prepare(`SELECT started_at t, lang, json_extract(metrics,'$.tot') tot FROM attempt WHERE exercise='A1' AND finished_at IS NOT NULL AND started_at > ?`)
		.all(since) as { t: number; lang: string; tot: number }[];
	const logs = sqlite.prepare('SELECT captured_at t, lang FROM tot_log WHERE captured_at > ?').all(since) as { t: number; lang: string }[];
	const week = (t: number) => Math.floor((Date.now() - t) / (7 * DAY));
	const out = Array.from({ length: weeks }, (_, i) => ({ weeksAgo: weeks - 1 - i, en: { n: 0, tot: 0 }, pt: { n: 0, tot: 0 }, logEn: 0, logPt: 0 }));
	for (const d of drills) {
		const w = out[weeks - 1 - week(d.t)];
		if (!w) continue;
		const k = d.lang === 'pt-PT' ? 'pt' : 'en';
		w[k].n++;
		if (d.tot) w[k].tot++;
	}
	for (const l of logs) {
		const w = out[weeks - 1 - week(l.t)];
		if (!w) continue;
		if (l.lang === 'pt-PT') w.logPt++;
		else w.logEn++;
	}
	return out.map((w) => ({ weeksAgo: w.weeksAgo, en: w.en.n ? w.en.tot / w.en.n : null, pt: w.pt.n ? w.pt.tot / w.pt.n : null, enN: w.en.n, ptN: w.pt.n, logEn: w.logEn, logPt: w.logPt }));
}

export function fluencyHistory() {
	return sqlite
		.prepare(
			`SELECT a.started_at t, a.lang, json_extract(a.metrics,'$.kind') kind, json_extract(a.metrics,'$.valid') valid, json_extract(a.metrics,'$.baselineMean') base, json_extract(a.metrics,'$.prompt') prompt
			 FROM attempt a WHERE a.exercise='A2' AND a.finished_at IS NOT NULL AND COALESCE(json_extract(a.metrics,'$.validated'), 1) = 1 ORDER BY a.started_at`
		)
		.all() as { t: number; lang: string; kind: string; valid: number; base: number | null; prompt: string }[];
}

export function vocabFunnel() {
	const r = sqlite.prepare("SELECT stage, count(*) n FROM vocab_entry WHERE stage != 'discarded' GROUP BY stage").all() as { stage: string; n: number }[];
	const m = Object.fromEntries(r.map((x) => [x.stage, x.n]));
	const tot = sqlite.prepare("SELECT count(*) n FROM card WHERE tags LIKE '%tot_item%'").get() as { n: number };
	const sticky = sqlite.prepare('SELECT count(*) n FROM card WHERE sticky = 1').get() as { n: number };
	return { inbox: m.inbox ?? 0, learning: m.learning ?? 0, active: m.active ?? 0, totCards: tot.n, sticky: sticky.n };
}

export function resumeHistory() {
	return sqlite
		.prepare(
			`SELECT started_at t, exercise, json_extract(scores,'$.TRA') score, json_extract(metrics,'$.resumeMs') resumeMs FROM attempt
			 WHERE exercise IN ('D1','D2') AND finished_at IS NOT NULL AND scores IS NOT NULL ORDER BY started_at`
		)
		.all() as { t: number; exercise: string; score: number | null; resumeMs: number | null }[];
}

export function streak(): number {
	const days = new Set((sqlite.prepare('SELECT DISTINCT started_at t FROM attempt WHERE finished_at IS NOT NULL AND started_at > ?').all(Date.now() - 400 * DAY) as { t: number }[]).map((r) => localDate(r.t)));
	const today = localDate();
	let n = 0;
	for (let i = 0; ; i++) {
		const d = addDays(today, -i);
		if (days.has(d)) n++;
		else if (i > 0) break;
	}
	return n;
}

export function snapshot() {
	const rows = sqlite.prepare('SELECT dimension, lang, rating, rd FROM skill_rating').all() as { dimension: Dim; lang: string; rating: number; rd: number }[];
	const recent = skillTrends(28);
	return (Object.keys(DIMS) as Dim[]).map((d) => ({
		dim: d,
		label: DIMS[d],
		ratings: rows.filter((r) => r.dimension === d),
		r7: [...(recent[d] ?? [])].reverse().find((x) => x.r7 != null)?.r7 ?? null
	}));
}

export function overridesCount() {
	return (sqlite.prepare('SELECT count(*) n FROM score_override').get() as { n: number }).n;
}

/** Count attempts, not judge retries or repeated edits to the same score. */
export function disputeAnalytics(days = 28) {
	const since = Date.now() - days * DAY;
	const judged = `SELECT DISTINCT a.id, a.exercise FROM attempt a JOIN judge_eval j ON j.attempt_id = a.id
		WHERE a.finished_at IS NOT NULL AND a.started_at >= ? AND j.ok = 1 AND j.rubric_id IS NOT NULL`;
	const drills = sqlite.prepare(`WITH judged AS (${judged})
		SELECT exercise, count(*) judged,
		sum(EXISTS (SELECT 1 FROM score_override o WHERE o.attempt_id = judged.id)) disputed
		FROM judged GROUP BY exercise ORDER BY exercise`).all(since) as { exercise: string; judged: number; disputed: number }[];
	const criteria = sqlite.prepare(`WITH criteria AS (
		SELECT DISTINCT a.id, a.exercise, c.key criterion
		FROM attempt a JOIN judge_eval j ON j.attempt_id = a.id, json_each(j.parsed, '$.scores') c
		WHERE a.finished_at IS NOT NULL AND a.started_at >= ? AND j.ok = 1 AND j.rubric_id IS NOT NULL
	)
		SELECT exercise, criterion, count(*) judged,
		sum(EXISTS (SELECT 1 FROM score_override o WHERE o.attempt_id = criteria.id AND o.criterion = criteria.criterion)) disputed
		FROM criteria GROUP BY exercise, criterion ORDER BY exercise, criterion`).all(since) as { exercise: string; criterion: string; judged: number; disputed: number }[];
	return drills.map((d) => ({ ...d, rate: d.disputed / d.judged, criteria: criteria.filter((c) => c.exercise === d.exercise).map((c) => ({ ...c, rate: c.disputed / c.judged })) }));
}

export function llmSpend(days = 30) {
	return sqlite
		.prepare('SELECT date, feature, sum(tokens_in) tin, sum(tokens_out) tout, sum(cost_usd) cost, count(*) calls FROM llm_usage WHERE created_at > ? GROUP BY date, feature ORDER BY date DESC')
		.all(Date.now() - days * DAY) as { date: string; feature: string; tin: number; tout: number; cost: number; calls: number }[];
}

// ---------------- overrides ----------------
/** Override one criterion (or the whole skill score with criterion "_score"); recomputes the skill score. */
export function overrideScore(attemptId: string, criterion: string, newScore: number, reason: string) {
	const a = getAttempt(attemptId);
	if (!a) throw new Error('attempt not found');
	const fb = { ...(a.feedback ?? {}) } as any;
	const scores = { ...(a.scores ?? {}) } as Record<string, number>;
	const dim = Object.keys(scores)[0];
	let old: number | null = null;
	if (criterion === '_score') {
		old = dim ? scores[dim] : null;
		if (dim) scores[dim] = newScore;
	} else {
		old = fb.scores?.[criterion] ?? null;
		fb.scores = { ...(fb.scores ?? {}), [criterion]: newScore };
		if (fb.rubric && dim) {
			const r = getRubric(fb.rubric);
			scores[dim] = rubricToScore(fb.scores, weightsOf(r));
			if (a.exercise === 'C3') scores[dim] = reentryScore(scores[dim], Number(a.metrics?.elapsedMs ?? 0));
		}
	}
	db.insert(schema.scoreOverride).values({ id: newId('o'), attemptId, criterion, oldScore: old, newScore, reason }).run();
	db.update(schema.attempt).set({ feedback: fb, scores, overridden: true }).where(eq(schema.attempt.id, attemptId)).run();
	return { scores, feedback: fb };
}

export function recentAttempts(limit = 30) {
	return db.select().from(schema.attempt).orderBy(desc(schema.attempt.startedAt)).limit(limit).all();
}

/** Counts check-in days. Correlations with scores are planned, and would need at least 20 days. */
export function stateCorrelations() {
	const ck = sqlite.prepare('SELECT * FROM daily_checkin').all() as any[];
	return { days: ck.length, ready: ck.length >= 20 };
}

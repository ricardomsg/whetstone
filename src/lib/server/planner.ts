import { eq, desc } from 'drizzle-orm';
import { db, schema, sqlite } from './db';
import { newId } from '$lib/core/ids';
import { localDate } from '$lib/server/dates';
import { getSettings } from './settings';
import { dueCount, reviewsToday, countWhere, type Dim, DIMS } from './services';
import { PAUSED } from '$lib/content/paused';

// ---------------- F1 check-in ----------------
export function todayCheckin() {
	return db.select().from(schema.dailyCheckin).where(eq(schema.dailyCheckin.date, localDate())).get() ?? null;
}
export function saveCheckin(p: { sleepHours?: number; sleepQuality?: number; energy?: number; stress?: number; exercise?: string; mainLanguage?: string }) {
	const date = localDate();
	db.insert(schema.dailyCheckin).values({ date, ...p }).onConflictDoUpdate({ target: schema.dailyCheckin.date, set: p }).run();
}

// ---------------- weakness map ----------------
export interface Weakness {
	key: string;
	label: string;
	attempts: number;
	failRate: number;
	recentRate: number; // last 7 days
	priorRate: number | null; // the 21 days before
	exercise: string;
	lang: string;
}

const POS: Record<string, string> = { noun: 'nouns', verb: 'verbs', adj: 'adjectives', adv: 'adverbs' };
const BAND: Record<number, string> = { 1: 'very common', 2: 'common', 3: 'less common', 4: 'rare' };

/** Failure (A1: not solved unaided; others: score < 60) by sub-dimension over 28 days, min 5 attempts. */
export function weaknesses(): Weakness[] {
	const since = Date.now() - 28 * 86400_000;
	const week = Date.now() - 7 * 86400_000;
	const rows = sqlite
		.prepare(
			`SELECT exercise, lang, started_at t, metrics, scores FROM attempt
			 WHERE finished_at IS NOT NULL AND started_at > ? AND benchmark_run_id IS NULL AND exercise IN ('A1','A2','A4','A8','B2','B3','D1','D2')`
		)
		.all(since) as { exercise: string; lang: string; t: number; metrics: string; scores: string }[];
	const groups = new Map<string, { label: string; exercise: string; lang: string; n: number; f: number; rn: number; rf: number; pn: number; pf: number }>();
	const add = (key: string, label: string, ex: string, lang: string, fail: boolean, t: number) => {
		const g = groups.get(key) ?? { label, exercise: ex, lang, n: 0, f: 0, rn: 0, rf: 0, pn: 0, pf: 0 };
		g.n++;
		if (fail) g.f++;
		if (t > week) {
			g.rn++;
			if (fail) g.rf++;
		} else {
			g.pn++;
			if (fail) g.pf++;
		}
		groups.set(key, g);
	};
	for (const r of rows) {
		const m = JSON.parse(r.metrics ?? '{}');
		const s = JSON.parse(r.scores ?? '{}');
		const L = r.lang === 'pt-PT' ? 'PT' : r.lang === 'en' ? 'EN' : '';
		if (r.exercise === 'A1') {
			const fail = !!m.revealed || (m.hints ?? 0) > 0 || !!m.tot;
			if (m.pos && POS[m.pos]) add(`A1:pos:${m.pos}:${r.lang}`, `${POS[m.pos]} in ${L}`, 'A1', r.lang, fail, r.t);
			if (m.band) add(`A1:band:${m.band}:${r.lang}`, `${BAND[m.band]} words in ${L}`, 'A1', r.lang, fail, r.t);
			if (m.concreteness) add(`A1:conc:${m.concreteness}:${r.lang}`, `${m.concreteness} words in ${L}`, 'A1', r.lang, fail, r.t);
		} else if (r.exercise === 'A8') {
			const fail = !!m.revealed || (m.hints ?? 0) > 0 || !!m.tot || !!m.trapHit;
			const dir = r.lang === 'pt-PT' ? 'into Portuguese' : 'into English';
			if (m.category) add(`A8:cat:${m.category}:${r.lang}`, `${String(m.category).replace(/-/g, ' ')} ${dir}`, 'A8', r.lang, fail, r.t);
		} else {
			const v = Object.values(s)[0] as number | undefined;
			if (typeof v !== 'number') continue;
			const name: Record<string, string> = { A2: 'fluency sprints', A4: 'precision picks', B2: 'vocabulary recall', B3: 'using new words', C2: 'conversation recall', C3: 'conversation re-entry', D1: 'resume-note quality', D2: 'resume recall' };
			add(`${r.exercise}:${r.lang}`, `${name[r.exercise]}${L && !r.exercise.startsWith('D') ? ` in ${L}` : ''}`, r.exercise, r.lang, v < 60, r.t);
		}
	}
	return [...groups.entries()]
		.filter(([, g]) => g.n >= 5)
		.map(([key, g]) => ({ key, label: g.label, attempts: g.n, failRate: g.f / g.n, recentRate: g.rn ? g.rf / g.rn : 0, priorRate: g.pn >= 3 ? g.pf / g.pn : null, exercise: g.exercise, lang: g.lang }))
		.sort((a, b) => b.failRate - a.failRate);
}

// ---------------- daily session generator ----------------
export interface PlanStep {
	exercise: string;
	lang: string;
	count: number;
	reason: string;
	href: string;
}

const MINUTES: Record<string, number> = { B2: 0.5, A1: 1, A2: 1.5, A4: 3, A8: 1, B3: 2, D2: 2 };

function sessionLang(pref: string): string {
	if (pref !== 'mixed') return pref;
	return Math.random() < 0.5 ? 'en' : 'pt-PT';
}

export function planToday(minutes?: number, lang?: string) {
	const s = getSettings();
	const date = localDate();
	const existing = db.select().from(schema.dailySession).where(eq(schema.dailySession.date, date)).orderBy(desc(schema.dailySession.createdAt)).get();
	if (existing && !minutes && !lang) return existing;
	const mins = minutes ?? s.sessionMinutes;
	const L = lang ?? s.defaultLang;
	let budget = mins;
	const plan: PlanStep[] = [];
	const q = (ex: string, l: string) => `/x/${ex.toLowerCase()}?lang=${encodeURIComponent(l)}`;

	// 1. due reviews, capped; every due card in either language, so none is left behind
	const due = Math.min(dueCount(), s.reviewCap, Math.floor((mins * 0.35) / MINUTES.B2));
	if (due > 0) {
		plan.push({ exercise: 'B2', lang: 'mixed', count: due, reason: `${due} card${due > 1 ? 's' : ''} due for productive review.`, href: q('B2', 'mixed') });
		budget -= due * MINUTES.B2;
	}
	// 2. drills targeting the top weaknesses
	const weak = weaknesses().filter((w) => ['A1', 'A2', 'A4', 'A8', 'B3'].includes(w.exercise) && !PAUSED[w.exercise]);
	for (const w of weak.slice(0, mins >= 15 ? 2 : 1)) {
		if (plan.some((p) => p.exercise === w.exercise && p.lang === w.lang)) continue;
		const n = w.exercise === 'A1' || w.exercise === 'A8' ? 5 : w.exercise === 'A2' ? 2 : 1;
		const trend =
			w.priorRate != null && w.recentRate > w.priorRate + 0.05
				? `Your failure rate on ${w.label} rose from ${Math.round(w.priorRate * 100)}% to ${Math.round(w.recentRate * 100)}% this week.`
				: `${w.label[0].toUpperCase() + w.label.slice(1)} is your weakest area: ${Math.round(w.failRate * 100)}% of ${w.attempts} attempts needed help.`;
		plan.push({ exercise: w.exercise, lang: w.lang, count: n, reason: trend, href: q(w.exercise, w.lang) });
		budget -= n * (MINUTES[w.exercise] ?? 2);
	}
	// 3. core retrieval drill if not already present
	if (!plan.some((p) => p.exercise === 'A1') && budget > 3) {
		const l = sessionLang(L);
		const n = Math.max(3, Math.min(8, Math.floor(budget / 2)));
		plan.push({ exercise: 'A1', lang: l, count: n, reason: 'Core word-retrieval practice, aimed at about 75% success.', href: q('A1', l) });
		budget -= n * MINUTES.A1;
	}
	// 3b. English → Portuguese retrieval every day
	if (!PAUSED.A8 && !plan.some((p) => p.exercise === 'A8') && budget > 2) {
		const n = Math.max(3, Math.min(6, Math.floor(budget / 2)));
		plan.push({ exercise: 'A8', lang: 'pt-PT', count: n, reason: 'The English word tends to arrive first: practise finding the Portuguese one.', href: q('A8', 'pt-PT') });
		budget -= n * MINUTES.A8;
	}
	// 4. rotation: the least-recently practised skill
	const last = (ex: string) => (sqlite.prepare('SELECT max(started_at) t FROM attempt WHERE exercise = ?').get(ex) as { t: number | null }).t ?? 0;
	const rotation = ['A2', 'A4', 'B3']
		.filter((ex) => !plan.some((p) => p.exercise === ex))
		.filter((ex) => ex !== 'B3' || countWhere('vocab_entry', "stage = 'learning'") > 0)
		.sort((a, b) => last(a) - last(b));
	if (rotation[0] && budget > 1) {
		const ex = rotation[0];
		const l = sessionLang(L);
		const days = last(ex) ? Math.round((Date.now() - last(ex)) / 86400_000) : null;
		plan.push({ exercise: ex, lang: l, count: 1, reason: days == null ? `Not practised yet: rotation keeps every skill in play.` : days === 0 ? 'Rotation keeps every skill in play.' : `Last practised ${days} day${days === 1 ? '' : 's'} ago: rotation keeps every skill in play.`, href: q(ex, l) });
	}
	const row = { id: newId('d'), date, minutes: mins, lang: L, plan, completed: [] as string[] };
	db.insert(schema.dailySession).values(row).run();
	return db.select().from(schema.dailySession).where(eq(schema.dailySession.id, row.id)).get()!;
}

/** Today's plan with its progress. A review step asks for no more cards than are done plus what the drill can still serve (due, and within the daily cap), so it finishes when nothing is left. */
export function todayPlan() {
	const plan = planToday();
	const progress = stepProgress(plan.id);
	const capLeft = Math.max(0, getSettings().reviewCap - reviewsToday());
	// a plan saved before an exercise was paused keeps its row; the paused step is only left out here
	const steps = (plan.plan as PlanStep[]).filter((p) => !PAUSED[p.exercise]).map((p) => (p.exercise === 'B2' ? { ...p, count: Math.min(p.count, (progress[`B2:${p.lang}`] ?? 0) + Math.min(dueCount(p.lang), capLeft)) } : p));
	return { plan: { ...plan, plan: steps }, progress };
}

export function stepProgress(sessionId: string) {
	const rows = sqlite
		.prepare('SELECT exercise, lang, count(*) n FROM attempt WHERE daily_session_id = ? AND finished_at IS NOT NULL GROUP BY exercise, lang')
		.all(sessionId) as { exercise: string; lang: string; n: number }[];
	const progress = Object.fromEntries(rows.map((r) => [`${r.exercise}:${r.lang}`, r.n]));
	for (const r of rows) {
		if (r.lang === 'en' || r.lang === 'pt-PT') {
			const key = `${r.exercise}:mixed`;
			progress[key] = (progress[key] ?? 0) + r.n;
		}
	}
	return progress;
}

export { DIMS, type Dim };

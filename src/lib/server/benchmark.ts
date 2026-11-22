import { eq, desc } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { db, schema, sqlite } from './db';
import { newId } from '$lib/core/ids';

// Benchmark battery v1: fixed format, parallel item sets (never practised), every 4 weeks.
// Sections: A1 ×10, A2 ×2 (one semantic, one letter), A4 ×2 or 3, then an optional D2 from real sessions.

export const SECTIONS = [
	{ key: 'A1', label: 'Definition → word', count: 10 },
	{ key: 'A2', label: 'Word Rush', count: 2 },
	{ key: 'A4', label: 'Precision picks', count: 2 }
] as const;

export function nextSet(lang: string): number {
	const used = sqlite.prepare('SELECT parallel_set s FROM benchmark_run WHERE lang = ? AND finished_at IS NOT NULL').all(lang) as { s: number }[];
	const sets = (sqlite.prepare("SELECT DISTINCT parallel_set s FROM item WHERE lang = ? AND parallel_set > 0 AND exercise='A1' ORDER BY s").all(lang) as { s: number }[]).map((r) => r.s);
	if (!sets.length) return 0;
	return sets.find((s) => !used.some((u) => u.s === s)) ?? sets[used.length % sets.length];
}

export function startRun(lang: string) {
	const set = nextSet(lang);
	if (!set) error(404, 'No benchmark item sets for this language. Run the seed.');
	const id = newId('b');
	const steps = SECTIONS.map((s) => ({ ...s, done: 0 }));
	db.insert(schema.benchmarkRun).values({ id, parallelSet: set, lang, startedAt: Date.now(), steps }).run();
	return id;
}

/** Word Rush rounds in this run that were checked and scored. A result needs one of each kind, so runs stay comparable. */
function fluencyCoverage(id: string) {
	const c = sqlite
		.prepare(`SELECT count(*) n, count(DISTINCT json_extract(metrics, '$.kind')) kinds, avg(json_extract(metrics, '$.valid')) v FROM attempt
			 WHERE benchmark_run_id = ? AND exercise = 'A2' AND finished_at IS NOT NULL
			 AND COALESCE(json_extract(metrics, '$.validated'), 1) = 1 AND json_extract(scores, '$.FL') IS NOT NULL`)
		.get(id) as { n: number; kinds: number; v: number | null };
	return { scored: c.n, complete: c.kinds === 2, valid: c.v };
}

export function getRun(id: string) {
	const r = db.select().from(schema.benchmarkRun).where(eq(schema.benchmarkRun.id, id)).get();
	if (!r) error(404, 'run not found');
	const counts = sqlite
		.prepare(`SELECT exercise, count(*) n, avg(COALESCE(json_extract(scores, '$.WR'), json_extract(scores, '$.FL'), json_extract(scores, '$.PR'))) s FROM attempt WHERE benchmark_run_id = ? AND finished_at IS NOT NULL GROUP BY exercise`)
		.all(id) as { exercise: string; n: number; s: number }[];
	const byEx = Object.fromEntries(counts.map((c) => [c.exercise, c]));
	const fluency = fluencyCoverage(id);
	const steps = SECTIONS.map((s) => ({
		...s,
		done: byEx[s.key]?.n ?? 0,
		avg: s.key === 'A2' && !fluency.complete ? null : (byEx[s.key]?.s ?? null),
		scored: s.key === 'A2' ? fluency.scored : null
	}));
	const current = steps.find((s) => s.done < s.count) ?? null;
	return { run: r, steps, current };
}

/** Items already used in this run are excluded so the set is walked without repeats. */
/** The Word Rush kind this run still needs, whichever was played first. */
export function missingFluencyKind(id: string): 'semantic' | 'letter' | null {
	const rows = sqlite
		.prepare(`SELECT DISTINCT json_extract(i.prompt, '$.kind') k FROM attempt a JOIN item i ON i.id = a.item_id
			 WHERE a.benchmark_run_id = ? AND a.exercise = 'A2' AND a.finished_at IS NOT NULL`)
		.all(id) as { k: string }[];
	const done = new Set(rows.map((r) => r.k));
	return (['semantic', 'letter'] as const).find((k) => !done.has(k)) ?? null;
}

export function usedItems(runId: string): string[] {
	return (sqlite.prepare('SELECT item_id FROM attempt WHERE benchmark_run_id = ? AND item_id IS NOT NULL').all(runId) as { item_id: string }[]).map((r) => r.item_id);
}

export function finishRun(id: string) {
	const { steps } = getRun(id);
	const a1 = sqlite
		.prepare("SELECT count(*) n, sum(json_extract(metrics,'$.tot')) tot, sum(CASE WHEN json_extract(scores,'$.WR') = 100 THEN 1 ELSE 0 END) unaided, avg(json_extract(metrics,'$.latencyMs')) lat FROM attempt WHERE benchmark_run_id = ? AND exercise='A1'")
		.get(id) as any;
	const fluency = fluencyCoverage(id);
	const results = {
		WR: steps.find((s) => s.key === 'A1')?.avg ?? null,
		FL: steps.find((s) => s.key === 'A2')?.avg ?? null,
		PR: steps.find((s) => s.key === 'A4')?.avg ?? null,
		totRate: a1.n ? a1.tot / a1.n : null,
		unaidedRate: a1.n ? a1.unaided / a1.n : null,
		meanLatencyMs: a1.lat,
		fluencyValid: fluency.complete ? fluency.valid : null,
		fluencyScored: fluency.scored
	};
	db.update(schema.benchmarkRun).set({ finishedAt: Date.now(), results }).where(eq(schema.benchmarkRun.id, id)).run();
	return results;
}

export function runs() {
	return db.select().from(schema.benchmarkRun).orderBy(desc(schema.benchmarkRun.startedAt)).all();
}

import { and, eq, sql } from 'drizzle-orm';
import { db, schema, sqlite } from './db';
import { newId } from '$lib/core/ids';
import { startOfToday } from '$lib/server/dates';
import { update, initialItemRating, type Rating2 } from '$lib/core/glicko2';
import { selectFresh } from '$lib/core/rotation';
import { newCardState, review, type StoredCard } from '$lib/core/srs';
import type { Grade } from 'ts-fsrs';
import type { Lang } from './db/schema';
import { PAUSED } from '$lib/content/paused';

export type Dim = 'WR' | 'FL' | 'PR' | 'VOC' | 'TRP' | 'TRA' | 'STR';
export const DIMS: Record<Dim, string> = {
	WR: 'Word retrieval',
	FL: 'Verbal fluency',
	PR: 'Lexical precision',
	VOC: 'Active vocabulary',
	TRP: 'Topic recall, people',
	TRA: 'Context resumption',
	STR: 'Structured expression'
};

// ---------- lexicon ----------
const zipfStmt = sqlite.prepare('SELECT zipf FROM lexicon WHERE lang = ? AND word = ?');
export function zipfOf(word: string, lang: Lang): number | null {
	const r = zipfStmt.get(lang === 'pt-PT' ? 'pt' : 'en', word.toLowerCase()) as { zipf: number } | undefined;
	return r?.zipf ?? null;
}
export function bandOf(zipf: number | null): number | null {
	if (zipf == null) return null;
	return zipf >= 4.5 ? 1 : zipf >= 3.5 ? 2 : zipf >= 2.5 ? 3 : 4;
}
export function hasLexicon(lang: string): boolean {
	const code = lang === 'pt-PT' ? 'pt' : lang;
	return !!sqlite.prepare('SELECT 1 FROM lexicon WHERE lang = ? LIMIT 1').get(code);
}

export function lexiconSize(): number {
	return (sqlite.prepare('SELECT count(*) n FROM lexicon').get() as { n: number }).n;
}

// ---------- skill ratings ----------
export function getSkill(dim: Dim, lang: string): Rating2 {
	const r = db.select().from(schema.skillRating).where(and(eq(schema.skillRating.dimension, dim), eq(schema.skillRating.lang, lang))).get();
	return r ?? { rating: 1500, rd: 350, vol: 0.06 };
}

/** One attempt = one Glicko game between the skill (per language) and the item. Score in [0,1]. */
export function rate(dim: Dim, lang: string, itemId: string | null, score01: number, attemptId: string) {
	const me = getSkill(dim, lang);
	const it = itemId ? db.select().from(schema.item).where(eq(schema.item.id, itemId)).get() : undefined;
	const opp: Rating2 = it ? { rating: it.rating, rd: it.rd, vol: it.vol } : { rating: 1500, rd: 200, vol: 0.06 };
	const next = update(me, opp, score01);
	db.insert(schema.skillRating)
		.values({ dimension: dim, lang, ...next })
		.onConflictDoUpdate({ target: [schema.skillRating.dimension, schema.skillRating.lang], set: { ...next, updatedAt: Date.now() } })
		.run();
	db.insert(schema.skillRatingHistory).values({ id: newId('h'), dimension: dim, lang, attemptId, before: me.rating, after: next.rating }).run();
	if (it) {
		const itemNext = update(opp, me, 1 - score01, { minRd: 50 });
		db.update(schema.item).set(itemNext).where(eq(schema.item.id, it.id)).run();
	}
	return { before: me.rating, after: next.rating };
}

// ---------- items ----------
export type ItemRow = typeof schema.item.$inferSelect;

const COOLDOWN_DAYS: Record<string, number> = { A1: 14, A2: 7, A4: 14, A8: 14 };

/** When each item was last shown (any attempt, finished or not: a shown prompt counts as seen). */
function lastSeenMap(exercise: string, lang: Lang): Map<string, number> {
	const rows = sqlite
		.prepare('SELECT item_id id, max(started_at) t FROM attempt WHERE exercise = ? AND lang = ? AND item_id IS NOT NULL AND benchmark_run_id IS NULL GROUP BY item_id')
		.all(exercise, lang) as { id: string; t: number }[];
	const seen = new Map(rows.map((r) => [r.id, r.t]));
	// A card whose definition was shown for an answer in the other language counts as seen too.
	const shown = sqlite
		.prepare("SELECT json_extract(input, '$.shownDef') id, max(started_at) t FROM attempt WHERE exercise = ? AND json_extract(input, '$.shownDef') IS NOT NULL AND benchmark_run_id IS NULL GROUP BY 1")
		.all(exercise) as { id: string; t: number }[];
	for (const r of shown) seen.set(r.id, Math.max(seen.get(r.id) ?? 0, r.t));
	return seen;
}

function practiceItems(exercise: string, lang: Lang): ItemRow[] {
	return (sqlite.prepare('SELECT * FROM item WHERE exercise = ? AND lang = ? AND parallel_set = 0 AND active = 1').all(exercise, lang) as any[]).map(toItem);
}

/**
 * Choose the next practice item: unseen items first, repeats only once the roster is exhausted
 * (see core/rotation.ts), aimed at ~75% expected success. Benchmark sets (parallelSet > 0) are
 * never used in practice; within a benchmark run each item is used once.
 */
export function chooseItem(
	exercise: string,
	lang: Lang,
	dim: Dim,
	opts: { parallelSet?: number; preferSources?: string[]; exclude?: string[]; where?: (it: ItemRow) => boolean } = {}
): ItemRow | undefined {
	const set = opts.parallelSet ?? 0;
	if (set) {
		const pool = (sqlite.prepare('SELECT * FROM item WHERE exercise = ? AND lang = ? AND parallel_set = ? AND active = 1').all(exercise, lang, set) as any[])
			.map(toItem)
			.filter((r) => !opts.exclude?.includes(r.id) && (!opts.where || opts.where(r)));
		return pool[Math.floor(Math.random() * pool.length)];
	}
	const pool = practiceItems(exercise, lang).filter((r) => !opts.exclude?.includes(r.id) && (!opts.where || opts.where(r)));
	return selectFresh(pool, lastSeenMap(exercise, lang), getSkill(dim, lang), {
		cooldownMs: (COOLDOWN_DAYS[exercise] ?? 7) * 86400_000,
		preferSources: opts.preferSources
	}).item;
}

/** Items of an exercise and language shown in practice within the last `days` days. */
export function recentItems(exercise: string, lang: Lang, days: number): Set<string> {
	const rows = sqlite
		.prepare('SELECT DISTINCT item_id id FROM attempt WHERE exercise = ? AND lang = ? AND item_id IS NOT NULL AND benchmark_run_id IS NULL AND started_at > ?')
		.all(exercise, lang, Date.now() - days * 86400_000) as { id: string }[];
	return new Set(rows.map((r) => r.id));
}

/** How much of each practice roster has been shown at least once. */
export function coverage(): { exercise: string; lang: string; seen: number; total: number }[] {
	return sqlite
		.prepare(
			`SELECT i.exercise, i.lang, count(*) total,
			   sum(CASE WHEN EXISTS (SELECT 1 FROM attempt a WHERE a.item_id = i.id AND a.benchmark_run_id IS NULL) THEN 1 ELSE 0 END) seen
			 FROM item i WHERE i.parallel_set = 0 AND i.active = 1 GROUP BY i.exercise, i.lang ORDER BY i.exercise, i.lang`
		)
		.all() as any[];
}

function toItem(r: any): ItemRow {
	return {
		id: r.id,
		exercise: r.exercise,
		lang: r.lang,
		target: r.target,
		prompt: JSON.parse(r.prompt),
		pos: r.pos,
		zipf: r.zipf,
		band: r.band,
		concreteness: r.concreteness,
		rating: r.rating,
		rd: r.rd,
		vol: r.vol,
		source: r.source,
		parallelSet: r.parallel_set,
		active: !!r.active,
		createdAt: r.created_at
	};
}

export function getItem(id: string): ItemRow | undefined {
	return db.select().from(schema.item).where(eq(schema.item.id, id)).get();
}

/** Create a retrieval item (A1 format) from a personal word: TOT log or vocabulary inbox. */
export function createPersonalItem(p: {
	source: 'tot_log' | 'inbox';
	lang: Lang;
	target: string;
	definition: string;
	example?: string;
	pos?: string;
	hints?: Record<string, unknown>;
	concreteness?: string;
}): ItemRow {
	const zipf = zipfOf(p.target, p.lang);
	const band = bandOf(zipf);
	const id = newId(p.source === 'tot_log' ? 'tot' : 'voc');
	const row = {
		id,
		exercise: 'A1',
		lang: p.lang,
		target: p.target,
		prompt: { definition: p.definition, example: p.example ?? '', hints: p.hints ?? {}, accept: [p.target] },
		pos: p.pos ?? null,
		zipf,
		band,
		concreteness: p.concreteness ?? null,
		rating: initialItemRating({ band, pos: p.pos, concreteness: p.concreteness }),
		rd: 250,
		vol: 0.06,
		source: p.source,
		parallelSet: 0,
		active: true
	};
	db.insert(schema.item).values(row).run();
	return getItem(id)!;
}

// ---------- cards ----------
export type CardRow = typeof schema.card.$inferSelect;

export function ensureCard(itemId: string, tags: string[], vocabId?: string): CardRow {
	const existing = db.select().from(schema.card).where(and(eq(schema.card.itemId, itemId), eq(schema.card.direction, 'productive'))).get();
	if (existing) {
		const merged = Array.from(new Set([...existing.tags, ...tags]));
		if (merged.length !== existing.tags.length) db.update(schema.card).set({ tags: merged }).where(eq(schema.card.id, existing.id)).run();
		return { ...existing, tags: merged };
	}
	const st = newCardState();
	const row = { id: newId('c'), itemId, vocabId, direction: 'productive', fsrs: st as any, due: st.due, tags, sticky: false, suspended: false };
	db.insert(schema.card).values(row).run();
	return db.select().from(schema.card).where(eq(schema.card.id, row.id)).get()!;
}

export function markSticky(itemId: string) {
	db.update(schema.card).set({ sticky: true }).where(eq(schema.card.itemId, itemId)).run();
}

export function reviewsToday(): number {
	return (sqlite.prepare('SELECT count(*) n FROM review_log WHERE created_at >= ?').get(startOfToday()) as { n: number }).n;
}

/**
 * Due, and not already reviewed today: a card answered today waits for tomorrow, whatever its learning step says.
 * Cards whose item belongs to a paused exercise wait too, keeping their schedule.
 */
function dueWhere(lang?: string) {
	const byLang = lang && lang !== 'mixed';
	const paused = Object.keys(PAUSED);
	return {
		sql: `c.suspended = 0 AND i.active = 1 AND c.due <= ? AND NOT EXISTS (SELECT 1 FROM review_log r WHERE r.card_id = c.id AND r.created_at >= ?) ${paused.length ? `AND i.exercise NOT IN (${paused.map(() => '?').join(',')})` : ''} ${byLang ? 'AND i.lang = ?' : ''}`,
		args: [Date.now(), startOfToday(), ...paused, ...(byLang ? [lang] : [])] as unknown[]
	};
}

export function dueCards(limit: number, lang?: string): (CardRow & { item: ItemRow })[] {
	const w = dueWhere(lang);
	const rows = sqlite
		.prepare(`SELECT c.id FROM card c JOIN item i ON i.id = c.item_id WHERE ${w.sql} ORDER BY c.sticky DESC, c.due ASC LIMIT ?`)
		.all(...([...w.args, limit] as any[])) as { id: string }[];
	return rows.map((r) => {
		const c = db.select().from(schema.card).where(eq(schema.card.id, r.id)).get()!;
		return { ...c, item: getItem(c.itemId)! };
	});
}

export function dueCount(lang?: string): number {
	const w = dueWhere(lang);
	return (sqlite.prepare(`SELECT count(*) n FROM card c JOIN item i ON i.id = c.item_id WHERE ${w.sql}`).get(...(w.args as any[])) as { n: number }).n;
}

export function applyReview(cardId: string, computed: Grade, final: Grade, meta: { attemptId?: string; latencyMs?: number; hints?: number }) {
	const c = db.select().from(schema.card).where(eq(schema.card.id, cardId)).get();
	if (!c) throw new Error('card not found');
	const r = review(c.fsrs as unknown as StoredCard, final);
	db.update(schema.card).set({ fsrs: r.card as any, due: r.card.due }).where(eq(schema.card.id, cardId)).run();
	db.insert(schema.reviewLog)
		.values({ id: newId('r'), cardId, attemptId: meta.attemptId, gradeComputed: computed, gradeFinal: final, latencyMs: meta.latencyMs, hints: meta.hints ?? 0, log: r.log as any })
		.run();
	return r.card;
}

// ---------- attempts ----------
export type AttemptRow = typeof schema.attempt.$inferSelect;

export function startAttempt(p: { exercise: string; lang: Lang; itemId?: string | null; input?: Record<string, any>; dailySessionId?: string | null; benchmarkRunId?: string | null }): AttemptRow {
	const row = {
		id: newId('a'),
		exercise: p.exercise,
		itemId: p.itemId ?? null,
		lang: p.lang,
		dailySessionId: p.dailySessionId ?? null,
		benchmarkRunId: p.benchmarkRunId ?? null,
		startedAt: Date.now(),
		input: p.input ?? {},
		timings: {},
		hintsUsed: 0
	};
	db.insert(schema.attempt).values(row).run();
	return getAttempt(row.id)!;
}

export function getAttempt(id: string): AttemptRow | undefined {
	return db.select().from(schema.attempt).where(eq(schema.attempt.id, id)).get();
}

export function patchAttempt(id: string, patch: Partial<AttemptRow>) {
	db.update(schema.attempt).set(patch).where(eq(schema.attempt.id, id)).run();
}

/** Mark a step of today's session or a benchmark run as done when an attempt finishes. */
export function finishAttempt(id: string, patch: Partial<AttemptRow>) {
	patchAttempt(id, { ...patch, finishedAt: Date.now() });
	const a = getAttempt(id)!;
	if (a.dailySessionId) {
		const s = db.select().from(schema.dailySession).where(eq(schema.dailySession.id, a.dailySessionId)).get();
		if (s) db.update(schema.dailySession).set({ completed: [...s.completed, a.id] }).where(eq(schema.dailySession.id, s.id)).run();
	}
	return a;
}

export function countWhere(table: string, where = '1=1', ...args: unknown[]): number {
	return (sqlite.prepare(`SELECT count(*) n FROM ${table} WHERE ${where}`).get(...(args as any[])) as { n: number }).n;
}

export { sql };

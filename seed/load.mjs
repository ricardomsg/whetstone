#!/usr/bin/env node
// Load seed content into SQLite. Idempotent: items are upserted by id, keeping their learned
// ratings; the lexicon is replaced. Usage: npm run seed
import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';

if (existsSync('.env') && !process.env.WS_ENV_LOADED) process.loadEnvFile('.env');
const dataDir = resolve(process.env.WS_DATA_DIR ?? './data');
mkdirSync(dataDir, { recursive: true });
const db = new Database(process.env.WS_DB_PATH ?? join(dataDir, 'whetstone.db'));
db.pragma('journal_mode = WAL');
migrate(drizzle(db), { migrationsFolder: resolve(process.env.WS_MIGRATIONS_DIR ?? './src/lib/server/db/migrations') });

// Same formula as initialItemRating() in src/lib/core/glicko2.ts.
const initialRating = (band, pos, conc) => 1500 + ((band ?? 2) - 2) * 150 + (pos === 'verb' ? 30 : 0) + (conc === 'abstract' ? 50 : 0);

const upsert = db.prepare(`INSERT INTO item (id, exercise, lang, target, prompt, pos, zipf, band, concreteness, rating, rd, vol, source, parallel_set, active, created_at)
	VALUES (@id, @exercise, @lang, @target, @prompt, @pos, @zipf, @band, @concreteness, @rating, 350, 0.06, 'seed', @parallelSet, @active, @now)
	ON CONFLICT(id) DO UPDATE SET target=excluded.target,
	prompt=CASE WHEN item.exercise = 'A4' AND json_type(item.prompt, '$.reference') = 'object' AND item.target IS excluded.target
		AND json_extract(item.prompt, '$.sentence') IS json_extract(excluded.prompt, '$.sentence')
		AND json_extract(item.prompt, '$.register') IS json_extract(excluded.prompt, '$.register')
		THEN json_set(excluded.prompt, '$.reference', json(json_extract(item.prompt, '$.reference'))) ELSE excluded.prompt END,
	pos=excluded.pos, zipf=excluded.zipf, band=excluded.band,
	concreteness=excluded.concreteness, parallel_set=excluded.parallel_set, active=excluded.active`);

const now = Date.now();
let counts = {};
const add = (ex, rows) => {
	const tx = db.transaction((rs) => {
		for (const r of rs) upsert.run({ active: 1, ...r });
	});
	tx(rows);
	counts[ex] = (counts[ex] ?? 0) + rows.length;
};

const itemsDir = 'seed/items';
for (const f of existsSync(itemsDir) ? readdirSync(itemsDir).filter((f) => f.endsWith('.json')) : []) {
	const arr = JSON.parse(readFileSync(join(itemsDir, f), 'utf8'));
	if (f.startsWith('a1.')) {
		add('A1', arr.map((it) => ({
			id: it.id, exercise: 'A1', lang: it.lang, target: it.target,
			prompt: JSON.stringify({ definition: it.definition, example: it.example ?? '', hints: it.hints ?? {}, accept: it.accept ?? [it.target] }),
			pos: it.pos ?? null, zipf: it.zipf ?? null, band: it.band ?? null, concreteness: it.concreteness ?? null,
			rating: initialRating(it.band, it.pos, it.concreteness), parallelSet: it.parallelSet ?? 0, now
		})));
	} else if (f.startsWith('a8.')) {
		// A8: the item language is the answer's; B2 review reads definition and example (see reviewFields in a8.ts).
		add('A8', arr.map((it) => ({
			id: it.id, exercise: 'A8', lang: it.lang, target: it.target,
			prompt: JSON.stringify({
				cue: it.cue, context: it.context, gapped: it.gapped, trap: it.trap ?? '', note: it.note ?? '', kind: it.kind, category: it.category,
				accept: it.accept ?? [], hints: it.hints ?? {},
				definition: it.lang === 'pt-PT' ? `In Portuguese: “${it.cue}”, as in “${it.context}”` : `Em inglês: “${it.cue}”, como em “${it.context}”`,
				example: it.gapped
			}),
			pos: it.pos ?? null, zipf: null, band: null, concreteness: null,
			rating: 1500 + ((it.difficulty ?? 2) - 2) * 150, parallelSet: it.parallelSet ?? 0, now,
			active: it.retired ? 0 : 1 // a retired item keeps its id and history but is never asked again
		})));
	} else if (f.startsWith('a4.')) {
		add('A4', arr.map((it) => ({
			id: it.id, exercise: 'A4', lang: it.lang, target: it.target,
			prompt: JSON.stringify({ sentence: it.sentence, register: it.register }),
			pos: null, zipf: null, band: null, concreteness: null,
			rating: 1500 + ((it.difficulty ?? 2) - 2) * 150, parallelSet: it.parallelSet ?? 0, now
		})));
	}
}
// A1 matching cards across languages: each card's prompt.pair names its match (see seed/scripts/a1_twins.py).
const pairsFile = join(itemsDir, 'pairs.a1.json');
if (existsSync(pairsFile)) {
	const setPair = db.prepare("UPDATE item SET prompt = json_set(prompt, '$.pair', ?) WHERE id = ? AND exercise = 'A1'");
	const pairs = JSON.parse(readFileSync(pairsFile, 'utf8'));
	db.transaction(() => {
		for (const p of pairs) {
			// Link only when both cards exist, so no card points at a missing match.
			const both = db.prepare("SELECT count(*) n FROM item WHERE id IN (?, ?) AND exercise = 'A1'").get(p.en, p['pt-PT']).n === 2;
			if (!both) {
				console.warn(`A1 pair skipped, a card is missing: ${p.en} / ${p['pt-PT']}`);
				continue;
			}
			setPair.run(p['pt-PT'], p.en);
			setPair.run(p.en, p['pt-PT']);
		}
	})();
	counts['A1 pairs'] = pairs.length;
}
const a2 = 'content/prompts/a2.json';
if (existsSync(a2)) {
	add('A2', JSON.parse(readFileSync(a2, 'utf8')).map((it) => ({
		id: it.id, exercise: 'A2', lang: it.lang, target: null,
		prompt: JSON.stringify({ kind: it.kind, prompt: it.prompt }),
		pos: null, zipf: null, band: null, concreteness: null,
		rating: 1500 + ((it.difficulty ?? 2) - 2) * 150, parallelSet: it.parallelSet ?? 0, now
	})));
}

for (const [file, lang] of [['seed/lexicon/en.tsv.gz', 'en'], ['seed/lexicon/pt.tsv.gz', 'pt']]) {
	if (!existsSync(file)) {
		counts[`lexicon ${lang}`] = 'not built (run npm run lexicon)';
		continue;
	}
	const lines = gunzipSync(readFileSync(file)).toString('utf8').split('\n').filter(Boolean);
	const have = db.prepare('SELECT count(*) n FROM lexicon WHERE lang = ?').get(lang).n;
	if (have === lines.length) {
		counts[`lexicon ${lang}`] = `${have} (unchanged)`;
		continue;
	}
	const ins = db.prepare('INSERT OR REPLACE INTO lexicon (lang, word, zipf) VALUES (?, ?, ?)');
	db.transaction(() => {
		db.prepare('DELETE FROM lexicon WHERE lang = ?').run(lang);
		for (const l of lines) {
			const [w, z] = l.split('\t');
			if (w && z) ins.run(lang, w, Number(z));
		}
	})();
	counts[`lexicon ${lang}`] = lines.length;
}

// Refresh zipf/band on personal items now that the lexicon may have grown.
db.prepare(`UPDATE item SET zipf = (SELECT zipf FROM lexicon l WHERE l.lang = CASE item.lang WHEN 'pt-PT' THEN 'pt' ELSE 'en' END AND l.word = lower(item.target))
	WHERE source IN ('tot_log','inbox') AND zipf IS NULL`).run();

console.log('Seeded:', counts);

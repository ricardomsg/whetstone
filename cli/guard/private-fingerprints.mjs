#!/usr/bin/env node
// Builds the private fingerprints the public guard checks commits against: every run of eight
// words in your own data, hashed, so the guard can recognise private text without storing it.
// Reads the configuration in ~/.config/whetstone/public-guard.json (or WS_PUBLIC_GUARD_CONFIG):
//   "fingerprints": ["<output file>"],
//   "corpus": {
//     "database": "<a whetstone.db, or a folder whose newest */whetstone.db is used>",
//     "folders": ["<folders of your own Markdown or text files>"],
//     "transcripts": ["<Claude Code projects folders: only the messages you typed are read>"]
//   }
// Text already published on origin/main is left out, so public content never raises an alarm.
// Run it from the repository root. Nothing it reads is written anywhere but the hashes.

import { createReadStream, existsSync, readFileSync, readdirSync, statSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { shingles } from './shingles.mjs';

const cfgPath = process.env.WS_PUBLIC_GUARD_CONFIG ?? join(homedir(), '.config/whetstone/public-guard.json');
const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
const out = cfg.fingerprints?.[0];
if (!out || !cfg.corpus) throw new Error(`${cfgPath} needs "fingerprints" and "corpus"`);

const priv = new Set();
const counts = {};
const add = (source, text) => {
	if (typeof text !== 'string' || text.length < 30) return;
	counts[source] = (counts[source] ?? 0) + 1;
	for (const { h } of shingles(text)) priv.add(h);
};

// every string inside a value that may be JSON
function strings(v, acc = []) {
	if (typeof v === 'string') {
		const t = v.trim();
		if ((t.startsWith('{') || t.startsWith('[')) && t.length > 2) {
			try {
				return strings(JSON.parse(t), acc);
			} catch {}
		}
		acc.push(v);
	} else if (Array.isArray(v)) v.forEach((x) => strings(x, acc));
	else if (v && typeof v === 'object') Object.values(v).forEach((x) => strings(x, acc));
	return acc;
}

// 1. the database: everything you wrote or that was written about you; seed content is public
const SKIP_TABLES = new Set(['__drizzle_migrations', 'lexicon', 'rubric', 'auth_session', 'user_settings', 'skill_rating', 'skill_rating_history', 'benchmark_run', 'judge_eval', 'llm_usage', 'card', 'review_log']);
function newestDb(p) {
	if (statSync(p).isFile()) return p;
	const dbs = readdirSync(p)
		.map((d) => join(p, d, 'whetstone.db'))
		.filter((f) => existsSync(f))
		.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
	if (!dbs.length) throw new Error(`no */whetstone.db under ${p}`);
	return dbs[0];
}
if (cfg.corpus.database) {
	const file = newestDb(cfg.corpus.database);
	const { default: Database } = await import('better-sqlite3');
	const db = new Database(file, { readonly: true, fileMustExist: true });
	for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()) {
		if (SKIP_TABLES.has(name)) continue;
		const where = name === 'item' ? " WHERE source <> 'seed'" : '';
		for (const row of db.prepare(`SELECT * FROM "${name}"${where}`).iterate()) for (const s of strings(Object.values(row))) add(`database ${name}`, s);
	}
	db.close();
}

// 2. folders of your own writing
function* files(dir, exts) {
	for (const e of readdirSync(dir, { withFileTypes: true })) {
		if (e.name.startsWith('.')) continue;
		const p = join(dir, e.name);
		if (e.isDirectory()) yield* files(p, exts);
		else if (exts.test(e.name)) yield p;
	}
}
for (const dir of cfg.corpus.folders ?? []) for (const f of files(dir, /\.(md|txt)$/i)) add('folders', readFileSync(f, 'utf8'));

// 3. Claude Code transcripts: only the messages a person sent, never tool output or replies
const stripMeta = (t) => t.replace(/<(system-reminder|command-[\w-]+|local-command-[\w-]+)>[\s\S]*?<\/\1>/g, ' ');
for (const dir of cfg.corpus.transcripts ?? []) {
	for (const f of files(dir, /\.jsonl$/i)) {
		const rl = createInterface({ input: createReadStream(f), crlfDelay: Infinity });
		for await (const line of rl) {
			if (!line.includes('"type":"user"')) continue;
			let m;
			try {
				m = JSON.parse(line);
			} catch {
				continue;
			}
			if (m.type !== 'user' || m.isMeta || m.toolUseResult) continue;
			const c = m.message?.content;
			if (typeof c === 'string') add('transcripts', stripMeta(c));
			else if (Array.isArray(c)) for (const part of c) if (part?.type === 'text') add('transcripts', stripMeta(part.text));
		}
	}
}

// What is already published is not private: every file and commit message ever on origin/main.
// Never the working tree or local commits, which may hold the very text the guard must stop.
let removed = 0;
const PUBLIC = 'origin/main';
const have = (() => {
	try {
		execFileSync('git', ['rev-parse', '--verify', '-q', `${PUBLIC}^{commit}`], { stdio: 'ignore' });
		return true;
	} catch {
		return false;
	}
})();
const forget = (text) => {
	for (const { h } of shingles(text)) if (priv.delete(h)) removed++;
};
if (have) {
	// one cat-file process reads every blob ever published
	const objects = execFileSync('git', ['rev-list', '--objects', PUBLIC], { maxBuffer: 1 << 28 }).toString().split('\n').map((l) => l.split(' ')[0]).filter(Boolean);
	const types = execFileSync('git', ['cat-file', '--batch-check=%(objecttype) %(objectname)'], { input: objects.join('\n') + '\n', maxBuffer: 1 << 28 }).toString();
	const blobs = types.split('\n').filter((l) => l.startsWith('blob ')).map((l) => l.slice(5));
	const batch = execFileSync('git', ['cat-file', '--batch'], { input: blobs.join('\n') + '\n', maxBuffer: 1 << 30 });
	for (let at = 0; at < batch.length; ) {
		const nl = batch.indexOf(10, at);
		const size = Number(batch.subarray(at, nl).toString().split(' ')[2]);
		const buf = batch.subarray(nl + 1, nl + 1 + size);
		if (!buf.subarray(0, 8000).includes(0)) forget(buf.toString('utf8'));
		at = nl + 1 + size + 1;
	}
	forget(execFileSync('git', ['log', '--format=%B', PUBLIC], { maxBuffer: 1 << 28 }).toString());
} else console.warn(`private fingerprints: no ${PUBLIC} here, so nothing is left out as already public`);

mkdirSync(dirname(out), { recursive: true, mode: 0o700 });
const tmp = `${out}.tmp`;
// sorted 8-byte hashes, searched in place by the guard
const sorted = [...priv].sort();
const buf = Buffer.alloc(sorted.length * 8);
sorted.forEach((h, i) => buf.write(h, i * 8, 'hex'));
writeFileSync(tmp, buf, { mode: 0o600 });
renameSync(tmp, out);
console.log(`private fingerprints: ${priv.size} written to ${out} (${removed} already public, left out); texts read: ${JSON.stringify(counts)}`);

// The journal lives in a folder of Markdown files, not in the database. This module is the only code that touches it:
// it lists and reads entries, saves the written ones, and keeps reports and wording requests under Whetstone/.
import { createHash, randomBytes } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { error } from '@sveltejs/kit';
import { env } from '../env';
import { baselineOf, entryPathFor, journalDay, voiceTranscript, type Baseline } from '$lib/core/journal';

export type EntryKind = 'written' | 'voice';

export interface EntryMeta {
	id: string; // path relative to the journal folder, e.g. Journal/2026/26.10/2026-10-23.md
	day: string;
	title: string;
	kind: EntryKind;
	bytes: number;
}

const WRITTEN = /^Journal\/\d{4}\/\d{2}\.\d{2}\/[^/]+\.md$/;
const VOICE = /^Journal\/Voice Journals\/\d{4}-\d{2}-\d{2}[^/]*\.md$/;
const REPORTS = 'Whetstone/Reports';
const WORDING = 'Whetstone/Wording';

export function journalAvailable(): boolean {
	return !!env.journalDir && existsSync(join(env.journalDir, 'Journal'));
}

function root(): string {
	if (!journalAvailable()) error(503, 'The journal folder is not mounted (WS_JOURNAL_DIR).');
	return resolve(env.journalDir);
}

/**
 * Resolve a vault-relative path, refusing anything outside the journal folder, including through a symlink:
 * the nearest existing ancestor must really sit inside the folder, and the file itself must not be a link.
 */
function abs(rel: string): string {
	const r = root();
	const p = resolve(r, rel);
	if (!p.startsWith(r + sep) || rel.includes('\0')) error(400, 'Bad path');
	const realRoot = realpathSync(r);
	let probe = p;
	while (!present(probe)) probe = dirname(probe);
	const real = realpathSync(probe);
	if (real !== realRoot && !real.startsWith(realRoot + sep)) error(400, 'Bad path');
	if (present(p) && lstatSync(p).isSymbolicLink()) error(400, 'Bad path'); // a dangling link counts too
	return p;
}

/** Whether anything, a dangling symlink included, sits at the path. */
function present(p: string): boolean {
	try {
		lstatSync(p);
		return true;
	} catch {
		return false;
	}
}

/**
 * Write a file without ever leaving it half-written: the text goes to a temporary sibling, is flushed to disk,
 * and replaces the file in one rename. The name matches Syncthing's own temporary-file pattern, so it never syncs.
 */
function writeAtomic(p: string, text: string) {
	const tmp = join(dirname(p), `.syncthing.${basename(p)}.${randomBytes(4).toString('hex')}.whetstone.tmp`);
	const fd = openSync(tmp, 'wx'); // a new file only: never follows a link or reuses one left behind
	try {
		writeFileSync(fd, text, 'utf8'); // writes every byte, looping over short writes
		fsyncSync(fd);
	} finally {
		closeSync(fd);
	}
	if (statSync(tmp).size !== Buffer.byteLength(text, 'utf8')) {
		rmSync(tmp, { force: true });
		throw new Error('The journal file could not be written in full');
	}
	return tmp;
}

export function kindOf(id: string): EntryKind | null {
	if (id.includes('..')) return null;
	if (WRITTEN.test(id)) return 'written';
	if (VOICE.test(id)) return 'voice';
	return null;
}

/** A written entry's name starts with its date, and it sits in that date's year and month folder. */
function datedInPlace(id: string): boolean {
	const [, y, m, name] = id.split('/');
	const day = dayOf(name ?? '');
	return !!day && day.slice(0, 4) === y && `${day.slice(2, 4)}.${day.slice(5, 7)}` === m;
}

export const hashText = (t: string) => createHash('sha256').update(t).digest('hex').slice(0, 20);

function dayOf(name: string): string | null {
	return name.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
}

export function listEntries(): EntryMeta[] {
	const out: EntryMeta[] = [];
	const j = abs('Journal');
	// Real files and folders only: a symlink in the vault is never listed, read or written.
	const dirs = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
	const files = (d: string) => readdirSync(d, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.md')).map((e) => e.name);
	for (const y of dirs(j)) {
		if (!/^\d{4}$/.test(y)) continue;
		for (const m of dirs(join(j, y))) {
			if (!/^\d{2}\.\d{2}$/.test(m)) continue;
			for (const f of files(join(j, y, m))) {
				const day = dayOf(f);
				if (!day) continue;
				out.push({ id: `Journal/${y}/${m}/${f}`, day, title: f.slice(0, -3), kind: 'written', bytes: statSync(join(j, y, m, f)).size });
			}
		}
	}
	const v = abs('Journal/Voice Journals');
	if (existsSync(v)) {
		for (const f of files(v)) {
			const day = dayOf(f);
			if (!day) continue;
			out.push({ id: `Journal/Voice Journals/${f}`, day, title: f.slice(0, -3), kind: 'voice', bytes: statSync(join(v, f)).size });
		}
	}
	// Newest day first; on one day the written entry comes before the voice journal.
	return out.sort((a, b) => b.day.localeCompare(a.day) || (a.kind === b.kind ? a.title.localeCompare(b.title) : a.kind === 'written' ? -1 : 1));
}

export interface Entry extends EntryMeta {
	text: string;
	hash: string | null; // null while the file does not exist yet
	editable: boolean;
}

export function todayId(now = Date.now()): string {
	return entryPathFor(journalDay(now, env.timezone));
}

export function readEntry(id: string): Entry {
	const kind = kindOf(id);
	if (!kind) error(400, 'Not a journal entry');
	const p = abs(id);
	const name = id.split('/').pop()!;
	const exists = existsSync(p);
	if (!exists && kind === 'voice') error(404, 'No such entry');
	const text = exists ? readFileSync(p, 'utf8') : '';
	return { id, day: dayOf(name) ?? '', title: name.slice(0, -3), kind, bytes: text.length, text, hash: exists ? hashText(text) : null, editable: kind === 'written' && datedInPlace(id) };
}

export type SaveResult = { ok: true; hash: string; savedAt: number } | { ok: false; conflict: true; text: string; hash: string | null };

/**
 * Save a written entry. `baseHash` is the version the editor started from; if the file changed underneath
 * (Obsidian, Syncthing), nothing is written and the current text is returned instead.
 */
export function saveEntry(id: string, text: string, baseHash: string | null): SaveResult {
	if (kindOf(id) !== 'written' || !datedInPlace(id)) error(400, 'Only written entries can be edited');
	const p = abs(id);
	const current = existsSync(p) ? readFileSync(p, 'utf8') : null;
	const currentHash = current == null ? null : hashText(current);
	if (currentHash !== baseHash && current !== text) return { ok: false, conflict: true, text: current ?? '', hash: currentHash };
	mkdirSync(dirname(p), { recursive: true });
	const tmp = writeAtomic(p, text);
	// Check again right before replacing: Obsidian or Syncthing may have written while the copy was flushed.
	const now = existsSync(p) ? readFileSync(p, 'utf8') : null;
	if (now !== current) {
		rmSync(tmp, { force: true });
		return { ok: false, conflict: true, text: now ?? '', hash: now == null ? null : hashText(now) };
	}
	renameSync(tmp, p);
	return { ok: true, hash: hashText(text), savedAt: Date.now() };
}

/** The text worth analysing: the whole written entry, or only the machine transcript of a voice journal. */
export function analysableText(e: Entry): string {
	return e.kind === 'voice' ? voiceTranscript(e.text) : e.text;
}

let baseCache: { key: string; base: Baseline } | null = null;
/** Word rates over every written entry, cached until an entry is added or changes size. */
export function writtenBaseline(): Baseline {
	const metas = listEntries().filter((m) => m.kind === 'written');
	const key = `${metas.length}:${metas.reduce((s, m) => s + m.bytes, 0)}`;
	if (baseCache?.key === key) return baseCache.base;
	const base = baselineOf(metas.map((m) => readFileSync(abs(m.id), 'utf8')));
	baseCache = { key, base };
	return base;
}

// ---------- reports ----------

export interface ReportMeta {
	name: string;
	created: string;
	entries: string[];
}

function frontmatter(md: string): Record<string, string> {
	const m = md.match(/^---\n([\s\S]*?)\n---\n/);
	if (!m) return {};
	return Object.fromEntries(m[1].split('\n').map((l) => [l.slice(0, l.indexOf(':')).trim(), l.slice(l.indexOf(':') + 1).trim()]));
}

const REPORT_NAME = /^\d{4}-\d{2}-\d{2} \d{4}(?:-\d+)?$/;

export function listReports(): ReportMeta[] {
	const d = abs(REPORTS);
	if (!existsSync(d)) return [];
	return readdirSync(d, { withFileTypes: true })
		.filter((e) => e.isFile() && e.name.endsWith('.md') && REPORT_NAME.test(e.name.slice(0, -3)))
		.map((e) => e.name)
		.map((f) => {
			const fm = frontmatter(readFileSync(abs(`${REPORTS}/${f}`), 'utf8'));
			return { name: f.slice(0, -3), created: fm.created ?? '', entries: (fm.entries ?? '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).filter(Boolean) };
		})
		.sort((a, b) => b.name.localeCompare(a.name));
}

export function readReport(name: string): string {
	if (!REPORT_NAME.test(name)) error(400, 'Bad report name');
	const p = abs(`${REPORTS}/${name}.md`);
	if (!existsSync(p)) error(404, 'No such report');
	return readFileSync(p, 'utf8');
}

export function writeReport(stamp: string, md: string): string {
	const d = abs(REPORTS);
	mkdirSync(d, { recursive: true });
	let name = stamp,
		n = 2;
	while (existsSync(join(d, `${name}.md`))) name = `${stamp}-${n++}`;
	renameSync(writeAtomic(join(d, `${name}.md`), md), join(d, `${name}.md`));
	return name;
}

/** One line per wording request, in a monthly file, so the words the author keeps reaching for can become practice. */
export function logWording(line: string, month: string) {
	const p = abs(`${WORDING}/${month}.md`);
	mkdirSync(dirname(p), { recursive: true });
	if (!existsSync(p)) writeFileSync(p, `# Wording help, ${month}\n\nWhat was asked in the journal editor, and what was offered. Written by Whetstone.\n\n`, 'utf8');
	appendFileSync(p, line.replace(/\n+/g, ' ') + '\n', 'utf8');
}

/** Wiki-link target → app URL, for rendering reports. */
export function linkFor(target: string, metas: EntryMeta[]): string | null {
	const prefix = env.journalLinkPrefix;
	const id = (prefix && target.startsWith(prefix) ? target.slice(prefix.length) : target) + '.md';
	const m = metas.find((e) => e.id === id) ?? metas.find((e) => e.title === target);
	return m ? `/journal?e=${encodeURIComponent(m.id)}` : null;
}

/** Obsidian link to an entry. WS_JOURNAL_LINK_PREFIX is the journal folder's path from the vault root, if any. */
export function wikiLink(e: EntryMeta): string {
	return `[[${env.journalLinkPrefix}${e.id.slice(0, -3)}|${e.title}${e.kind === 'voice' ? ' (voice)' : ''}]]`;
}

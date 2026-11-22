import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, expect, it } from 'vitest';

const dir = mkdtempSync(join(tmpdir(), 'whetstone-seed-'));
const file = join(dir, 'seed.db');
const seed = () => execFileSync(process.execPath, ['seed/load.mjs'], { env: { ...process.env, WS_ENV_LOADED: '1', WS_DATA_DIR: dir, WS_DB_PATH: file }, stdio: 'pipe' });
const reference = { alternatives: [{ word: 'alpha', nuance: 'one', fits: true }], best: { word: 'alpha', why: 'fits' } };
afterAll(() => rmSync(dir, { recursive: true, force: true }));

it('keeps a cached A4 reference until its question changes', () => {
	seed();
	let db = new Database(file);
	const { id } = db.prepare("SELECT id FROM item WHERE exercise = 'A4' LIMIT 1").get() as { id: string };
	const prompt = () => JSON.parse((db.prepare('SELECT prompt FROM item WHERE id = ?').get(id) as { prompt: string }).prompt);
	db.prepare("UPDATE item SET prompt = json_set(prompt, '$.reference', json(?)) WHERE id = ?").run(JSON.stringify(reference), id);
	db.close();
	seed();
	db = new Database(file);
	expect(prompt().reference).toEqual(reference);
	db.prepare("UPDATE item SET prompt = json_set(prompt, '$.sentence', 'an older sentence') WHERE id = ?").run(id);
	db.close();
	seed();
	db = new Database(file);
	expect(prompt().reference).toBeUndefined();
	expect(prompt().sentence).not.toBe('an older sentence');
	db.close();
}, 60_000);

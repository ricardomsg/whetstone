import { beforeEach, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// The public guard runs in a throwaway repository with an invented private configuration.
const GUARD = resolve('cli/guard/public-guard.mjs');
const BUILD = resolve('cli/guard/private-fingerprints.mjs');
const NOREPLY = '123+someone@users.noreply.github.com';
// built from pieces, so this file does not trip the guard itself
const MAIL = ['alice', 'gmail.com'].join('@');
const KEY = ['sk', 'ant', 'abcdefghijklmnopqrstuvwxyz0123'].join('-');
const HOME = ['', 'home', 'alice', 'notes'].join('/');
let repo: string;
let env: NodeJS.ProcessEnv;

const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, env });
const guard = (...a: string[]) => spawnSync('node', [GUARD, ...a], { cwd: repo, env, encoding: 'utf8' });
const stage = (path: string, text: string) => {
	mkdirSync(join(repo, path, '..'), { recursive: true });
	writeFileSync(join(repo, path), text);
	git('add', path);
};

beforeEach(() => {
	const root = mkdtempSync(join(tmpdir(), 'guard-'));
	repo = join(root, 'repo');
	const priv = join(root, 'private');
	mkdirSync(repo);
	mkdirSync(priv);
	writeFileSync(join(priv, 'patterns'), '# invented\n\\bzorblax\\b\n');
	writeFileSync(join(priv, 'diary.md'), 'Tonight I finally told the landlord that the boiler has been broken since March.\n');
	writeFileSync(join(priv, 'config.json'), JSON.stringify({ patterns: join(priv, 'patterns'), fingerprints: [join(priv, 'fp')], corpus: { folders: [priv] } }));
	env = { ...process.env, WS_PUBLIC_GUARD_CONFIG: join(priv, 'config.json'), GIT_AUTHOR_NAME: 'someone', GIT_AUTHOR_EMAIL: NOREPLY, GIT_COMMITTER_NAME: 'someone', GIT_COMMITTER_EMAIL: NOREPLY };
	git('init', '-q');
	stage('README.md', 'A public readme.\n');
	git('commit', '-q', '--no-verify', '-m', 'start');
	execFileSync('node', [BUILD], { cwd: repo, env });
});

it('passes clean content', () => {
	stage('docs/a.md', 'An invented example sentence about practising words every morning.\n');
	expect(guard('--staged').status).toBe(0);
});

it('blocks secrets, personal details and data files', () => {
	stage('src/x.ts', `const key = '${KEY}';\nconst home = '${HOME}';\n// mail me at ${MAIL}\n`);
	stage('data/whetstone.db', 'x');
	const r = guard('--staged');
	expect(r.status).toBe(1);
	for (const rule of ['anthropic-key', 'home-path', 'email', 'data-folder', 'database']) expect(r.stderr).toContain(rule);
});

it('blocks a private pattern and private text, even reworded in case and punctuation', () => {
	stage('docs/b.md', 'Credit to Zorblax.\nEarlier: "tonight I finally told the landlord, that the boiler has been broken"\n');
	const r = guard('--staged');
	expect(r.status).toBe(1);
	expect(r.stderr).toContain('private-pattern-1');
	expect(r.stderr).toContain('docs/b.md:2  private-text');
});

it('blocks a personal commit address and a private commit message', () => {
	env.GIT_AUTHOR_EMAIL = MAIL;
	expect(guard('--staged').stderr).toContain('commit-identity');
	writeFileSync(join(repo, 'msg'), 'Fix what zorblax reported\n# a comment line is ignored\n');
	expect(guard('--message', 'msg').status).toBe(1);
});

it('checks every commit about to be pushed', () => {
	stage('a.txt', 'fine\n');
	git('commit', '-q', '--no-verify', '-m', 'fine');
	stage('b.txt', 'the boiler has been broken since March, I told the landlord tonight finally\n'.replace('the boiler', 'zorblax and the boiler'));
	git('commit', '-q', '--no-verify', '-m', 'second');
	const head = git('rev-parse', 'HEAD').toString().trim();
	const r = spawnSync('node', [GUARD, '--push'], { cwd: repo, env, encoding: 'utf8', input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n` });
	expect(r.status).toBe(1);
	expect(r.stderr).toContain('b.txt:1  private-pattern-1');
});

it('refuses to run without the private configuration, except in CI', () => {
	env.WS_PUBLIC_GUARD_CONFIG = join(repo, 'missing.json');
	stage('c.md', 'fine\n');
	expect(guard('--staged').status).toBe(1);
	const ci = guard('--staged', '--ci');
	expect(ci.status).toBe(0);
	stage('d.md', `write to ${MAIL}\n`);
	const leak = guard('--staged', '--ci');
	expect(leak.status).toBe(1);
	expect(leak.stderr).not.toContain(MAIL);
});

it('sees through accents, full-width letters and invisible characters', () => {
	stage('e.md', 'Thanks to Zórblax.\n');
	stage('f.md', 'Thanks to Ｚorbl​ax.\n');
	const r = guard('--staged');
	expect(r.stderr).toContain('e.md:1  private-pattern-1');
	expect(r.stderr).toContain('f.md:1  private-pattern-1');
});

it('reads UTF-16 text, and refuses other binary files unless allowed', () => {
	const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('ask zorblax\n', 'utf16le')]);
	writeFileSync(join(repo, 'g.txt'), utf16);
	writeFileSync(join(repo, 'h.bin'), Buffer.from([1, 0, 2, 0]));
	git('add', 'g.txt', 'h.bin');
	const r = guard('--staged');
	expect(r.stderr).toContain('g.txt:1  private-pattern-1');
	expect(r.stderr).toContain('h.bin  binary-file');
});

it('keeps lines starting with # in a message, and never lets the allow list switch off a private rule', () => {
	writeFileSync(join(repo, 'msg'), '#12 zorblax\n');
	expect(guard('--message', 'msg').status).toBe(1);
	stage('.public-guard-allow', '* private-pattern-1\n* private-text\n');
	stage('i.md', 'zorblax\n');
	expect(guard('--staged').stderr).toContain('i.md:1  private-pattern-1');
});

it('checks what a merge brings in when it is pushed', () => {
	git('checkout', '-q', '-b', 'side');
	stage('j.txt', 'side\n');
	git('commit', '-q', '--no-verify', '-m', 'side');
	git('checkout', '-q', '-');
	stage('k.txt', 'main\n');
	git('commit', '-q', '--no-verify', '-m', 'main');
	git('merge', '-q', '--no-commit', 'side');
	stage('j.txt', 'resolved by zorblax\n');
	git('commit', '-q', '--no-verify', '-m', 'merge');
	const head = git('rev-parse', 'HEAD').toString().trim();
	const r = spawnSync('node', [GUARD, '--push'], { cwd: repo, env, encoding: 'utf8', input: `refs/heads/main ${head} refs/heads/main ${'0'.repeat(40)}\n` });
	expect(r.stderr).toContain('j.txt:1  private-pattern-1');
});

it('ignores the diff that commit -v appends, and still allows public rules whose names start with private', () => {
	writeFileSync(join(repo, 'msg'), `Remove a leak\n# ------------------------ >8 ------------------------\n-write to ${MAIL}\n`);
	expect(guard('--message', 'msg').status).toBe(0);
	stage('.public-guard-allow', 'docs/* private-ip\n');
	stage('docs/l.md', `Open http://${['192', '168', '1', '10'].join('.')}:3000 on your network.\n`);
	expect(guard('--staged').status).toBe(0);
});

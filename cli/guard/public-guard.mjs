#!/usr/bin/env node
// The public guard: this repository is public, so nothing personal, private or secret may enter it.
// The git hooks in .githooks run it on every commit and push; CI runs it with --ci.
//
//   node cli/guard/public-guard.mjs --staged             files about to be committed, and the identity
//   node cli/guard/public-guard.mjs --message FILE       a commit message
//   node cli/guard/public-guard.mjs --push [REMOTE]      commits and tags about to be pushed (refs on stdin, as git gives them)
//   node cli/guard/public-guard.mjs --all                every file of every commit, every identity and message
//   add --ci                                             public rules only, and never print what matched
//
// Locally it also applies two private checks, configured outside the repository in
// ~/.config/whetstone/public-guard.json (or WS_PUBLIC_GUARD_CONFIG):
//   { "patterns": "<file of private regular expressions, one per line>",
//     "fingerprints": ["<file written by private-fingerprints.mjs>", ...] }
// Without that file the local run fails: a commit is only safe where the private checks can run.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { shingles, fingerprintSet } from './shingles.mjs';

const args = process.argv.slice(2);
const CI = args.includes('--ci');
const MAX_BYTES = 1_000_000;
const CHUNK = 4000; // long lines are matched in overlapping pieces, so no regex runs on a huge string
const DAY = 86_400_000;

// ---------- rules every copy of the repository applies ----------

const SECRET_RULES = [
	['private-key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
	['anthropic-key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
	['api-key', /\bsk-[A-Za-z0-9]{32,}\b/],
	['github-token', /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
	['aws-key', /\b(AKIA|ASIA)[0-9A-Z]{16}\b/],
	['slack-token', /\bxox[abprs]-[A-Za-z0-9-]{10,}/],
	['telegram-token', /\b\d{8,10}:AA[A-Za-z0-9_-]{33}\b/],
	['password-hash', /\$argon2(id|i|d)\$v=\d+\$m=\d+/],
	['jwt', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
	['secret-value', /^\s*(export\s+)?[A-Z0-9_]*(TOKEN|SECRET|PASSWORD|PASSPHRASE|API_KEY|HASH)[A-Z0-9_]*\s*=\s*['"]?[^\s'"]{12,}/],
	['secret-literal', /\b[\w-]*(token|secret|password|passphrase|api_?key)\w*["']?\s*[:=]\s*["'][A-Za-z0-9+/=_\-$.]{20,}["']/i]
];

const PERSONAL_RULES = [
	// example, GitHub no-reply and Anthropic's co-author addresses are allowed
	['email', /(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@(?!(?:[\w-]+\.)*(?:example\.(?:com|org|net)|users\.noreply\.github\.com|anthropic\.com)\b)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/, '@'],
	['tailnet-host', /\b[a-z0-9-]+\.[a-z0-9-]+\.ts\.net\b/i],
	['tailnet-ip', /\b100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/, '100.'],
	['private-ip', /\b(192\.168|10\.\d{1,3}|172\.(1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/],
	['home-path', /(\/home\/(?!user\/|node\/)[a-z_][a-z0-9_.-]*\/|\/Users\/(?!user\/)[A-Za-z][\w.-]*\/|[A-Z]:\\Users\\(?!user\\)[\w.-]+\\)/i]
];

// files that hold data, settings, secrets or archives, whatever they contain
const PATH_RULES = [
	['env-file', /(^|\/)\.env(\.(?!example$|test$)[^/]+)?$/i],
	['database', /\.(db|sqlite3?)(-wal|-shm|-journal)?$/i],
	['data-folder', /(^|\/)data\//i],
	['transcript', /\.jsonl$/i],
	['local-compose', /(^|\/)docker-compose\.override\.ya?ml$/i],
	['archive-or-key', /\.(bundle|enc|gpg|pem|key|p12|pfx|kdbx|zip|tar|gz|tgz|7z|rar|pdf|csv|tsv|xlsx?|docx?|odt|ods)$/i],
	['backup', /(^|\/)backups?\//i]
];

// ---------- helpers ----------

const git = (...a) => execFileSync('git', a, { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const gitText = (...a) => git(...a).toString();
const tryGit = (...a) => {
	try {
		return git(...a);
	} catch {
		return null;
	}
};
const findings = [];
const seen = new Set();
const report = (where, rule, text) => {
	const k = `${where}\0${rule}`;
	if (seen.has(k)) return;
	seen.add(k);
	findings.push({ where, rule, text: text?.slice(0, 90) });
};

/** Accents, compatibility forms (full-width letters) and invisible format characters removed. */
const fold = (s) => s.normalize('NFKD').replace(/\p{M}/gu, '').replace(/\p{Cf}/gu, '');

/** The allow list as committed: from the index when committing, else from HEAD. Private rules are never allowed. */
function allowList() {
	const text = (args.includes('--staged') ? tryGit('show', ':.public-guard-allow') : null) ?? tryGit('show', 'HEAD:.public-guard-allow');
	if (!text) return [];
	return text
		.toString()
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'))
		.map((l) => {
			const [glob, rule] = l.split(/\s+/);
			return { re: new RegExp('^' + glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), rule };
		})
		.filter((a) => a.rule && !PRIVATE_RULE.test(a.rule));
}
const PRIVATE_RULE = /^private-(pattern-\d+|text)$/;
const ALLOW = allowList();
const allowed = (path, rule) => !PRIVATE_RULE.test(rule) && ALLOW.some((a) => a.rule === rule && a.re.test(path));

function loadPrivate() {
	if (CI) return { patterns: [], fingerprints: null };
	const cfgPath = process.env.WS_PUBLIC_GUARD_CONFIG ?? join(homedir(), '.config/whetstone/public-guard.json');
	if (!existsSync(cfgPath)) {
		console.error(`public guard: ${cfgPath} is missing, so the private checks cannot run. Nothing may be committed or pushed from this machine until it exists (see AGENTS.md, "This repository is public").`);
		process.exit(1);
	}
	const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
	const patterns = readFileSync(cfg.patterns, 'utf8')
		.split('\n')
		.map((l) => l.trim())
		.filter((l) => l && !l.startsWith('#'))
		.map((l, i) => [`private-pattern-${i + 1}`, new RegExp(fold(l), 'i')]);
	if (!patterns.length) {
		console.error('public guard: the private pattern file is empty.');
		process.exit(1);
	}
	const buffers = [];
	for (const f of cfg.fingerprints ?? []) {
		if (!existsSync(f)) {
			console.error(`public guard: fingerprint file ${f} is missing. Build it with: node cli/guard/private-fingerprints.mjs`);
			process.exit(1);
		}
		const age = Date.now() - statSync(f).mtimeMs;
		if (age > 7 * DAY) {
			console.error(`public guard: ${f} is ${Math.floor(age / DAY)} days old. Rebuild it with: node cli/guard/private-fingerprints.mjs`);
			process.exit(1);
		}
		const buf = readFileSync(f);
		if (buf.length % 8) {
			console.error(`public guard: ${f} is not a fingerprint file. Rebuild it with: node cli/guard/private-fingerprints.mjs`);
			process.exit(1);
		}
		buffers.push(buf);
	}
	const fingerprints = fingerprintSet(buffers);
	if (!fingerprints.size) {
		console.error('public guard: no private fingerprints are configured.');
		process.exit(1);
	}
	return { patterns, fingerprints };
}
const PRIVATE = loadPrivate();
const LINE_RULES = [...SECRET_RULES, ...PERSONAL_RULES, ...PRIVATE.patterns];

function* pieces(line) {
	if (line.length <= CHUNK) yield line;
	else for (let i = 0; i < line.length; i += CHUNK - 200) yield line.slice(i, i + CHUNK);
}

function scanText(where, text, { path = '', fingerprints = true } = {}) {
	text.split('\n').forEach((raw, i) => {
		for (const piece of pieces(raw)) {
			const variants = [piece, fold(piece)];
			for (const [rule, re, needle] of LINE_RULES) {
				if (allowed(path, rule)) continue;
				for (const v of variants) {
					if (needle && !v.includes(needle)) continue;
					const m = v.match(re);
					if (m) {
						report(`${where}:${i + 1}`, rule, m[0]);
						break;
					}
				}
			}
		}
	});
	if (fingerprints && PRIVATE.fingerprints) {
		const lines = text.split('\n');
		for (const { h, line } of shingles(text)) if (PRIVATE.fingerprints.has(h)) report(`${where}:${line}`, 'private-text', lines[line - 1]);
	}
}

function decode(buf) {
	if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
	if (buf[0] === 0xfe && buf[1] === 0xff) return Buffer.from(buf.subarray(2)).swap16().toString('utf16le');
	if (buf.subarray(0, 8000).includes(0)) return null;
	return buf.toString('utf8');
}

function scanFile(where, path, buf) {
	for (const [rule, re] of PATH_RULES) if (re.test(path) && !allowed(path, rule)) report(where, rule, path);
	if (buf.length > MAX_BYTES && !allowed(path, 'large-file')) report(where, 'large-file', `${buf.length} bytes`);
	const text = decode(buf);
	if (text == null) {
		// a binary file cannot be read for private content, so it needs an entry in the allow list
		if (!allowed(path, 'binary-file')) report(where, 'binary-file', path);
		return;
	}
	scanText(where, text, { path });
}

const NOREPLY = /^([0-9]+\+[\w-]+@users\.noreply\.github\.com|noreply@github\.com)$/;
function scanIdentity(where, ident) {
	const email = ident.match(/<([^>]*)>/)?.[1] ?? ident;
	// the GitHub no-reply address, or GitHub's own for commits made on its website
	if (!NOREPLY.test(email)) report(where, 'commit-identity', email);
	scanText(where, ident, { fingerprints: false });
}

/** A commit: identities, message, and every file it adds or changes; a merge, against its first parent. */
function scanCommit(sha) {
	const short = sha.slice(0, 8);
	const [an, ae, cn, ce] = gitText('show', '-s', '--format=%an%x00%ae%x00%cn%x00%ce', sha).trim().split('\0');
	scanIdentity(`commit ${short} author`, `${an} <${ae}>`);
	scanIdentity(`commit ${short} committer`, `${cn} <${ce}>`);
	scanText(`commit ${short} message`, gitText('show', '-s', '--format=%B', sha));
	const paths = gitText('diff-tree', '--root', '--diff-merges=first-parent', '--no-commit-id', '--name-only', '-r', '-z', '--diff-filter=d', sha).split('\0').filter(Boolean);
	for (const p of new Set(paths)) scanFile(`${short}:${p}`, p, git('show', `${sha}:${p}`));
}

/** An annotated tag: the tagger and the message. */
function scanTag(sha) {
	const body = gitText('cat-file', 'tag', sha);
	const tagger = body.match(/^tagger (.*?) \d+ [+-]\d{4}$/m)?.[1];
	if (tagger) scanIdentity(`tag ${sha.slice(0, 8)} tagger`, tagger);
	scanText(`tag ${sha.slice(0, 8)} message`, body.split('\n\n').slice(1).join('\n\n'));
}

// ---------- modes ----------

if (args.includes('--staged')) {
	scanIdentity('author', gitText('var', 'GIT_AUTHOR_IDENT'));
	scanIdentity('committer', gitText('var', 'GIT_COMMITTER_IDENT'));
	const paths = gitText('diff', '--cached', '--name-only', '-z', '--diff-filter=d').split('\0').filter(Boolean);
	for (const p of paths) scanFile(p, p, git('show', `:${p}`));
} else if (args.includes('--message')) {
	// Lines starting with # are kept, since a message given with -m keeps them; only the diff that
	// `git commit -v` appends below the scissors line is cut, because it is not part of the message.
	const cc = tryGit('config', 'core.commentChar')?.toString().trim() || '#';
	const text = readFileSync(args[args.indexOf('--message') + 1], 'utf8');
	const cut = text.split('\n').findIndex((l) => l === `${cc} ------------------------ >8 ------------------------`);
	scanText('commit message', cut < 0 ? text : text.split('\n').slice(0, cut).join('\n'));
} else if (args.includes('--push')) {
	const remote = args[args.indexOf('--push') + 1];
	const isRemote = remote && !remote.startsWith('--') && tryGit('remote', 'get-url', remote);
	const ZERO = /^0+$/;
	for (const line of readFileSync(0, 'utf8').split('\n').filter(Boolean)) {
		const [, local, , theirs] = line.split(' ');
		if (ZERO.test(local)) continue; // a deletion
		if (gitText('cat-file', '-t', local).trim() === 'tag') scanTag(local);
		const known = !ZERO.test(theirs) && !!tryGit('cat-file', '-e', `${theirs}^{commit}`);
		// what that remote already has is public; anything else, even if another remote has it, is checked
		const range = known ? [`${theirs}..${local}`] : isRemote ? [local, '--not', `--remotes=${remote}`] : [local];
		for (const sha of gitText('rev-list', ...range).split('\n').filter(Boolean)) scanCommit(sha);
	}
} else if (args.includes('--all')) {
	for (const sha of gitText('rev-list', 'HEAD').split('\n').filter(Boolean)) scanCommit(sha);
} else {
	console.error('usage: public-guard.mjs --staged | --message FILE | --push [REMOTE] | --all  [--ci]');
	process.exit(2);
}

if (findings.length) {
	console.error(`public guard: ${findings.length} finding${findings.length === 1 ? '' : 's'}. This repository is public; nothing below may enter it.`);
	for (const f of findings) console.error(`  ${f.where}  ${f.rule}${CI || !f.text ? '' : `  ${JSON.stringify(f.text)}`}`);
	console.error('Remove or reword it, and never bypass the hooks with --no-verify. A false alarm on a public rule may go in .public-guard-allow; a private finding means the text must change.');
	process.exit(1);
}
if (!args.includes('--quiet')) console.log(`public guard: clean${CI ? ' (public rules only)' : ''}.`);

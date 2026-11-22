#!/usr/bin/env node
// ww — Whetstone from the terminal. Zero dependencies (Node 22+).
// Config: WS_URL and WS_API_TOKEN from the environment, or ~/.config/whetstone/cli.env.
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';

const cfgPath = join(homedir(), '.config/whetstone/cli.env');
if (existsSync(cfgPath)) process.loadEnvFile(cfgPath);
const URL_ = (process.env.WS_URL ?? '').replace(/\/$/, '');
const TOKEN = process.env.WS_API_TOKEN ?? '';

const HELP = `ww — Whetstone CLI

  ww note ["stopped at"] ["next action"] [--risks "…"] [--waiting "…"] [--session ID] [--title T]
        Ready-to-resume note for the Claude Code session in this directory (asks for missing fields).
  ww resume [on|off|status]   Show the resume-drill link for this directory, or switch drills on/off.
  ww tot "meaning" [--word W] [--pt] [--came "interlopers"]   Log a tip-of-the-tongue state.
  ww word WORD ["sentence"] [--pt]   Add a word to the inbox.
  ww pt "english word" ["what you were saying"]   Only the English came: find it in Portuguese.
  ww sessions                 Recent sessions and their latest notes.

Config: WS_URL, WS_API_TOKEN (env or ${cfgPath}).`;

function parse(argv) {
	const pos = [], flags = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith('--')) {
			const k = a.slice(2);
			if (['pt', 'en', 'help'].includes(k)) flags[k] = true;
			else flags[k] = argv[++i];
		} else pos.push(a);
	}
	return { pos, flags };
}

async function api(method, path, body) {
	if (!URL_ || !TOKEN) {
		console.error(`Set WS_URL and WS_API_TOKEN (env or ${cfgPath}).`);
		process.exit(2);
	}
	const res = await fetch(URL_ + path, {
		method,
		headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' },
		body: body ? JSON.stringify(body) : undefined
	});
	const data = await res.json().catch(() => ({}));
	if (!res.ok) {
		console.error(`Error ${res.status}: ${data.message ?? data.error ?? ''}`);
		process.exit(1);
	}
	return data;
}

async function ask(q) {
	const rl = createInterface({ input: process.stdin, output: process.stdout });
	const a = await rl.question(q);
	rl.close();
	return a.trim();
}

const { pos, flags } = parse(process.argv.slice(2));
const cmd = pos.shift();
const lang = flags.pt ? 'pt-PT' : flags.en ? 'en' : undefined;

switch (cmd) {
	case 'note': {
		let [stoppedAt, nextAction] = pos;
		if (!stoppedAt) stoppedAt = await ask('Where did you stop? ');
		if (!nextAction) nextAction = await ask('Next concrete action? ');
		let openRisks = flags.risks, waitingOn = flags.waiting;
		if (openRisks === undefined && process.stdin.isTTY && pos.length < 2) openRisks = await ask('Open risks (enter to skip)? ');
		if (waitingOn === undefined && process.stdin.isTTY && pos.length < 2) waitingOn = await ask('Waiting on (enter to skip)? ');
		const r = await api('POST', '/api/notes', { session: flags.session, cwd: process.cwd(), title: flags.title, stoppedAt, nextAction, openRisks, waitingOn, via: 'cli' });
		console.log(`Saved note for session ${r.sessionId.slice(0, 8)}.`);
		if (r.quality) console.log(`Note quality ${r.quality.score}/100. Tip: ${r.quality.tips?.[0] ?? ''}`);
		break;
	}
	case 'resume': {
		const sub = pos[0];
		if (sub === 'on' || sub === 'off') {
			const r = await api('POST', '/api/resume-switch', { on: sub === 'on' });
			console.log(`Resume drills ${r.on ? 'on' : 'off'}.`);
		} else if (sub === 'status') {
			const r = await api('GET', '/api/resume-switch');
			console.log(`Resume drills ${r.on ? 'on' : 'off'}.`);
		} else {
			const sw = await api('GET', '/api/resume-switch');
			const r = await api('GET', `/api/sessions?cwd=${encodeURIComponent(process.cwd())}`);
			if (!r.session) console.log(`No session found for ${process.cwd()}. Open ${URL_}/sessions`);
			else console.log(`${r.session.title ?? r.session.id}\n${URL_}/sessions/${r.session.id}?${sw.on ? 'resume=1' : ''}${sw.on ? '' : '  (drills are off: this shows the note)'}`);
		}
		break;
	}
	case 'tot': {
		const meaning = pos.join(' ') || (await ask('Meaning you were reaching for? '));
		const r = await api('POST', '/api/tot', { meaning, word: flags.word, interlopers: flags.came, lang });
		console.log(flags.word ? 'Logged and added to practice.' : `Logged. Find it: ${URL_}${r.url}`);
		break;
	}
	case 'word': {
		const [word, ...rest] = pos;
		if (!word) (console.error('Usage: ww word WORD ["sentence"]'), process.exit(2));
		const r = await api('POST', '/api/words', { word, sentence: rest.join(' ') || undefined, lang });
		console.log(`Added. Confirm it: ${URL_}${r.url}`);
		break;
	}
	case 'pt': {
		const [cue, ...rest] = pos;
		if (!cue) (console.error('Usage: ww pt "english word" ["what you were saying"]'), process.exit(2));
		const r = await api('POST', '/api/a8', { action: 'capture', cue, context: rest.join(' ') || undefined, lang: 'pt-PT' });
		console.log(`Saved. Find it in Portuguese: ${URL_}/x/a8?lang=pt-PT&item=${r.itemId}&n=1`);
		break;
	}
	case 'sessions': {
		const r = await api('GET', '/api/sessions?limit=15');
		for (const s of r.sessions) {
			const mins = s.lastActivity ? Math.round((Date.now() - s.lastActivity) / 60000) : null;
			const age = mins == null ? '' : mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
			console.log(`${age.padStart(4)}  ${(s.title ?? s.id).slice(0, 60).padEnd(60)}  ${s.note ? 'note ✓' : ''}`);
		}
		break;
	}
	default:
		console.log(HELP);
}

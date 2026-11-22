import { readdirSync, statSync, openSync, readSync, closeSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { env } from '../env';

// Read-only view of Claude Code sessions. Format verified 2026-09-24 (Claude Code 2.1.280):
// ~/.claude/projects/<cwd with / as ->/<session-id>.jsonl, one JSON object per line, typed
// user | assistant | ai-title | last-prompt | ...; lines carry cwd, gitBranch, timestamp, sessionId.
// The format is undocumented, so every field is optional here.

export interface ClaudeSession {
	id: string;
	projectDir: string;
	cwd: string | null;
	title: string | null;
	gitBranch: string | null;
	lastActivity: number;
	sizeBytes: number;
}

function readTail(path: string, bytes: number): string {
	const st = statSync(path);
	const len = Math.min(bytes, st.size);
	const buf = Buffer.alloc(len);
	const fd = openSync(path, 'r');
	try {
		readSync(fd, buf, 0, len, st.size - len);
	} finally {
		closeSync(fd);
	}
	const s = buf.toString('utf8');
	return len < st.size ? s.slice(s.indexOf('\n') + 1) : s;
}

function parseLines(text: string): any[] {
	const out: any[] = [];
	for (const l of text.split('\n')) {
		if (!l.trim()) continue;
		try {
			out.push(JSON.parse(l));
		} catch {
			/* partial or unknown line */
		}
	}
	return out;
}

export function available(): boolean {
	return !!env.claudeProjectsDir && existsSync(env.claudeProjectsDir);
}

export function listSessions(days = 14, limit = 60): ClaudeSession[] {
	if (!available()) return [];
	const since = Date.now() - days * 86400_000;
	const files: { path: string; dir: string; id: string; mtime: number; size: number }[] = [];
	for (const dir of readdirSync(env.claudeProjectsDir)) {
		const full = join(env.claudeProjectsDir, dir);
		let entries: string[];
		try {
			entries = readdirSync(full);
		} catch {
			continue;
		}
		for (const f of entries) {
			if (!f.endsWith('.jsonl')) continue;
			const p = join(full, f);
			const st = statSync(p);
			if (st.mtimeMs >= since) files.push({ path: p, dir, id: f.slice(0, -6), mtime: st.mtimeMs, size: st.size });
		}
	}
	files.sort((a, b) => b.mtime - a.mtime);
	return files.slice(0, limit).map((f) => {
		const lines = parseLines(readTail(f.path, 256 * 1024));
		let title: string | null = null,
			cwd: string | null = null,
			branch: string | null = null,
			last = f.mtime;
		for (const d of lines) {
			if (d.type === 'ai-title' && d.aiTitle) title = d.aiTitle;
			if (d.cwd) cwd = d.cwd;
			if (d.gitBranch) branch = d.gitBranch;
			if ((d.type === 'user' || d.type === 'assistant') && d.timestamp) last = Date.parse(d.timestamp) || last;
		}
		return { id: f.id, projectDir: f.dir, cwd, title, gitBranch: branch, lastActivity: last, sizeBytes: f.size };
	});
}

function textOf(content: unknown): string {
	if (typeof content === 'string') return content;
	if (Array.isArray(content))
		return content
			.filter((c: any) => c && c.type === 'text' && typeof c.text === 'string')
			.map((c: any) => c.text)
			.join('\n');
	return '';
}

/** The last N conversational turns (text only, no tool output), capped in size. */
export function tail(sessionId: string, turns = 12, maxChars = 12000): { role: string; text: string; at: string }[] | null {
	if (!available() || !/^[\w-]+$/.test(sessionId)) return null;
	for (const dir of readdirSync(env.claudeProjectsDir)) {
		const p = join(env.claudeProjectsDir, dir, sessionId + '.jsonl');
		if (!existsSync(p)) continue;
		const lines = parseLines(readTail(p, 1024 * 1024));
		const msgs: { role: string; text: string; at: string }[] = [];
		for (const d of lines) {
			if ((d.type !== 'user' && d.type !== 'assistant') || d.isSidechain || d.isMeta) continue;
			const t = textOf(d.message?.content).trim();
			if (!t || t.startsWith('<system-reminder>') || t.startsWith('<command-')) continue;
			msgs.push({ role: d.type, text: t.slice(0, 2000), at: d.timestamp ?? '' });
		}
		const out = msgs.slice(-turns);
		while (out.reduce((n, m) => n + m.text.length, 0) > maxChars && out.length > 2) out.shift();
		return out;
	}
	return null;
}

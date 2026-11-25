// Shared by the public guard and the fingerprint builder: text becomes overlapping runs of
// SIZE words, each hashed, so private text can be recognised without storing it.
import { createHash } from 'node:crypto';

export const SIZE = 8;

/** Lowercase words without accents, with their 1-based line numbers. */
export function words(text) {
	const out = [];
	const lines = text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().split('\n');
	lines.forEach((line, i) => {
		for (const w of line.match(/[\p{L}\p{N}]+/gu) ?? []) out.push({ w, line: i + 1 });
	});
	return out;
}

export function hash(run) {
	return createHash('sha1').update(run).digest('hex').slice(0, 16);
}

// A run counts only when it reads like prose: at least five distinct words of three or more
// letters. Code such as "[A-Za-z0-9]" breaks into "a za z0 9", which would match anything.
const REAL = /^\p{L}{3,}$/u;
const prose = (run) => new Set(run.filter((w) => REAL.test(w))).size >= 5;

/** Every run of SIZE words in the text that reads like prose, as { h, line }. */
export function* shingles(text) {
	const ws = words(text);
	for (let i = 0; i + SIZE <= ws.length; i++) {
		const run = ws.slice(i, i + SIZE).map((x) => x.w);
		if (prose(run)) yield { h: hash(run.join(' ')), line: ws[i].line };
	}
}

/** Membership in a fingerprint file: sorted 8-byte hashes, binary-searched without loading a set. */
export function fingerprintSet(buffers) {
	const has = (buf, h) => {
		const key = Buffer.from(h, 'hex');
		let lo = 0;
		let hi = buf.length / 8 - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			const c = buf.compare(key, 0, 8, mid * 8, mid * 8 + 8);
			if (c === 0) return true;
			if (c > 0) hi = mid - 1;
			else lo = mid + 1;
		}
		return false;
	};
	return { size: buffers.reduce((n, b) => n + b.length / 8, 0), has: (h) => buffers.some((b) => has(b, h)) };
}

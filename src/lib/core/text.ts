// Word matching used by the retrieval drills. Deterministic, language-aware where it matters.

export function stripAccents(s: string): string {
	return s.normalize('NFD').replace(/\p{M}+/gu, '');
}

export function normWord(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFC')
		.trim()
		.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')
		.replace(/\s+/g, ' ');
}

export function tokens(s: string): string[] {
	return (s.toLowerCase().normalize('NFC').match(/[\p{L}][\p{L}'’-]*/gu) ?? []).map((t) => t.replace(/[’']$/, ''));
}

export function editDistance(a: string, b: string): number {
	if (a === b) return 0;
	const m = a.length,
		n = b.length;
	let prev = Array.from({ length: n + 1 }, (_, j) => j);
	for (let i = 1; i <= m; i++) {
		const cur = [i];
		for (let j = 1; j <= n; j++) {
			cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
		}
		prev = cur;
	}
	return prev[n];
}

function commonPrefix(a: string, b: string): number {
	let i = 0;
	while (i < a.length && i < b.length && a[i] === b[i]) i++;
	return i;
}

export type MatchKind = 'exact' | 'accent' | 'typo' | 'form' | 'none';

/**
 * Compare an answer with the target (and accepted forms).
 * exact  — same word;
 * accent — same letters, accents differ (counted correct, spelling flagged);
 * typo   — one edit away on a word of 6+ letters (counted correct, spelling flagged);
 * form   — same stem, different form ("ephemerality" for "ephemeral"): a near miss;
 * none   — anything else (may still be a synonym; that is the judge's call).
 */
export function matchAnswer(answer: string, target: string, accept: string[] = []): MatchKind {
	const a = normWord(answer);
	if (!a) return 'none';
	const forms = [target, ...accept].map(normWord);
	if (forms.includes(a)) return 'exact';
	const a0 = stripAccents(a);
	if (forms.some((f) => stripAccents(f) === a0)) return 'accent';
	if (forms.some((f) => f.length >= 6 && editDistance(stripAccents(f), a0) === 1)) return 'typo';
	for (const f of forms) {
		const fb = stripAccents(f);
		const cp = commonPrefix(fb, a0);
		const stem = Math.max(4, Math.min(fb.length, a0.length) - 3);
		if (cp >= stem && Math.abs(fb.length - a0.length) <= 5) return 'form';
	}
	return 'none';
}

/** Does the sentence use the word, allowing inflection (walk → walked, andar → andámos)? */
export function sentenceUsesWord(sentence: string, word: string): boolean {
	const w = stripAccents(normWord(word));
	if (!w) return false;
	const parts = w.split(' ');
	const toks = tokens(sentence).map(stripAccents);
	if (parts.length > 1) return stripAccents(sentence.toLowerCase()).includes(w);
	const stem = w.length <= 4 ? w : w.slice(0, Math.max(4, w.length - 3));
	return toks.some((t) => t === w || (t.startsWith(stem) && t.length - w.length <= 5 && t.length >= stem.length));
}

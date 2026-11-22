// A8 (Translate it): deterministic helpers. Answers are compared without a leading article or
// "to", so "o prazo" and "prazo", "to give up" and "give up" match the same target.

import { matchAnswer, normWord, stripAccents, type MatchKind } from './text';

const LEADING = /^(?:to|the|a|an|o|a|os|as|um|uma|uns|umas)\s+/;

export function bare(s: string): string {
	return normWord(s).replace(LEADING, '');
}

/**
 * matchAnswer on the bare forms: the target and every accepted rendering count as exact.
 * "form" (an inflection the sentence needs, "adiaram" for "adiar") is stricter than in A1: the
 * shared start must cover 70% of the form, so "sensível" is not taken for "sensato".
 */
export function matchTranslation(answer: string, target: string, accept: string[] = []): MatchKind {
	const forms = [target, ...accept].map(bare);
	const a = bare(answer);
	const m = matchAnswer(a, forms[0], forms.slice(1));
	if (m !== 'form') return m;
	const a0 = stripAccents(a);
	const inflected = forms.some((f) => {
		const f0 = stripAccents(f);
		let cp = 0;
		while (cp < f0.length && cp < a0.length && f0[cp] === a0[cp]) cp++;
		return cp >= Math.max(4, Math.ceil(f0.length * 0.7)) && Math.abs(f0.length - a0.length) <= 5;
	});
	return inflected ? 'form' : 'none';
}

/** The answer is the tempting wrong one (a false friend or calque), exactly as written. */
export function isTrap(answer: string, trap: string | undefined | null): boolean {
	if (!trap) return false;
	return bare(answer) === bare(trap);
}

/** The answer repeats the cue (the word in the other language came back instead). */
export function isCue(answer: string, cue: string): boolean {
	return stripAccents(bare(answer)) === stripAccents(bare(cue));
}

/** The shape hint: number of words and letters, plus syllables and stress when known. */
export function shapeHint(target: string, lang: string, syllables?: number, stress?: number): string {
	const words = target.trim().split(/\s+/);
	const pt = lang === 'pt-PT';
	if (words.length > 1) {
		const lens = words.map((w) => w.replace(/[^\p{L}]/gu, '').length).join(' + ');
		return pt ? `${words.length} palavras: ${lens} letras` : `${words.length} words: ${lens} letters`;
	}
	const n = target.replace(/[^\p{L}]/gu, '').length;
	let s = pt ? `1 palavra, ${n} letras` : `1 word, ${n} letters`;
	if (syllables) s += pt ? `, ${syllables} sílaba${syllables === 1 ? '' : 's'}` : `, ${syllables} syllable${syllables === 1 ? '' : 's'}`;
	if (syllables && stress && syllables > 1) s += pt ? `, acento na ${stress}.ª` : `, stress on syllable ${stress}`;
	return s;
}

import { normWord, stripAccents } from '../../core/text';

/** Same lemma, allowing inflection. Deliberately conservative: a missed duplicate costs less than a false penalty. */
function sameLemma(a: string, b: string): boolean {
	const x = stripAccents(a),
		y = stripAccents(b);
	if (x === y) return true;
	const [s, l] = x.length <= y.length ? [x, y] : [y, x];
	if (s.length <= 5) return l.startsWith(s) && ['s', 'es', 'd', 'ed', 'er', 'ing'].includes(l.slice(s.length)); // key/keys, not sign/signal
	let i = 0;
	while (i < s.length && s[i] === l[i]) i++;
	return i >= Math.max(5, s.length - 3); // mitigate/mitigated, not signal/significant
}

/** A4 objective metrics, computed in code before the judge runs. */
export function objective(alternatives: string[], flat: string) {
	const norm = alternatives.map(normWord).filter(Boolean);
	let duplicates = 0;
	norm.forEach((w, i) => {
		if (norm.slice(0, i).some((p) => sameLemma(p, w))) duplicates++;
	});
	const f = normWord(flat);
	const sameAsFlat = norm.filter((w) => sameLemma(w, f)).length;
	return { given: norm.length, duplicates, sameAsFlat };
}

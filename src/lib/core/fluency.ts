import { normWord, stripAccents } from './text';

// A2 fluency metrics after Troyer, Moscovitch & Winocur (1997): cluster size counts from the
// second word of a cluster; switches are transitions between clusters (single words included).

export interface FluencyInput {
	words: string[]; // in the order typed
	kind: 'semantic' | 'letter';
	letter?: string;
	/** For semantic prompts: validity and subcategory per normalised word, from the validation check. */
	semantic?: Record<string, { valid: boolean; subcategory?: string }>;
	/** For letter prompts: is this a real word? (lexicon lookup) */
	isWord?: (w: string) => boolean;
}

export interface FluencyMetrics {
	total: number;
	valid: number;
	repetitions: number;
	intrusions: number;
	clusters: number;
	meanClusterSize: number;
	switches: number;
	validWords: string[];
	intrusionWords: string[];
	repeatedWords: string[];
}

function phonemicLink(a: string, b: string): boolean {
	const x = stripAccents(a),
		y = stripAccents(b);
	if (x.slice(0, 2) === y.slice(0, 2)) return true; // same first two letters
	if (x.length >= 3 && y.length >= 3 && x.slice(-3) === y.slice(-3)) return true; // rhyme (approximation)
	return false;
}

export function fluencyMetrics(inp: FluencyInput): FluencyMetrics {
	const seen = new Set<string>();
	const valid: string[] = [];
	const intrusions: string[] = [];
	const repeats: string[] = [];
	for (const raw of inp.words) {
		const w = normWord(raw);
		if (!w) continue;
		if (seen.has(w)) {
			repeats.push(w);
			continue;
		}
		seen.add(w);
		let ok: boolean;
		if (inp.kind === 'letter') {
			const L = stripAccents((inp.letter ?? '').toLowerCase());
			ok = stripAccents(w).startsWith(L) && (inp.isWord ? inp.isWord(w) : true) && !w.includes(' ');
		} else ok = inp.semantic?.[w]?.valid ?? false;
		(ok ? valid : intrusions).push(w);
	}

	// Clusters over valid words in order.
	const sizes: number[] = [];
	let run = 1;
	for (let i = 1; i <= valid.length; i++) {
		const linked =
			i < valid.length &&
			(inp.kind === 'semantic'
				? !!inp.semantic?.[valid[i]]?.subcategory && inp.semantic?.[valid[i]]?.subcategory === inp.semantic?.[valid[i - 1]]?.subcategory
				: phonemicLink(valid[i], valid[i - 1]));
		if (linked) run++;
		else {
			sizes.push(run);
			run = 1;
		}
	}
	const multi = sizes.filter((s) => s >= 2);
	return {
		total: inp.words.length,
		valid: valid.length,
		repetitions: repeats.length,
		intrusions: intrusions.length,
		clusters: multi.length,
		meanClusterSize: sizes.length ? +(sizes.reduce((a, s) => a + (s - 1), 0) / sizes.length).toFixed(2) : 0,
		switches: Math.max(0, sizes.length - 1),
		validWords: valid,
		intrusionWords: intrusions,
		repeatedWords: repeats
	};
}

// Journal metrics: what code can say about a piece of writing or a transcript, with no model.
// Deterministic; tested in tests/journal.test.ts. The report sends these to the model as evidence.
import { tokens } from './text';

export type Lang = 'en' | 'pt-PT';

const STOP_EN = new Set(
	'a an the and or but so if then than that this these those there here it its it\'s is are was were be been being am i me my mine myself you your yours we us our they them their he him his she her hers of to in on at by for with from into onto about as not no nor do does did done doing have has had having can could would should will shall may might must just also too very really what which who whom whose when where why how all any some each every more most much many such only own same other again ever even still yet up down out off over under once both few lot lots get got go going gone make made one ones thing things way like now back know dont didnt im ive id ill cant wont isnt doesnt thats whats theres i\'m i\'ve i\'d i\'ll don\'t didn\'t can\'t won\'t isn\'t doesn\'t wasn\'t that\'s what\'s there\'s you\'re they\'re we\'re let\'s'.split(
		' '
	)
);
const STOP_PT = new Set(
	'a o as os um uma uns umas e ou mas se que de do da dos das em no na nos nas por pelo pela pelos pelas para com sem sobre entre até ao aos à às é era foi ser estar está estou estava são sou tem tenho tinha ter há eu tu ele ela nós vós eles elas me te se lhe nos vos lhes meu minha meus minhas teu tua seu sua nosso nossa isto isso aquilo este esta esse essa aquele aquela não sim já mais muito muita muitos muitas pouco também só quando onde como porque porquê qual quais quem então assim ainda bem mal coisa coisas vez fazer faz fiz'.split(
		' '
	)
);

/** Spoken-habit words and phrases. Counted as phrases, so "you know" is one hit. */
export const FILLERS: Record<Lang, string[]> = {
	en: ['you know', 'i mean', 'kind of', 'sort of', 'i guess', 'just', 'really', 'actually', 'basically', 'literally', 'like', 'very'],
	'pt-PT': ['tipo', 'pronto', 'basicamente', 'sei lá', 'ou seja', 'quer dizer', 'portanto', 'mesmo', 'assim', 'literalmente']
};

/** English contractions typed without the apostrophe, and fused words that are two in standard spelling. */
const NO_APOSTROPHE: Record<string, string> = {
	didnt: "didn't", dont: "don't", doesnt: "doesn't", isnt: "isn't", wasnt: "wasn't", werent: "weren't", cant: "can't", wont: "won't", wouldnt: "wouldn't",
	couldnt: "couldn't", shouldnt: "shouldn't", havent: "haven't", hasnt: "hasn't", hadnt: "hadn't", im: "I'm", ive: "I've", youre: "you're", theyre: "they're",
	thats: "that's", whats: "what's", theres: "there's", lets: "let's (when it means 'let us')", aswell: 'as well', alot: 'a lot', afterall: 'after all', everytime: 'every time', infact: 'in fact'
};

export function sentences(text: string): string[] {
	return text
		.replace(/^#+\s.*$/gm, '')
		.split(/(?<=[.!?…])\s+|\n+/)
		.map((s) => s.replace(/^[\s>*\-–—•\d.)]+/, '').trim())
		.filter((s) => tokens(s).length >= 3);
}

/** MTLD (McCarthy & Jarvis, 2010), averaged forward and backward, threshold 0.72. Stable for texts of 100+ words. */
export function mtld(words: string[], threshold = 0.72): number | null {
	if (words.length < 50) return null;
	const pass = (ws: string[]) => {
		let factors = 0,
			types = new Set<string>(),
			count = 0,
			ttr = 1;
		for (const w of ws) {
			count++;
			types.add(w);
			ttr = types.size / count;
			if (ttr <= threshold) {
				factors++;
				types = new Set();
				count = 0;
				ttr = 1;
			}
		}
		if (count > 0) factors += (1 - ttr) / (1 - threshold);
		return factors > 0 ? ws.length / factors : ws.length;
	};
	return Math.round(((pass(words) + pass([...words].reverse())) / 2) * 10) / 10;
}

function countPhrase(lowerText: string, phrase: string): number {
	const re = new RegExp(`(?<![\\p{L}'’])${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}'’])`, 'gu');
	return (lowerText.match(re) ?? []).length;
}

function quantile(xs: number[], q: number): number {
	if (!xs.length) return 0;
	const s = [...xs].sort((a, b) => a - b);
	return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

export interface Baseline {
	words: number;
	counts: Map<string, number>;
}

export function baselineOf(texts: string[], lang: Lang = 'en'): Baseline {
	const counts = new Map<string, number>();
	let words = 0;
	for (const t of texts) {
		for (const w of tokens(t)) {
			words++;
			if (!(lang === 'en' ? STOP_EN : STOP_PT).has(w)) counts.set(w, (counts.get(w) ?? 0) + 1);
		}
	}
	return { words, counts };
}

export interface JournalMetrics {
	words: number;
	distinct: number;
	mtld: number | null;
	sentences: number;
	sentenceMedian: number;
	sentenceP90: number;
	longSentences: number; // over 35 words
	openers: { word: string; share: number }[];
	fillersPer1000: { phrase: string; count: number; per1000: number }[];
	repeated: { word: string; count: number }[];
	moreThanUsual: { word: string; count: number; times: number }[];
	noApostrophe: { wrong: string; right: string; count: number }[];
	rareShare: number | null; // share of content words with Zipf < 3.5
}

/**
 * Metrics for one selection of journal text.
 * `baseline` is the whole written journal, for "more than usual"; `zipf` looks a word up in the lexicon.
 */
export function journalMetrics(text: string, opts: { lang?: Lang; baseline?: Baseline; zipf?: (w: string) => number | null } = {}): JournalMetrics {
	const lang = opts.lang ?? 'en';
	const stop = lang === 'en' ? STOP_EN : STOP_PT;
	const ws = tokens(text);
	const lower = text.toLowerCase().normalize('NFC');
	const sents = sentences(text);
	const lens = sents.map((s) => tokens(s).length);
	const openerCounts = new Map<string, number>();
	for (const s of sents) {
		const f = tokens(s)[0];
		if (f) openerCounts.set(f, (openerCounts.get(f) ?? 0) + 1);
	}
	const content = new Map<string, number>();
	for (const w of ws) if (!stop.has(w) && w.length > 2) content.set(w, (content.get(w) ?? 0) + 1);
	const n = ws.length || 1;
	const moreThanUsual: JournalMetrics['moreThanUsual'] = [];
	if (opts.baseline && opts.baseline.words > n * 3) {
		for (const [w, c] of content) {
			if (c < 3) continue;
			const base = (opts.baseline.counts.get(w) ?? 0) / opts.baseline.words;
			const here = c / n;
			const times = base > 0 ? here / base : Infinity;
			if (times >= 2.5) moreThanUsual.push({ word: w, count: c, times: Number.isFinite(times) ? Math.round(times * 10) / 10 : 99 });
		}
		moreThanUsual.sort((a, b) => b.count * Math.min(b.times, 20) - a.count * Math.min(a.times, 20));
	}
	let rare: number | null = null;
	if (opts.zipf) {
		let known = 0,
			low = 0;
		for (const [w, c] of content) {
			const z = opts.zipf(w);
			if (z == null) continue;
			known += c;
			if (z < 3.5) low += c;
		}
		rare = known ? Math.round((low / known) * 1000) / 10 : null;
	}
	const noApostrophe =
		lang === 'en'
			? Object.entries(NO_APOSTROPHE)
					.map(([wrong, right]) => ({ wrong, right, count: ws.filter((w) => w === wrong).length }))
					.filter((x) => x.count > 0)
					.sort((a, b) => b.count - a.count)
			: [];
	return {
		words: ws.length,
		distinct: new Set(ws).size,
		mtld: mtld(ws),
		sentences: sents.length,
		sentenceMedian: quantile(lens, 0.5),
		sentenceP90: quantile(lens, 0.9),
		longSentences: lens.filter((l) => l > 35).length,
		openers: [...openerCounts.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 5)
			.map(([word, c]) => ({ word, share: Math.round((c / (sents.length || 1)) * 100) })),
		fillersPer1000: FILLERS[lang]
			.map((phrase) => {
				const count = countPhrase(lower, phrase);
				return { phrase, count, per1000: Math.round((count / n) * 10000) / 10 };
			})
			.filter((f) => f.count > 0)
			.sort((a, b) => b.count - a.count),
		repeated: [...content.entries()]
			.filter(([, c]) => c >= 3)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 12)
			.map(([word, count]) => ({ word, count })),
		moreThanUsual: moreThanUsual.slice(0, 10),
		noApostrophe,
		rareShare: rare
	};
}

/** A rough language guess for a journal text: Portuguese when its function words outnumber English ones. */
export function guessLang(text: string): Lang {
	const ws = tokens(text).slice(0, 400);
	let pt = 0,
		en = 0;
	for (const w of ws) {
		if (STOP_PT.has(w) && !STOP_EN.has(w)) pt++;
		else if (STOP_EN.has(w) && !STOP_PT.has(w)) en++;
	}
	return pt > en ? 'pt-PT' : 'en';
}

/** Voice journals keep the machine transcript under "## Raw Transcript"; the summary above it is not the author's words. */
export function voiceTranscript(file: string): string {
	const m = file.match(/^##\s+Raw Transcript[^\n]*\n([\s\S]*)$/m);
	const body = m ? m[1].split(/^##\s/m)[0] : '';
	return body
		.replace(/\[\d{2}:\d{2}:\d{2}(?:\.\d+)?\s*-->\s*[^\]]*\]/g, '')
		.replace(/^\[[^\]]*\]\s*$/gm, '')
		.trim();
}

/** The date a journal entry belongs to. Writing before 05:00 still counts as the night before. */
export function journalDay(ms: number, tz: string): string {
	const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(ms));
	const t = hour < 5 ? ms - 6 * 3600_000 : ms;
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(t);
}

/** Path of the written entry for a day: Journal/<yyyy>/<yy.mm>/<yyyy-mm-dd>.md */
export function entryPathFor(day: string): string {
	const [y, m] = day.split('-');
	return `Journal/${y}/${y.slice(2)}.${m}/${day}.md`;
}

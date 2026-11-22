// The two model features of the journal: a report on entries the author picks, and wording help while they write.
// Both go through check() with keepRaw: false, so the reply lives only in the journal folder, never in the database.
import { z } from 'zod';
import { error } from '@sveltejs/kit';
import { check } from '../judge/run';
import { env } from '../env';
import { zipfOf } from '../services';
import { guessLang, journalDay, journalMetrics, type JournalMetrics, type Lang } from '$lib/core/journal';
import { analysableText, listEntries, logWording, readEntry, wikiLink, writeReport, writtenBaseline, type Entry, type EntryMeta } from './store';

// About 75k tokens: a month of written and voice entries fits.
const MAX_CHARS = 300_000;

const ReportSchema = z.object({
	answer: z.string().default(''),
	summary: z.string().default(''),
	weaknesses: z
		.array(z.object({ title: z.string(), why: z.string(), examples: z.array(z.object({ quote: z.string(), better: z.array(z.string()).default([]) })).default([]) }))
		.default([]),
	words: z.array(z.object({ word: z.string(), meaning: z.string(), instead_of: z.string().default(''), example: z.string().default('') })).default([]),
	structures: z.array(z.object({ name: z.string(), how: z.string(), yours: z.string().default(''), rewritten: z.string().default('') })).default([]),
	spelling: z.array(z.object({ wrong: z.string(), right: z.string(), note: z.string().default('') })).default([]),
	exercises: z.array(z.object({ title: z.string(), instruction: z.string(), material: z.string().default('') })).default([])
});
export type Report = z.infer<typeof ReportSchema>;

const REPORT_SYSTEM = `You are a writing and speaking coach for the author of this journal, ${env.learnerProfile}. They journal in writing and by voice. They have picked some of their journal entries and want to communicate better: more precise words, more varied sentences, clearer thoughts.

Rules:
- Review the language, never the life. Do not comment on, judge or advise about what they did, felt or decided.
- If they wrote a request, answer it first and most fully, in "answer". Leave "answer" empty when they wrote none.
- Work on sentences they actually wrote. Every "quote" and "yours" is copied exactly from an entry; never rewrite a whole entry.
- Written entries are typed by them. Voice entries are machine transcripts of speech: ignore misheard words and missing punctuation, and judge only the speech habits that survive (fillers, restarts, run-on sentences, repetition, vague words).
- Name at most four weaknesses, the ones that cost them most, with two or three better versions of each quoted sentence.
- "words": words that would have said something more precisely than the word they used, at a level a well-read adult would use; "instead_of" is their word or phrase.
- "structures": sentence shapes they do not use and could, each shown on one of their own sentences.
- "spelling": real spelling and grammar errors in written entries only, most frequent first.
- "exercises": two to four exercises they can do in five minutes, in writing or aloud, each built on material from these entries.
- The metrics were computed by code. Use them as evidence; do not recompute them.
- Be direct and specific, like a good coach. No praise padding, no closing pep talk.
- Portuguese text gets European Portuguese alternatives, never Brazilian. Write the report in English unless every entry is in Portuguese.

Reply with this JSON shape:
{"answer": "", "summary": "two or three sentences", "weaknesses": [{"title": "", "why": "", "examples": [{"quote": "", "better": [""]}]}], "words": [{"word": "", "meaning": "", "instead_of": "", "example": ""}], "structures": [{"name": "", "how": "", "yours": "", "rewritten": ""}], "spelling": [{"wrong": "", "right": "", "note": ""}], "exercises": [{"title": "", "instruction": "", "material": ""}]}`;

function langOf(texts: string[]): Lang {
	return guessLang(texts.join('\n').slice(0, 4000));
}

function metricsTable(label: string, m: JournalMetrics): string {
	const rows = [
		['Words', `${m.words} (${m.distinct} different)`],
		['Vocabulary range (MTLD; higher is more varied)', m.mtld == null ? 'too short to measure' : String(m.mtld)],
		['Sentence length, median / longest 10%', `${m.sentenceMedian} / ${m.sentenceP90} words`],
		['Sentences over 35 words', `${m.longSentences} of ${m.sentences}`],
		['Most common sentence starts', m.openers.map((o) => `${o.word} ${o.share}%`).join(', ') || '—'],
		['Filler words per 1,000', m.fillersPer1000.slice(0, 6).map((f) => `${f.phrase} ${f.per1000}`).join(', ') || '—'],
		['Words repeated most', m.repeated.slice(0, 8).map((r) => `${r.word} ×${r.count}`).join(', ') || '—'],
		['Used more than usual (vs the whole journal)', m.moreThanUsual.slice(0, 6).map((r) => `${r.word} ×${r.count}`).join(', ') || '—'],
		['Missing apostrophes and fused words', m.noApostrophe.map((x) => `${x.wrong} → ${x.right} ×${x.count}`).join(', ') || '—'],
		['Share of less common words', m.rareShare == null ? '—' : `${m.rareShare}%`]
	];
	return `### ${label}\n\n| Measure | Value |\n|---|---|\n${rows.map(([a, b]) => `| ${a} | ${b.replace(/\|/g, '/')} |`).join('\n')}\n`;
}

function stampOf(ms: number): { stamp: string; human: string } {
	const p = Object.fromEntries(
		new Intl.DateTimeFormat('en-GB', { timeZone: env.timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
			.formatToParts(ms)
			.map((x) => [x.type, x.value])
	);
	return { stamp: `${p.year}-${p.month}-${p.day} ${p.hour}${p.minute}`, human: `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` };
}

const quote = (s: string) => s.split('\n').map((l) => `> ${l}`).join('\n');

export function reportMarkdown(r: Report, ctx: { entries: Entry[]; notes: string; human: string; model: string; written?: JournalMetrics; voice?: JournalMetrics }): string {
	const out: string[] = [];
	out.push('---', `created: ${ctx.human}`, `entries: ${ctx.entries.map((e) => e.id).join(', ')}`, `model: ${ctx.model}`, '---', '');
	out.push(`# Report, ${ctx.human}`, '');
	out.push(`**Entries:** ${ctx.entries.map(wikiLink).join(' · ')}`, '');
	if (ctx.notes.trim()) out.push('**What I asked:**', '', quote(ctx.notes.trim()), '');
	if (r.answer.trim()) out.push('## Answer', '', r.answer.trim(), '');
	if (r.summary.trim()) out.push('## In short', '', r.summary.trim(), '');
	if (r.weaknesses.length) {
		out.push('## Where it is weakest', '');
		for (const w of r.weaknesses) {
			out.push(`### ${w.title}`, '', w.why, '');
			for (const ex of w.examples) {
				out.push(quote(ex.quote), '');
				for (const b of ex.better) out.push(`- ${b}`);
				out.push('');
			}
		}
	}
	if (r.words.length) {
		out.push('## Words to try', '');
		for (const w of r.words) out.push(`- **${w.word}**: ${w.meaning.trim().replace(/([^.!?])$/, '$1.')}${w.instead_of ? ` Instead of "${w.instead_of}".` : ''}${w.example ? ` *${w.example}*` : ''}`);
		out.push('');
	}
	if (r.structures.length) {
		out.push('## Sentence shapes', '');
		for (const s of r.structures) {
			out.push(`### ${s.name}`, '', s.how, '');
			if (s.yours) out.push(quote(s.yours), '');
			if (s.rewritten) out.push(`- ${s.rewritten}`, '');
		}
	}
	if (r.spelling.length) {
		out.push('## Spelling and grammar', '');
		for (const s of r.spelling) out.push(`- ${s.wrong} → **${s.right}**${s.note ? `: ${s.note}` : ''}`);
		out.push('');
	}
	if (r.exercises.length) {
		out.push('## Exercises', '');
		r.exercises.forEach((e, i) => {
			out.push(`### ${i + 1}. ${e.title}`, '', e.instruction, '');
			if (e.material) out.push(quote(e.material), '');
		});
	}
	if (ctx.written || ctx.voice) {
		out.push('## The numbers', '', 'Counted by code, not judged.', '');
		if (ctx.written) out.push(metricsTable('Written', ctx.written));
		if (ctx.voice) out.push(metricsTable('Spoken (voice transcripts)', ctx.voice));
	}
	return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------- which entries a request means ----------

// A real calendar day, so 2026-13-45 is refused and check() asks again.
const isDay = (d: string) => {
	const t = Date.parse(d + 'T00:00Z');
	return /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(t) && new Date(t).toISOString().startsWith(d);
};
const Day = z.string().refine(isDay, 'not a calendar day');
const MAX_REQUEST = 4000;

const ScopeSchema = z.object({
	ranges: z.array(z.object({ from: Day, to: Day })).default([]),
	kinds: z.array(z.enum(['written', 'voice'])).default([]),
	last: z.number().int().positive().nullable().default(null)
});
export type Scope = z.infer<typeof ScopeSchema>;

const SCOPE_SYSTEM = `The author asks for a report on some of their journal entries, in English or Portuguese. Work out which entries the request means. You get today's date, its weekday, and the first and last day of the journal.
- "ranges": the days the request names, each inclusive, as YYYY-MM-DD. A month or week without a year is the most recent one that has started. A week starts on Monday. "Today" and "tonight" mean today; "yesterday" and "last night" mean the day before. "These last two weeks" ends today.
- "kinds": ["written"] if they ask only for written entries, ["voice"] if only for voice journals (spoken, audio, recordings); otherwise both.
- "last": a number only when they ask for their last N entries; it may come with no ranges.
- "All my entries" is one range from the first day to the last.
- If the request does not say which entries, reply with no ranges and "last": null.
Reply with: {"ranges": [{"from": "", "to": ""}], "kinds": ["written", "voice"], "last": null}`;

/** The entries a scope names, oldest first. */
export function applyScope(metas: EntryMeta[], s: Scope): EntryMeta[] {
	const kinds = s.kinds.length ? s.kinds : ['written', 'voice'];
	const ranges = s.ranges.map((r) => (r.from <= r.to ? r : { from: r.to, to: r.from }));
	let hit = metas.filter((m) => kinds.includes(m.kind) && (!ranges.length || ranges.some((r) => m.day >= r.from && m.day <= r.to)));
	if (!ranges.length && !s.last) return [];
	hit = [...hit].sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'written' ? -1 : 1));
	return s.last ? hit.slice(-s.last) : hit;
}

/** Reads which entries the request means; sends only the request and the dates, never an entry. */
export async function entriesFor(request: string, now = Date.now()): Promise<EntryMeta[]> {
	const metas = listEntries();
	if (!metas.length) return [];
	const today = journalDay(now, env.timezone);
	const weekday = new Date(today + 'T12:00Z').toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
	const s = await check(
		'j-scope',
		ScopeSchema,
		SCOPE_SYSTEM,
		{ today, weekday, first_day: metas[metas.length - 1].day, last_day: metas[0].day, request: request.trim() },
		{ role: 'fast', maxTokens: 800, keepRaw: false }
	);
	if (!s) error(503, 'Could not work out which entries you mean: the model is switched off in Settings or did not answer. Pick them below.');
	return applyScope(metas, s);
}

export async function generateReport(ids: string[], notes: string, now = Date.now()): Promise<string> {
	let uniq = [...new Set(ids)];
	if (notes.length > MAX_REQUEST) error(400, `Keep the request under ${MAX_REQUEST.toLocaleString('en-GB')} characters.`);
	if (!uniq.length) {
		if (!notes.trim()) error(400, 'Say which entries to read, or pick them below.');
		uniq = (await entriesFor(notes, now)).map((m) => m.id);
		if (!uniq.length) error(400, 'I could not tell which entries you mean. Name a day, a week, a month or your last few entries, or pick them below.');
	}
	const entries = uniq
		.map(readEntry)
		.filter((e) => analysableText(e).trim())
		.sort((a, b) => a.day.localeCompare(b.day) || (a.kind === b.kind ? 0 : a.kind === 'written' ? -1 : 1));
	if (!entries.length) error(400, 'Those entries are empty.');
	const total = entries.reduce((s, e) => s + analysableText(e).length, 0);
	if (total > MAX_CHARS)
		error(400, `That is ${entries.length} entries, about ${Math.round(total / 1000)}k characters, more than one report can read (about ${MAX_CHARS / 1000}k). Ask for a shorter period, or for written or voice entries only.`);
	const w = entries.filter((e) => e.kind === 'written').map(analysableText);
	const v = entries.filter((e) => e.kind === 'voice').map(analysableText);
	const metric = (texts: string[], baseline: boolean) => {
		if (!texts.length) return undefined;
		const lang = langOf(texts);
		return journalMetrics(texts.join('\n\n'), { lang, baseline: baseline && lang === 'en' ? writtenBaseline() : undefined, zipf: (x) => zipfOf(x, lang) });
	};
	const written = metric(w, true);
	const voice = metric(v, false);
	const r = await check(
		'j-report',
		ReportSchema,
		REPORT_SYSTEM,
		{
			request: notes.trim() || null,
			entries: entries.map((e) => ({ title: e.title, kind: e.kind, text: analysableText(e) })),
			metrics: { written: written ?? null, spoken: voice ?? null }
		},
		{ role: 'judge', think: true, maxTokens: 12000, keepRaw: false }
	);
	if (!r) error(503, 'The report could not be written: the model is switched off in Settings or did not answer.');
	const { stamp, human } = stampOf(now);
	return writeReport(stamp, reportMarkdown(r, { entries, notes, human, model: env.modelJudge, written, voice }));
}

// ---------- wording help ----------

const WordingSchema = z.object({
	options: z.array(z.object({ text: z.string(), note: z.string().default('') })).min(1).max(10)
});
export type Wording = z.infer<typeof WordingSchema>;

const WORDING_SYSTEM = `You help the author of a journal find words while they write. The author is ${env.learnerProfile}.
You get what they selected, the sentence around it, and sometimes what they mean.
- One word or a short phrase selected: give 6 to 8 alternatives that fit the sentence, most precise first, from plain to literary, each with a short note on its nuance.
- A clause or sentence selected: give 4 or 5 rewordings that keep their meaning, each with a different structure, each with a short note on what it changes.
- Nothing selected, only what they mean: give 5 to 8 words or short phrases that name it, most likely first.
Keep their voice: the options are for them to choose from, not to correct them. Match the language of the text; Portuguese means European Portuguese.
Reply with: {"options": [{"text": "", "note": ""}]}`;

export async function wording(p: { selection: string; sentence: string; want: string }, now = Date.now()): Promise<Wording> {
	const selection = p.selection.trim().slice(0, 600);
	const want = p.want.trim().slice(0, 400);
	if (!selection && !want) error(400, 'Select some words, or say what you mean.');
	const r = await check(
		'j-wording',
		WordingSchema,
		WORDING_SYSTEM,
		{ selected: selection || null, sentence: p.sentence.trim().slice(0, 1200) || null, i_mean: want || null },
		{ role: 'fast', maxTokens: 1500, keepRaw: false }
	);
	if (!r) error(503, 'No suggestions: the model is switched off in Settings or did not answer.');
	try {
		const { human } = stampOf(now);
		const asked = [selection && `«${selection}»`, want && `meaning "${want}"`].filter(Boolean).join(', ');
		logWording(`- ${human} · ${asked} → ${r.options.map((o) => o.text).join('; ')}`, human.slice(0, 7));
	} catch (e) {
		console.error('wording log', e);
	}
	return r;
}

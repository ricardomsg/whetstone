import { eq } from 'drizzle-orm';
import { db, schema } from './db';

/** Every feature that sends something to a model, what it sends, and its default. Shown in Settings. */
export const LLM_FEATURES = {
	'a1-synonym': { label: 'A1: judge an answer that is not the target', sends: 'the definition, the target and your answer', work: false, default: true },
	'a1-sentence': { label: 'A1: check your sentence after a reveal', sends: 'the word and your sentence', work: false, default: true },
	'a2-validate': { label: 'A2: validate category words and group them', sends: 'the category and your words', work: false, default: true },
	'a4-synonym-ladder': { label: 'A4: grade the precision pick', sends: 'the sentence and your answer', work: false, default: true },
	'a4-reference': { label: 'A4: reference alternatives to learn from (once per item, cached)', sends: 'the sentence only', work: false, default: true },
	'a8-check': { label: 'A8: judge a translation that is not the expected one', sends: 'the cue, its sentence, the expected answer and your answer', work: false, default: true },
	'a8-sentence': { label: 'A8: check your sentence after a hint or reveal', sends: 'the expression and your sentence', work: false, default: true },
	'a8-capture': { label: 'A8: prepare the translation of a word you missed', sends: 'the word and, if you give it, what you were saying', work: false, default: true },
	'a7-suggest': { label: 'A7: suggest the word you were reaching for', sends: 'the meaning and what came to mind', work: false, default: true },
	'b1-enrich': { label: 'B1: enrich a captured word', sends: 'the word and its source sentence', work: false, default: true },
	'b3-use-it': { label: 'B3: grade your sentences', sends: 'the word and your sentences', work: false, default: true },
	'c1-extract': { label: 'C1: extract conversation key points', sends: 'the recap, person label and topic (work content)', work: true, default: true },
	'c2-recall': { label: 'C2: grade delayed conversation recall', sends: 'the cue, confirmed key points and your recall (work content)', work: true, default: true },
	'c3-reentry': { label: 'C3: grade a conversation re-entry', sends: 'confirmed key points, the cue, your opener and recall (work content)', work: true, default: true },
	'd1-note-quality': { label: 'D1: grade a resume note', sends: 'the note text (work content)', work: true, default: true },
	'd2-resume-recall': { label: 'D2: score recall against the note', sends: 'the note and your recall (work content)', work: true, default: true },
	'j-report': { label: 'Journal: write a report on the entries you pick', sends: 'the entries you pick with their titles, your notes, the numbers computed from them, comparisons with your whole written journal and your learner profile, if set (journal content)', work: false, default: true },
	'j-scope': { label: 'Journal: work out which entries a report request means', sends: "your report request, today's date and the first and last day of the journal, never an entry", work: false, default: true },
	'j-wording': { label: 'Journal: offer other words or another wording', sends: 'the words you select, the sentence around them, what you say you mean and your learner profile, if set (journal content)', work: false, default: true },
	'd2-transcript-tail': {
		label: 'D2: summarise a Claude Code transcript tail when no note exists',
		sends: 'the session title, its project path and the last turns of its transcript (work content)',
		work: true,
		default: true
	}
} as const;
export type LlmFeature = keyof typeof LLM_FEATURES;

export interface Settings {
	defaultLang: 'en' | 'pt-PT' | 'mixed';
	sessionMinutes: 5 | 15 | 30;
	effortWindowSec: number;
	reviewCap: number;
	hintPenalty: number;
	graduateUses: number;
	graduateDays: number;
	resumePrompting: boolean;
	transcriptTailTurns: number;
	guidanceSeen: Record<string, number>;
	llm: Record<string, boolean>;
}

export const DEFAULTS: Settings = {
	defaultLang: 'en',
	sessionMinutes: 15,
	effortWindowSec: 15,
	reviewCap: 30,
	hintPenalty: 15,
	graduateUses: 3,
	graduateDays: 3,
	resumePrompting: true,
	transcriptTailTurns: 12,
	guidanceSeen: {},
	llm: Object.fromEntries(Object.entries(LLM_FEATURES).map(([k, v]) => [k, v.default]))
};

export function getSettings(): Settings {
	const row = db.select().from(schema.settings).where(eq(schema.settings.id, 1)).get();
	const data = (row?.data ?? {}) as Partial<Settings>;
	return { ...DEFAULTS, ...data, llm: { ...DEFAULTS.llm, ...(data.llm ?? {}) }, guidanceSeen: { ...(data.guidanceSeen ?? {}) } };
}

export function saveSettings(patch: Partial<Settings>): Settings {
	const next = { ...getSettings(), ...patch };
	db.insert(schema.settings)
		.values({ id: 1, data: next as any })
		.onConflictDoUpdate({ target: schema.settings.id, set: { data: next as any, updatedAt: Date.now() } })
		.run();
	return next;
}

/** Unknown feature names (internal checks) are allowed; listed features obey their switch. */
export function featureEnabled(name: string): boolean {
	if (!(name in LLM_FEATURES)) return true;
	return getSettings().llm[name] !== false;
}

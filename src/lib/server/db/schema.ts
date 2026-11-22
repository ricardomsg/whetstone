import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Conventions: ids are text (random or content ids); timestamps are epoch ms integers;
// language is 'en' | 'pt-PT'; JSON columns are typed with $type.

export type Lang = 'en' | 'pt-PT';
const now = () => Date.now();

export const settings = sqliteTable('user_settings', {
	id: integer('id').primaryKey(),
	data: text('data', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
	updatedAt: integer('updated_at').notNull().$defaultFn(now)
});

export const authSession = sqliteTable('auth_session', {
	id: text('id').primaryKey(),
	createdAt: integer('created_at').notNull().$defaultFn(now),
	expiresAt: integer('expires_at').notNull()
});

export const dailyCheckin = sqliteTable('daily_checkin', {
	date: text('date').primaryKey(), // YYYY-MM-DD, local time
	sleepHours: real('sleep_hours'),
	sleepQuality: integer('sleep_quality'),
	energy: integer('energy'),
	stress: integer('stress'),
	exercise: text('exercise'), // none | light | aerobic | sport
	mainLanguage: text('main_language'), // en | pt-PT | mixed
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const rubric = sqliteTable(
	'rubric',
	{
		id: text('id').notNull(),
		version: integer('version').notNull(),
		hash: text('hash').notNull(),
		body: text('body').notNull(),
		loadedAt: integer('loaded_at').notNull().$defaultFn(now)
	},
	(t) => [uniqueIndex('rubric_id_version').on(t.id, t.version)]
);

export const item = sqliteTable(
	'item',
	{
		id: text('id').primaryKey(),
		exercise: text('exercise').notNull(), // A1 | A2 | A4 | B2 ...
		lang: text('lang').$type<Lang>().notNull(),
		target: text('target'),
		prompt: text('prompt', { mode: 'json' }).$type<Record<string, any>>().notNull(),
		pos: text('pos'),
		zipf: real('zipf'),
		band: integer('band'),
		concreteness: text('concreteness'),
		rating: real('rating').notNull().default(1500),
		rd: real('rd').notNull().default(350),
		vol: real('vol').notNull().default(0.06),
		source: text('source').notNull(), // seed | tot_log | inbox | generated
		parallelSet: integer('parallel_set').notNull().default(0),
		active: integer('active', { mode: 'boolean' }).notNull().default(true),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(t) => [index('item_ex_lang').on(t.exercise, t.lang, t.parallelSet)]
);

export const attempt = sqliteTable(
	'attempt',
	{
		id: text('id').primaryKey(),
		exercise: text('exercise').notNull(),
		itemId: text('item_id'),
		lang: text('lang').$type<Lang>().notNull(),
		dailySessionId: text('daily_session_id'),
		benchmarkRunId: text('benchmark_run_id'),
		startedAt: integer('started_at').notNull(),
		finishedAt: integer('finished_at'),
		input: text('input', { mode: 'json' }).$type<Record<string, any>>(),
		timings: text('timings', { mode: 'json' }).$type<Record<string, any>>(),
		hintsUsed: integer('hints_used').notNull().default(0),
		state: text('state'), // correct | synonym | near_miss | wrong | tot | dont_know | revealed | done
		metrics: text('metrics', { mode: 'json' }).$type<Record<string, any>>(),
		scores: text('scores', { mode: 'json' }).$type<Record<string, number>>(), // normalised 0-100 per skill
		feedback: text('feedback', { mode: 'json' }).$type<Record<string, any>>(),
		overridden: integer('overridden', { mode: 'boolean' }).notNull().default(false)
	},
	(t) => [index('attempt_ex_time').on(t.exercise, t.startedAt), index('attempt_time').on(t.startedAt)]
);

export const judgeEval = sqliteTable('judge_eval', {
	id: text('id').primaryKey(),
	attemptId: text('attempt_id'),
	purpose: text('purpose').notNull(), // rubric id, or a check name
	rubricId: text('rubric_id'),
	rubricVersion: integer('rubric_version'),
	provider: text('provider').notNull(),
	model: text('model').notNull(),
	temperature: real('temperature'),
	promptHash: text('prompt_hash').notNull(),
	rawResponse: text('raw_response'),
	parsed: text('parsed', { mode: 'json' }).$type<Record<string, any>>(),
	ok: integer('ok', { mode: 'boolean' }).notNull(),
	retries: integer('retries').notNull().default(0),
	tokensIn: integer('tokens_in').notNull().default(0),
	tokensOut: integer('tokens_out').notNull().default(0),
	costUsd: real('cost_usd').notNull().default(0),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const scoreOverride = sqliteTable('score_override', {
	id: text('id').primaryKey(),
	attemptId: text('attempt_id').notNull(),
	criterion: text('criterion').notNull(),
	oldScore: real('old_score'),
	newScore: real('new_score').notNull(),
	reason: text('reason'),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const skillRating = sqliteTable(
	'skill_rating',
	{
		dimension: text('dimension').notNull(), // WR FL PR VOC TRP TRA STR
		lang: text('lang').notNull(), // en | pt-PT | all
		rating: real('rating').notNull().default(1500),
		rd: real('rd').notNull().default(350),
		vol: real('vol').notNull().default(0.06),
		updatedAt: integer('updated_at').notNull().$defaultFn(now)
	},
	(t) => [uniqueIndex('skill_dim_lang').on(t.dimension, t.lang)]
);

export const skillRatingHistory = sqliteTable('skill_rating_history', {
	id: text('id').primaryKey(),
	dimension: text('dimension').notNull(),
	lang: text('lang').notNull(),
	attemptId: text('attempt_id'),
	before: real('before').notNull(),
	after: real('after').notNull(),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const card = sqliteTable(
	'card',
	{
		id: text('id').primaryKey(),
		itemId: text('item_id').notNull(),
		vocabId: text('vocab_id'),
		direction: text('direction').notNull().default('productive'),
		fsrs: text('fsrs', { mode: 'json' }).$type<Record<string, any>>().notNull(),
		due: integer('due').notNull(),
		sticky: integer('sticky', { mode: 'boolean' }).notNull().default(false),
		tags: text('tags', { mode: 'json' }).$type<string[]>().notNull(),
		suspended: integer('suspended', { mode: 'boolean' }).notNull().default(false),
		createdAt: integer('created_at').notNull().$defaultFn(now)
	},
	(t) => [index('card_due').on(t.due), uniqueIndex('card_item_dir').on(t.itemId, t.direction)]
);

export const reviewLog = sqliteTable('review_log', {
	id: text('id').primaryKey(),
	cardId: text('card_id').notNull(),
	attemptId: text('attempt_id'),
	gradeComputed: integer('grade_computed').notNull(),
	gradeFinal: integer('grade_final').notNull(),
	latencyMs: integer('latency_ms'),
	hints: integer('hints').notNull().default(0),
	log: text('log', { mode: 'json' }).$type<Record<string, any>>(),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const vocabEntry = sqliteTable('vocab_entry', {
	id: text('id').primaryKey(),
	word: text('word').notNull(),
	lang: text('lang').$type<Lang>().notNull(),
	sourceSentence: text('source_sentence'),
	sourceNote: text('source_note'),
	enrichment: text('enrichment', { mode: 'json' }).$type<Record<string, any>>(),
	stage: text('stage').notNull().default('inbox'), // inbox | learning | active | discarded
	productiveUses: integer('productive_uses').notNull().default(0),
	useDays: text('use_days', { mode: 'json' }).$type<string[]>().notNull(),
	itemId: text('item_id'),
	createdAt: integer('created_at').notNull().$defaultFn(now),
	activatedAt: integer('activated_at')
});

export const totLog = sqliteTable('tot_log', {
	id: text('id').primaryKey(),
	meaning: text('meaning').notNull(),
	interlopers: text('interlopers'),
	resolution: text('resolution').notNull().default('open'), // self | looked_up | helped | open
	word: text('word'),
	context: text('context'), // speaking-work | speaking-personal | writing-work | writing-personal
	lang: text('lang').$type<Lang>().notNull(),
	candidates: text('candidates', { mode: 'json' }).$type<Record<string, any>>(),
	hintsUsed: integer('hints_used').notNull().default(0),
	itemId: text('item_id'),
	capturedAt: integer('captured_at').notNull().$defaultFn(now),
	resolvedAt: integer('resolved_at')
});

export const workSession = sqliteTable('work_session', {
	id: text('id').primaryKey(), // claude session id, or a random id for manual sessions
	source: text('source').notNull(), // manual | claude_code
	projectPath: text('project_path'),
	title: text('title'),
	lastActivity: integer('last_activity'),
	archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export type ThreadPoint = { kind: 'fact' | 'decision' | 'open'; text: string };

export const thread = sqliteTable('thread', {
	id: text('id').primaryKey(),
	person: text('person').notNull(),
	topic: text('topic').notNull(),
	lang: text('lang').$type<Lang>().notNull(),
	recap: text('recap').notNull(),
	cue: text('cue').notNull(),
	status: text('status').$type<'draft' | 'active' | 'archived'>().notNull().default('draft'),
	version: integer('version').notNull().default(1),
	fsrs: text('fsrs', { mode: 'json' }).$type<Record<string, any>>(),
	due: integer('due'),
	capturedAt: integer('captured_at').notNull().$defaultFn(now),
	updatedAt: integer('updated_at').notNull().$defaultFn(now)
}, (t) => [index('thread_due').on(t.status, t.due)]);

export const threadKeypoint = sqliteTable('thread_keypoint', {
	id: text('id').primaryKey(),
	threadId: text('thread_id').notNull().references(() => thread.id),
	kind: text('kind').$type<ThreadPoint['kind']>().notNull(),
	text: text('text').notNull(),
	position: integer('position').notNull()
});

// An immutable reference for each drill; never included in an unfinished page response.
export const threadPractice = sqliteTable('thread_practice', {
	attemptId: text('attempt_id').primaryKey().references(() => attempt.id),
	threadId: text('thread_id').notNull().references(() => thread.id),
	version: integer('version').notNull(),
	points: text('points', { mode: 'json' }).$type<ThreadPoint[]>().notNull(),
	capturedAt: integer('captured_at').notNull()
});

export const resumeNote = sqliteTable('resume_note', {
	id: text('id').primaryKey(),
	sessionId: text('session_id').notNull(),
	stoppedAt: text('stopped_at').notNull(),
	nextAction: text('next_action').notNull(),
	openRisks: text('open_risks'),
	waitingOn: text('waiting_on'),
	via: text('via').notNull().default('web'), // web | cli | hook
	quality: text('quality', { mode: 'json' }).$type<Record<string, any>>(),
	attemptId: text('attempt_id'),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const resumeAttempt = sqliteTable('resume_attempt', {
	id: text('id').primaryKey(),
	sessionId: text('session_id').notNull(),
	noteId: text('note_id'),
	truthSource: text('truth_source').notNull(), // note | transcript
	retrospective: text('retrospective'),
	prospective: text('prospective'),
	openedAt: integer('opened_at').notNull(),
	answeredAt: integer('answered_at'),
	backInFlowAt: integer('back_in_flow_at'),
	attemptId: text('attempt_id')
});

export const dailySession = sqliteTable('daily_session', {
	id: text('id').primaryKey(),
	date: text('date').notNull(),
	minutes: integer('minutes').notNull(),
	lang: text('lang').notNull(),
	plan: text('plan', { mode: 'json' }).$type<any[]>().notNull(),
	completed: text('completed', { mode: 'json' }).$type<string[]>().notNull(),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const benchmarkRun = sqliteTable('benchmark_run', {
	id: text('id').primaryKey(),
	parallelSet: integer('parallel_set').notNull(),
	lang: text('lang').notNull(),
	startedAt: integer('started_at').notNull(),
	finishedAt: integer('finished_at'),
	steps: text('steps', { mode: 'json' }).$type<any[]>().notNull(),
	results: text('results', { mode: 'json' }).$type<Record<string, any>>()
});

export const llmUsage = sqliteTable('llm_usage', {
	id: text('id').primaryKey(),
	date: text('date').notNull(),
	feature: text('feature').notNull(),
	provider: text('provider').notNull(),
	model: text('model').notNull(),
	tokensIn: integer('tokens_in').notNull(),
	tokensOut: integer('tokens_out').notNull(),
	costUsd: real('cost_usd').notNull(),
	createdAt: integer('created_at').notNull().$defaultFn(now)
});

export const lexicon = sqliteTable(
	'lexicon',
	{
		lang: text('lang').notNull(),
		word: text('word').notNull(),
		zipf: real('zipf').notNull()
	},
	(t) => [uniqueIndex('lexicon_lang_word').on(t.lang, t.word)]
);

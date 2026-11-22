CREATE TABLE `attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise` text NOT NULL,
	`item_id` text,
	`lang` text NOT NULL,
	`daily_session_id` text,
	`benchmark_run_id` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`input` text,
	`timings` text,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`state` text,
	`metrics` text,
	`scores` text,
	`feedback` text,
	`overridden` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempt_ex_time` ON `attempt` (`exercise`,`started_at`);--> statement-breakpoint
CREATE INDEX `attempt_time` ON `attempt` (`started_at`);--> statement-breakpoint
CREATE TABLE `auth_session` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `benchmark_run` (
	`id` text PRIMARY KEY NOT NULL,
	`parallel_set` integer NOT NULL,
	`lang` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`steps` text NOT NULL,
	`results` text
);
--> statement-breakpoint
CREATE TABLE `card` (
	`id` text PRIMARY KEY NOT NULL,
	`item_id` text NOT NULL,
	`vocab_id` text,
	`direction` text DEFAULT 'productive' NOT NULL,
	`fsrs` text NOT NULL,
	`due` integer NOT NULL,
	`sticky` integer DEFAULT false NOT NULL,
	`tags` text NOT NULL,
	`suspended` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `card_due` ON `card` (`due`);--> statement-breakpoint
CREATE UNIQUE INDEX `card_item_dir` ON `card` (`item_id`,`direction`);--> statement-breakpoint
CREATE TABLE `daily_checkin` (
	`date` text PRIMARY KEY NOT NULL,
	`sleep_hours` real,
	`sleep_quality` integer,
	`energy` integer,
	`stress` integer,
	`exercise` text,
	`main_language` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `daily_session` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`minutes` integer NOT NULL,
	`lang` text NOT NULL,
	`plan` text NOT NULL,
	`completed` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` text PRIMARY KEY NOT NULL,
	`exercise` text NOT NULL,
	`lang` text NOT NULL,
	`target` text,
	`prompt` text NOT NULL,
	`pos` text,
	`zipf` real,
	`band` integer,
	`concreteness` text,
	`rating` real DEFAULT 1500 NOT NULL,
	`rd` real DEFAULT 350 NOT NULL,
	`vol` real DEFAULT 0.06 NOT NULL,
	`source` text NOT NULL,
	`parallel_set` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `item_ex_lang` ON `item` (`exercise`,`lang`,`parallel_set`);--> statement-breakpoint
CREATE TABLE `judge_eval` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text,
	`purpose` text NOT NULL,
	`rubric_id` text,
	`rubric_version` integer,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`temperature` real,
	`prompt_hash` text NOT NULL,
	`raw_response` text,
	`parsed` text,
	`ok` integer NOT NULL,
	`retries` integer DEFAULT 0 NOT NULL,
	`tokens_in` integer DEFAULT 0 NOT NULL,
	`tokens_out` integer DEFAULT 0 NOT NULL,
	`cost_usd` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lexicon` (
	`lang` text NOT NULL,
	`word` text NOT NULL,
	`zipf` real NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lexicon_lang_word` ON `lexicon` (`lang`,`word`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`feature` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`tokens_in` integer NOT NULL,
	`tokens_out` integer NOT NULL,
	`cost_usd` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `resume_attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`note_id` text,
	`truth_source` text NOT NULL,
	`retrospective` text,
	`prospective` text,
	`opened_at` integer NOT NULL,
	`answered_at` integer,
	`back_in_flow_at` integer,
	`attempt_id` text
);
--> statement-breakpoint
CREATE TABLE `resume_note` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`stopped_at` text NOT NULL,
	`next_action` text NOT NULL,
	`open_risks` text,
	`waiting_on` text,
	`via` text DEFAULT 'web' NOT NULL,
	`quality` text,
	`attempt_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `review_log` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`attempt_id` text,
	`grade_computed` integer NOT NULL,
	`grade_final` integer NOT NULL,
	`latency_ms` integer,
	`hints` integer DEFAULT 0 NOT NULL,
	`log` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rubric` (
	`id` text NOT NULL,
	`version` integer NOT NULL,
	`hash` text NOT NULL,
	`body` text NOT NULL,
	`loaded_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rubric_id_version` ON `rubric` (`id`,`version`);--> statement-breakpoint
CREATE TABLE `score_override` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`criterion` text NOT NULL,
	`old_score` real,
	`new_score` real NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skill_rating` (
	`dimension` text NOT NULL,
	`lang` text NOT NULL,
	`rating` real DEFAULT 1500 NOT NULL,
	`rd` real DEFAULT 350 NOT NULL,
	`vol` real DEFAULT 0.06 NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skill_dim_lang` ON `skill_rating` (`dimension`,`lang`);--> statement-breakpoint
CREATE TABLE `skill_rating_history` (
	`id` text PRIMARY KEY NOT NULL,
	`dimension` text NOT NULL,
	`lang` text NOT NULL,
	`attempt_id` text,
	`before` real NOT NULL,
	`after` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tot_log` (
	`id` text PRIMARY KEY NOT NULL,
	`meaning` text NOT NULL,
	`interlopers` text,
	`resolution` text DEFAULT 'open' NOT NULL,
	`word` text,
	`context` text,
	`lang` text NOT NULL,
	`candidates` text,
	`hints_used` integer DEFAULT 0 NOT NULL,
	`item_id` text,
	`captured_at` integer NOT NULL,
	`resolved_at` integer
);
--> statement-breakpoint
CREATE TABLE `vocab_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`word` text NOT NULL,
	`lang` text NOT NULL,
	`source_sentence` text,
	`source_note` text,
	`enrichment` text,
	`stage` text DEFAULT 'inbox' NOT NULL,
	`productive_uses` integer DEFAULT 0 NOT NULL,
	`use_days` text NOT NULL,
	`item_id` text,
	`created_at` integer NOT NULL,
	`activated_at` integer
);
--> statement-breakpoint
CREATE TABLE `work_session` (
	`id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`project_path` text,
	`title` text,
	`last_activity` integer,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL
);

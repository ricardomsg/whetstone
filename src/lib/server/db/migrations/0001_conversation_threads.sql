CREATE TABLE `thread` (
	`id` text PRIMARY KEY NOT NULL,
	`person` text NOT NULL,
	`topic` text NOT NULL,
	`lang` text NOT NULL,
	`recap` text NOT NULL,
	`cue` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`fsrs` text,
	`due` integer,
	`captured_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `thread_due` ON `thread` (`status`,`due`);--> statement-breakpoint
CREATE TABLE `thread_keypoint` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`kind` text NOT NULL,
	`text` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `thread`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `thread_practice` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`version` integer NOT NULL,
	`points` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempt`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`thread_id`) REFERENCES `thread`(`id`) ON UPDATE no action ON DELETE no action
);

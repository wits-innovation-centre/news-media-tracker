CREATE TABLE `user_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`device_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`last_active_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_user_sessions_user` ON `user_sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_device_sessions` ON `user_sessions` (`user_id`,`device_id`);--> statement-breakpoint
ALTER TABLE `workspace_invites` ADD `created_by` text;--> statement-breakpoint
CREATE INDEX `idx_invites_creator` ON `workspace_invites` (`created_by`);
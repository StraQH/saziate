CREATE TABLE `agent_invitations` (
	`token` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`psp_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
DROP INDEX `resident_profiles_reference_code_unique`;--> statement-breakpoint
ALTER TABLE `resident_profiles` DROP COLUMN `reference_code`;--> statement-breakpoint
ALTER TABLE `routes` ADD `collection_schedule` text DEFAULT 'Mondays & Thursdays' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_name` text;
CREATE TABLE `complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`psp_id` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade
);

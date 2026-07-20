CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`psp_id` text NOT NULL,
	`resident_id` text,
	`channel` text NOT NULL,
	`message_type` text NOT NULL,
	`cost_ngn` real DEFAULT 0 NOT NULL,
	`termii_message_id` text,
	`status` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);

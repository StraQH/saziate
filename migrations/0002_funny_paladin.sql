CREATE TABLE `pending_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`psp_id` text NOT NULL,
	`resident_id` text,
	`channel` text NOT NULL,
	`message_type` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`message_text` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);

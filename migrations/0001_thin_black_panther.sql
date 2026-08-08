PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_complaints` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`org_id` text NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_complaints`("id", "resident_id", "org_id", "description", "status", "created_at", "updated_at") SELECT "id", "resident_id", "org_id", "description", "status", "created_at", "updated_at" FROM `complaints`;--> statement-breakpoint
DROP TABLE `complaints`;--> statement-breakpoint
ALTER TABLE `__new_complaints` RENAME TO `complaints`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_field_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`zone_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`logged_by_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`image_url` text,
	`metrics` text,
	`logged_at` integer NOT NULL,
	`synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`zone_id`) REFERENCES `zones`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_field_logs`("id", "zone_id", "resident_id", "logged_by_id", "status", "notes", "image_url", "metrics", "logged_at", "synced_at") SELECT "id", "zone_id", "resident_id", "logged_by_id", "status", "notes", "image_url", "metrics", "logged_at", "synced_at" FROM `field_logs`;--> statement-breakpoint
DROP TABLE `field_logs`;--> statement-breakpoint
ALTER TABLE `__new_field_logs` RENAME TO `field_logs`;--> statement-breakpoint
CREATE INDEX `field_logs_resident_idx` ON `field_logs` (`resident_id`);--> statement-breakpoint
CREATE INDEX `field_logs_zone_idx` ON `field_logs` (`zone_id`);--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`org_id` text NOT NULL,
	`payment_reference` text,
	`base_amount` real NOT NULL,
	`platform_fee` real NOT NULL,
	`total_amount` real NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`billing_period_start` integer NOT NULL,
	`billing_period_end` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "resident_id", "org_id", "payment_reference", "base_amount", "platform_fee", "total_amount", "due_date", "status", "billing_period_start", "billing_period_end", "created_at") SELECT "id", "resident_id", "org_id", "payment_reference", "base_amount", "platform_fee", "total_amount", "due_date", "status", "billing_period_start", "billing_period_end", "created_at" FROM `invoices`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_payment_reference_unique` ON `invoices` (`payment_reference`);--> statement-breakpoint
CREATE INDEX `invoices_resident_idx` ON `invoices` (`resident_id`);--> statement-breakpoint
CREATE INDEX `invoices_org_idx` ON `invoices` (`org_id`);--> statement-breakpoint
CREATE INDEX `invoices_status_idx` ON `invoices` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_resident_billing_period_start_unique` ON `invoices` (`resident_id`,`billing_period_start`);--> statement-breakpoint
CREATE TABLE `__new_pending_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`resident_id` text,
	`channel` text NOT NULL,
	`message_type` text NOT NULL,
	`recipient_phone` text NOT NULL,
	`message_text` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_attempt_at` integer,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_pending_notifications`("id", "org_id", "resident_id", "channel", "message_type", "recipient_phone", "message_text", "attempts", "last_attempt_at", "error", "created_at") SELECT "id", "org_id", "resident_id", "channel", "message_type", "recipient_phone", "message_text", "attempts", "last_attempt_at", "error", "created_at" FROM `pending_notifications`;--> statement-breakpoint
DROP TABLE `pending_notifications`;--> statement-breakpoint
ALTER TABLE `__new_pending_notifications` RENAME TO `pending_notifications`;--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`resident_id` text NOT NULL,
	`org_id` text,
	`reference` text NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'initiated' NOT NULL,
	`payment_method` text NOT NULL,
	`cash_status` text,
	`logged_by_id` text,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "invoice_id", "resident_id", "org_id", "reference", "amount", "status", "payment_method", "cash_status", "logged_by_id", "paid_at", "created_at") SELECT "id", "invoice_id", "resident_id", "org_id", "reference", "amount", "status", "payment_method", "cash_status", "logged_by_id", "paid_at", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference_unique` ON `transactions` (`reference`);--> statement-breakpoint
CREATE INDEX `transactions_org_idx` ON `transactions` (`org_id`);--> statement-breakpoint
CREATE INDEX `transactions_resident_idx` ON `transactions` (`resident_id`);--> statement-breakpoint
CREATE INDEX `transactions_status_idx` ON `transactions` (`status`);--> statement-breakpoint
ALTER TABLE `users` ADD `is_active` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `users_org_id_idx` ON `users` (`org_id`);--> statement-breakpoint
CREATE INDEX `users_is_active_idx` ON `users` (`is_active`);--> statement-breakpoint
CREATE INDEX `notification_logs_org_idx` ON `notification_logs` (`org_id`);--> statement-breakpoint
CREATE INDEX `resident_profiles_user_idx` ON `resident_profiles` (`user_id`);--> statement-breakpoint
CREATE INDEX `zones_agent_idx` ON `zones` (`assigned_agent_id`);
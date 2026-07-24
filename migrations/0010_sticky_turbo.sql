PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_audit_logs`("id", "actor_id", "action", "entity_type", "entity_id", "meta", "created_at") SELECT "id", "actor_id", "action", "entity_type", "entity_id", "meta", "created_at" FROM `audit_logs`;--> statement-breakpoint
DROP TABLE `audit_logs`;--> statement-breakpoint
ALTER TABLE `__new_audit_logs` RENAME TO `audit_logs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_collection_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`logged_by_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`image_url` text,
	`logged_at` integer NOT NULL,
	`synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_collection_logs`("id", "route_id", "resident_id", "logged_by_id", "status", "notes", "image_url", "logged_at", "synced_at") SELECT "id", "route_id", "resident_id", "logged_by_id", "status", "notes", "image_url", "logged_at", "synced_at" FROM `collection_logs`;--> statement-breakpoint
DROP TABLE `collection_logs`;--> statement-breakpoint
ALTER TABLE `__new_collection_logs` RENAME TO `collection_logs`;--> statement-breakpoint
CREATE INDEX `collection_logs_resident_idx` ON `collection_logs` (`resident_id`);--> statement-breakpoint
CREATE TABLE `__new_invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`psp_id` text NOT NULL,
	`payment_reference` text,
	`base_amount` real NOT NULL,
	`platform_fee` real NOT NULL,
	`total_amount` real NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`billing_period_start` integer NOT NULL,
	`billing_period_end` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_invoices`("id", "resident_id", "psp_id", "payment_reference", "base_amount", "platform_fee", "total_amount", "due_date", "status", "billing_period_start", "billing_period_end", "created_at") SELECT "id", "resident_id", "psp_id", "payment_reference", "base_amount", "platform_fee", "total_amount", "due_date", "status", "billing_period_start", "billing_period_end", "created_at" FROM `invoices`;--> statement-breakpoint
DROP TABLE `invoices`;--> statement-breakpoint
ALTER TABLE `__new_invoices` RENAME TO `invoices`;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_payment_reference_unique` ON `invoices` (`payment_reference`);--> statement-breakpoint
CREATE INDEX `invoices_resident_idx` ON `invoices` (`resident_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_resident_billing_period_start_unique` ON `invoices` (`resident_id`,`billing_period_start`);--> statement-breakpoint
CREATE TABLE `__new_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`invoice_id` text,
	`resident_id` text NOT NULL,
	`reference` text NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'initiated' NOT NULL,
	`payment_method` text NOT NULL,
	`cash_status` text,
	`logged_by_id` text,
	`paid_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_transactions`("id", "invoice_id", "resident_id", "reference", "amount", "status", "payment_method", "cash_status", "logged_by_id", "paid_at", "created_at") SELECT "id", "invoice_id", "resident_id", "reference", "amount", "status", "payment_method", "cash_status", "logged_by_id", "paid_at", "created_at" FROM `transactions`;--> statement-breakpoint
DROP TABLE `transactions`;--> statement-breakpoint
ALTER TABLE `__new_transactions` RENAME TO `transactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference_unique` ON `transactions` (`reference`);
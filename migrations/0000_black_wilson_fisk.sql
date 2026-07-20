CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`meta` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `collection_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`route_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`logged_by_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`image_url` text,
	`logged_at` integer NOT NULL,
	`synced_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collection_logs_resident_idx` ON `collection_logs` (`resident_id`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`resident_id` text NOT NULL,
	`psp_id` text NOT NULL,
	`base_amount` real NOT NULL,
	`platform_fee` real NOT NULL,
	`total_amount` real NOT NULL,
	`due_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`billing_period_start` integer NOT NULL,
	`billing_period_end` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `invoices_resident_idx` ON `invoices` (`resident_id`);--> statement-breakpoint
CREATE TABLE `psps` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rc_number` text,
	`address` text NOT NULL,
	`contact_phone` text NOT NULL,
	`contact_email` text NOT NULL,
	`dva_bank_name` text,
	`dva_account_number` text,
	`dva_account_name` text,
	`dva_customer_code` text,
	`settlement_bank_code` text,
	`settlement_account_number` text,
	`settlement_account_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `psps_rc_number_unique` ON `psps` (`rc_number`);--> statement-breakpoint
CREATE TABLE `resident_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`ward` text NOT NULL,
	`lga` text NOT NULL,
	`state` text DEFAULT 'Lagos' NOT NULL,
	`billing_category` text NOT NULL,
	`reference_code` text NOT NULL,
	`custom_monthly_rate` real,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `resident_profiles_reference_code_unique` ON `resident_profiles` (`reference_code`);--> statement-breakpoint
CREATE TABLE `route_billing_rates` (
	`route_id` text NOT NULL,
	`billing_category` text NOT NULL,
	`monthly_rate` real NOT NULL,
	PRIMARY KEY(`route_id`, `billing_category`),
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `route_residents` (
	`route_id` text NOT NULL,
	`resident_id` text NOT NULL,
	`sequence_order` integer NOT NULL,
	PRIMARY KEY(`route_id`, `resident_id`),
	FOREIGN KEY (`route_id`) REFERENCES `routes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `routes` (
	`id` text PRIMARY KEY NOT NULL,
	`psp_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`assigned_agent_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `routes_psp_idx` ON `routes` (`psp_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `transactions` (
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
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`resident_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`logged_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_reference_unique` ON `transactions` (`reference`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`phone` text,
	`image` text,
	`role` text NOT NULL,
	`psp_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000),
	`updated_at` integer DEFAULT (unixepoch() * 1000)
);

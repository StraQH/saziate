PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_resident_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`address` text NOT NULL,
	`ward` text,
	`lga` text,
	`state` text,
	`billing_category` text NOT NULL,
	`property_type` text,
	`custom_monthly_rate` real,
	`advance_payment_balance` real DEFAULT 0 NOT NULL,
	`billing_model` text DEFAULT 'subscription' NOT NULL,
	`on_demand_unit1_rate` real DEFAULT 0 NOT NULL,
	`on_demand_unit2_rate` real DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_resident_profiles`("user_id", "address", "ward", "lga", "state", "billing_category", "property_type", "custom_monthly_rate", "advance_payment_balance", "billing_model", "on_demand_unit1_rate", "on_demand_unit2_rate") SELECT "user_id", "address", "ward", "lga", "state", "billing_category", "property_type", "custom_monthly_rate", "advance_payment_balance", "billing_model", "on_demand_unit1_rate", "on_demand_unit2_rate" FROM `resident_profiles`;--> statement-breakpoint
DROP TABLE `resident_profiles`;--> statement-breakpoint
ALTER TABLE `__new_resident_profiles` RENAME TO `resident_profiles`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_zones` (
	`id` text PRIMARY KEY NOT NULL,
	`org_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`service_schedule` text DEFAULT '' NOT NULL,
	`assigned_agent_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_agent_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_zones`("id", "org_id", "name", "description", "service_schedule", "assigned_agent_id", "created_at") SELECT "id", "org_id", "name", "description", "service_schedule", "assigned_agent_id", "created_at" FROM `zones`;--> statement-breakpoint
DROP TABLE `zones`;--> statement-breakpoint
ALTER TABLE `__new_zones` RENAME TO `zones`;--> statement-breakpoint
CREATE INDEX `zones_org_idx` ON `zones` (`org_id`);
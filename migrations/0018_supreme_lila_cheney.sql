ALTER TABLE `resident_profiles` RENAME COLUMN "on_demand_bin_rate" TO "on_demand_unit1_rate";--> statement-breakpoint
ALTER TABLE `resident_profiles` RENAME COLUMN "on_demand_drum_rate" TO "on_demand_unit2_rate";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`service_type` text DEFAULT 'general' NOT NULL,
	`rc_number` text,
	`address` text NOT NULL,
	`contact_phone` text NOT NULL,
	`contact_email` text NOT NULL,
	`dva_bank_name` text,
	`dva_account_number` text,
	`dva_account_name` text,
	`dva_account_reference` text,
	`dva_customer_code` text,
	`settlement_bank_code` text,
	`settlement_account_number` text,
	`settlement_account_name` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_organizations`("id", "name", "service_type", "rc_number", "address", "contact_phone", "contact_email", "dva_bank_name", "dva_account_number", "dva_account_name", "dva_account_reference", "dva_customer_code", "settlement_bank_code", "settlement_account_number", "settlement_account_name", "created_at", "updated_at") SELECT "id", "name", "service_type", "rc_number", "address", "contact_phone", "contact_email", "dva_bank_name", "dva_account_number", "dva_account_name", "dva_account_reference", "dva_customer_code", "settlement_bank_code", "settlement_account_number", "settlement_account_name", "created_at", "updated_at" FROM `organizations`;--> statement-breakpoint
DROP TABLE `organizations`;--> statement-breakpoint
ALTER TABLE `__new_organizations` RENAME TO `organizations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `organizations_rc_number_unique` ON `organizations` (`rc_number`);
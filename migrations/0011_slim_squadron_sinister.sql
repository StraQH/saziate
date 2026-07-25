ALTER TABLE `collection_logs` ADD `bins_collected` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `collection_logs` ADD `drums_collected` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD `billing_model` text DEFAULT 'subscription' NOT NULL;--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD `on_demand_trip_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD `on_demand_bin_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `resident_profiles` ADD `on_demand_drum_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `must_change_password` integer DEFAULT false NOT NULL;
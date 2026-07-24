PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`first_name` text,
	`last_name` text,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`phone` text,
	`image` text,
	`role` text DEFAULT 'resident' NOT NULL,
	`psp_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`psp_id`) REFERENCES `psps`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "name", "first_name", "last_name", "email", "email_verified", "phone", "image", "role", "psp_id", "created_at", "updated_at") SELECT "id", "name", "first_name", "last_name", "email", "email_verified", "phone", "image", "role", "psp_id", "created_at", "updated_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);
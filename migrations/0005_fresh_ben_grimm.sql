ALTER TABLE `invoices` ADD `payment_reference` text;--> statement-breakpoint
CREATE UNIQUE INDEX `invoices_payment_reference_unique` ON `invoices` (`payment_reference`);
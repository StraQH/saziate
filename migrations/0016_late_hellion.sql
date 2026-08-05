-- Rename Tables
ALTER TABLE "psps" RENAME TO "organizations";
ALTER TABLE "routes" RENAME TO "zones";
ALTER TABLE "route_billing_rates" RENAME TO "zone_billing_rates";
ALTER TABLE "route_residents" RENAME TO "zone_residents";
ALTER TABLE "collection_logs" RENAME TO "field_logs";

-- Rename Columns across all tables where psp_id -> org_id and route_id -> zone_id
ALTER TABLE "users" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "agent_invitations" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "zones" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "zone_billing_rates" RENAME COLUMN "route_id" TO "zone_id";
ALTER TABLE "zone_residents" RENAME COLUMN "route_id" TO "zone_id";
ALTER TABLE "field_logs" RENAME COLUMN "route_id" TO "zone_id";
ALTER TABLE "invoices" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "transactions" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "notification_logs" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "pending_notifications" RENAME COLUMN "psp_id" TO "org_id";
ALTER TABLE "complaints" RENAME COLUMN "psp_id" TO "org_id";

-- Add New Columns
ALTER TABLE "organizations" ADD COLUMN "service_type" text DEFAULT 'waste' NOT NULL;
ALTER TABLE "field_logs" ADD COLUMN "metrics" text;

-- Drop Old Columns (supported in modern SQLite / D1)
ALTER TABLE "field_logs" DROP COLUMN "bins_collected";
ALTER TABLE "field_logs" DROP COLUMN "drums_collected";

-- Recreate renamed indexes
DROP INDEX IF EXISTS "routes_psp_idx";
CREATE INDEX IF NOT EXISTS "zones_org_idx" ON "zones" ("org_id");

DROP INDEX IF EXISTS "collection_logs_resident_idx";
CREATE INDEX IF NOT EXISTS "field_logs_resident_idx" ON "field_logs" ("resident_id");
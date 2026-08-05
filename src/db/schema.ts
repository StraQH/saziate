import { sql } from "drizzle-orm";
import { text, integer, real, primaryKey, sqliteTable, index, unique } from "drizzle-orm/sqlite-core";

// ─── Better Auth Tables ────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  phone: text("phone").unique(),
  image: text("image"),
  role: text("role", { enum: ["admin", "org_admin", "field_agent", "resident"] }).notNull().default("resident"),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "set null" }),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const agentInvitations = sqliteTable("agent_invitations", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).default(sql`(unixepoch() * 1000)`),
});

export const rateLimits = sqliteTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: integer("window_start", { mode: "timestamp_ms" }).notNull(),
});

export const passwordResetTokens = sqliteTable("password_reset_tokens", {
  token: text("token").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Organizations (Utility Providers) ──────────────────────────────────────

export const organizations = sqliteTable("organizations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  serviceType: text("service_type").notNull().default("general"),
  rcNumber: text("rc_number").unique(),
  address: text("address").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email").notNull(),
  unit1Name: text("unit1_name").default("Primary Unit"),
  unit2Name: text("unit2_name").default("Secondary Unit"),

  // Settlement bank account for T+1 Automated Disbursements
  settlementBankCode: text("settlement_bank_code"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementAccountName: text("settlement_account_name"),

  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Zones & Pricing ───────────────────────────────────────────────────────

export const zones = sqliteTable("zones", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  serviceSchedule: text("service_schedule").notNull().default(""),
  assignedAgentId: text("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [index("zones_org_idx").on(t.orgId)]);

export const zoneBillingRates = sqliteTable("zone_billing_rates", {
  zoneId: text("zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  billingCategory: text("billing_category", {
    enum: ["commercial", "residential", "industrial", "health"],
  }).notNull(),
  monthlyRate: real("monthly_rate").notNull(), // Base rate in NGN
}, (t) => [primaryKey({ columns: [t.zoneId, t.billingCategory] })]);

// ─── Residents ─────────────────────────────────────────────────────────────

export const residentProfiles = sqliteTable("resident_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  ward: text("ward"),
  lga: text("lga"),
  state: text("state"),
  billingCategory: text("billing_category", {
    enum: ["commercial", "residential", "industrial", "health"],
  }).notNull(),
  propertyType: text("property_type"),
  // NULL = inherit from zone_billing_rates; set for custom override
  customMonthlyRate: real("custom_monthly_rate"),
  // Surplus payment balance to be applied to future invoices
  advancePaymentBalance: real("advance_payment_balance").notNull().default(0),
  billingModel: text("billing_model", { enum: ["subscription", "on_demand", "metered"] }).notNull().default("subscription"),
  onDemandUnit1Rate: real("on_demand_unit1_rate").notNull().default(0),
  onDemandUnit2Rate: real("on_demand_unit2_rate").notNull().default(0),
});

export const zoneResidents = sqliteTable("zone_residents", {
  zoneId: text("zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sequenceOrder: integer("sequence_order").notNull(),
}, (t) => [primaryKey({ columns: [t.zoneId, t.residentId] })]);

// ─── Field Logs ────────────────────────────────────────────────────────────

export const fieldLogs = sqliteTable("field_logs", {
  id: text("id").primaryKey(),
  zoneId: text("zone_id").notNull().references(() => zones.id, { onDelete: "cascade" }),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loggedById: text("logged_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["completed", "no_access", "no_service", "failed_other"],
  }).notNull(),
  notes: text("notes"),
  imageUrl: text("image_url"),
  metrics: text("metrics", { mode: "json" }), // e.g. { unit1: 2 } or { reading: 4500 }
  loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [index("field_logs_resident_idx").on(t.residentId)]);

// ─── Billing & Invoices ────────────────────────────────────────────────────

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  paymentReference: text("payment_reference").unique(), // Unique reference for bank transfer narration
  baseAmount: real("base_amount").notNull(),     // Rate in NGN
  platformFee: real("platform_fee").notNull(),   // Saziate 5%
  totalAmount: real("total_amount").notNull(),   // baseAmount + platformFee
  dueDate: integer("due_date", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["pending", "paid", "overdue", "cancelled"] }).notNull().default("pending"),
  billingPeriodStart: integer("billing_period_start", { mode: "timestamp_ms" }).notNull(),
  billingPeriodEnd: integer("billing_period_end", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [
  index("invoices_resident_idx").on(t.residentId),
  unique("invoices_resident_billing_period_start_unique").on(t.residentId, t.billingPeriodStart)
]);

// ─── Transactions ──────────────────────────────────────────────────────────

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").references(() => invoices.id, { onDelete: "cascade" }),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organizations.id, { onDelete: "cascade" }), // used for payouts
  reference: text("reference").notNull().unique(), // Monnify ref or "CASH-xxx"
  amount: real("amount").notNull(),
  status: text("status", { enum: ["initiated", "success", "failed"] }).notNull().default("initiated"),
  paymentMethod: text("payment_method", { enum: ["bank_transfer", "cash", "advance_balance", "advance_surplus"] }).notNull(),
  // Cash flow state machine: collected → pending_cash_verification → verified → settled
  cashStatus: text("cash_status", {
    enum: ["completed", "pending_cash_verification", "verified", "settled"],
  }),
  loggedById: text("logged_by_id").references(() => users.id, { onDelete: "set null" }), // field agent for cash
  paidAt: integer("paid_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Audit Log ─────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(), // e.g. "resident.created", "invoice.cancelled", "rate.updated"
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  meta: text("meta"),  // JSON stringified details
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Notification Logs (Termii Cost Recovery) ────────────────────────────────

export const notificationLogs = sqliteTable("notification_logs", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  residentId: text("resident_id").references(() => users.id, { onDelete: "set null" }),
  channel: text("channel", { enum: ["sms", "whatsapp", "email"] }).notNull(),
  messageType: text("message_type").notNull(), // "setup", "payment_receipt", "reminder", "overdue"
  costNgn: real("cost_ngn").notNull().default(0), // SMS cost vs WhatsApp cost
  termiiMessageId: text("termii_message_id"),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const pendingNotifications = sqliteTable("pending_notifications", {
  id: text("id").primaryKey(),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  residentId: text("resident_id").references(() => users.id, { onDelete: "cascade" }),
  channel: text("channel", { enum: ["sms", "whatsapp", "email"] }).notNull(),
  messageType: text("message_type").notNull(),
  recipientPhone: text("recipient_phone").notNull(),
  messageText: text("message_text").notNull(),
  attempts: integer("attempts").notNull().default(0),
  lastAttemptAt: integer("last_attempt_at", { mode: "timestamp_ms" }),
  error: text("error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Complaints ────────────────────────────────────────────────────────────

export const complaints = sqliteTable("complaints", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: text("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status", { enum: ["submitted", "investigating", "resolved", "rejected"] }).notNull().default("submitted"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

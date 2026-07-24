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
  role: text("role", { enum: ["admin", "psp_operator", "field_agent", "resident"] }).notNull().default("resident"),
  pspId: text("psp_id").references(() => psps.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

export const agentInvitations = sqliteTable("agent_invitations", {
  token: text("token").primaryKey(),
  email: text("email").notNull(),
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
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

// ─── PSP Operators ─────────────────────────────────────────────────────────

export const psps = sqliteTable("psps", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  rcNumber: text("rc_number").unique(),
  address: text("address").notNull(),
  contactPhone: text("contact_phone").notNull(),
  contactEmail: text("contact_email").notNull(),

  // Paystack DVA (single per PSP)
  dvaBankName: text("dva_bank_name"),
  dvaAccountNumber: text("dva_account_number"),
  dvaAccountName: text("dva_account_name"),
  dvaCustomerCode: text("dva_customer_code"),

  // Settlement bank account
  settlementBankCode: text("settlement_bank_code"),
  settlementAccountNumber: text("settlement_account_number"),
  settlementAccountName: text("settlement_account_name"),

  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

// ─── Routes & Pricing ──────────────────────────────────────────────────────

export const routes = sqliteTable("routes", {
  id: text("id").primaryKey(),
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  collectionSchedule: text("collection_schedule").notNull().default("Mondays & Thursdays"),
  assignedAgentId: text("assigned_agent_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [index("routes_psp_idx").on(t.pspId)]);

export const routeBillingRates = sqliteTable("route_billing_rates", {
  routeId: text("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
  billingCategory: text("billing_category", {
    enum: ["commercial", "residential", "industrial", "health"],
  }).notNull(),
  monthlyRate: real("monthly_rate").notNull(), // PSP base rate in NGN
}, (t) => [primaryKey({ columns: [t.routeId, t.billingCategory] })]);

// ─── Residents ─────────────────────────────────────────────────────────────

export const residentProfiles = sqliteTable("resident_profiles", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  address: text("address").notNull(),
  ward: text("ward").notNull(),
  lga: text("lga").notNull(),
  state: text("state").notNull().default("Lagos"),
  billingCategory: text("billing_category", {
    enum: ["commercial", "residential", "industrial", "health"],
  }).notNull(),
  // NULL = inherit from route_billing_rates; set for custom override
  customMonthlyRate: real("custom_monthly_rate"),
  // Surplus payment balance to be applied to future invoices
  advancePaymentBalance: real("advance_payment_balance").notNull().default(0),
});

export const routeResidents = sqliteTable("route_residents", {
  routeId: text("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  sequenceOrder: integer("sequence_order").notNull(),
}, (t) => [primaryKey({ columns: [t.routeId, t.residentId] })]);

// ─── Collection Logs ───────────────────────────────────────────────────────

export const collectionLogs = sqliteTable("collection_logs", {
  id: text("id").primaryKey(),
  routeId: text("route_id").notNull().references(() => routes.id, { onDelete: "cascade" }),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loggedById: text("logged_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status", {
    enum: ["collected", "no_access", "no_waste", "failed_other"],
  }).notNull(),
  notes: text("notes"),
  imageUrl: text("image_url"),
  loggedAt: integer("logged_at", { mode: "timestamp_ms" }).notNull(),
  syncedAt: integer("synced_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
}, (t) => [index("collection_logs_resident_idx").on(t.residentId)]);

// ─── Billing & Invoices ────────────────────────────────────────────────────

export const invoices = sqliteTable("invoices", {
  id: text("id").primaryKey(),
  residentId: text("resident_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
  paymentReference: text("payment_reference").unique(), // Unique reference for bank transfer narration
  baseAmount: real("base_amount").notNull(),     // PSP rate in NGN
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
  reference: text("reference").notNull().unique(), // Paystack ref or "CASH-xxx"
  amount: real("amount").notNull(),
  status: text("status", { enum: ["initiated", "success", "failed"] }).notNull().default("initiated"),
  paymentMethod: text("payment_method", { enum: ["bank_transfer", "cash"] }).notNull(),
  // Cash flow state machine: collected → pending_cash_verification → verified → settled
  cashStatus: text("cash_status", {
    enum: ["collected", "pending_cash_verification", "verified", "settled"],
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
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
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
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
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
  pspId: text("psp_id").notNull().references(() => psps.id, { onDelete: "cascade" }),
  description: text("description").notNull(),
  status: text("status", { enum: ["submitted", "investigating", "resolved", "rejected"] }).notNull().default("submitted"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
});

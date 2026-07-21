import { z } from "zod";

// Auth
export const loginSchema = z.object({
  email: z.string().email(),
});

export const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["admin", "psp_operator", "field_agent"]),
  password: z.string().min(8).optional(),
  pspName: z.string().optional(),
  rcNumber: z.string().optional(),
  address: z.string().optional(),
});

export const onboardSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["psp_operator", "field_agent"]),
  phone: z.string().optional(),
  pspName: z.string().optional(),
  rcNumber: z.string().optional(),
  address: z.string().optional(),
  inviteToken: z.string().optional(),
});

// Residents
export const createResidentSchema = z.object({
  firstName: z.string().min(2).max(50),
  lastName: z.string().min(2).max(50),
  email: z.string().email("A valid email is required").optional().or(z.literal("")),
  phone: z.string().min(10).max(15),
  address: z.string().min(5),
  route: z.string().min(1, "Route selection is required"),
  billingCategory: z.enum(["commercial", "residential", "industrial", "health"]),
  baseRate: z.string().or(z.number()),
  isOverride: z.boolean().optional(),
});

export const importResidentsSchema = z.object({
  residents: z.array(z.object({
    firstName: z.string().min(2),
    lastName: z.string().min(2),
    email: z.string().email("A valid email is required"),
    phone: z.string(),
    address: z.string(),
    billingCategory: z.enum(["commercial", "residential", "industrial", "health"]).optional(),
    baseRate: z.number().optional(),
    route: z.string().min(1, "Route selection is required"),
  })).min(1),
});

// Collections
export const collectionLogSchema = z.object({
  routeId: z.string().min(1),
  residentId: z.string().min(1),
  status: z.enum(["collected", "no_access", "no_waste", "failed_other"]),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional(),
  loggedAt: z.string().or(z.number()).optional(),
});

export const collectionVerifySchema = z.object({
  transactionId: z.string().min(1),
  status: z.enum(["collected", "pending_cash_verification", "verified", "settled"]),
});

// Payments
export const logCashSchema = z.object({
  invoiceId: z.string().min(1),
  residentId: z.string().min(1),
  amount: z.number().positive().or(z.string()),
});

// Billing
export const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
});

export const reconcileInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
  paymentReference: z.string().min(1),
});

export const generateBillingSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12),
});

// PSP Settings
export const pspSettingsSchema = z.object({
  settlementBankCode: z.string().optional(),
  settlementAccountNumber: z.string().optional(),
  settlementAccountName: z.string().optional(),
});

// Admin
export const registerPspSchema = z.object({
  name: z.string().min(2),
  rcNumber: z.string().optional(),
  address: z.string().min(5),
  contactPhone: z.string().min(10),
  contactEmail: z.string().email(),
});

export const approvePspSchema = z.object({
  pspId: z.string().min(1),
});

// Resident Profile
export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  newPassword: z.string().min(8).optional(),
});

// Routes
export const createRouteSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  collectionSchedule: z.string().min(2).optional(),
  agentId: z.string().optional(),
  rates: z.array(z.object({
    category: z.enum(["commercial", "residential", "industrial", "health"]),
    monthlyRate: z.number().positive(),
  })).optional(),
});

// Complaints
export const createComplaintSchema = z.object({
  description: z.string().min(5),
});

export const updateComplaintSchema = z.object({
  complaintId: z.string().min(1),
  status: z.enum(["submitted", "investigating", "resolved", "rejected"]),
});

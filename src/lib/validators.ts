import { z } from "zod";

// Auth
export const loginSchema = z.object({
  email: z.string().email(),
});

export const signupSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().optional(),
  role: z.enum(["admin", "org_admin", "field_agent"]),
  password: z.string().min(8).optional(),
  orgName: z.string().optional(),
  rcNumber: z.string().optional(),
  address: z.string().optional(),
});

export const onboardSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(["org_admin", "field_agent"]),
  phone: z.string().optional(),
  orgName: z.string().optional(),
  rcNumber: z.string().optional(),
  address: z.string().optional(),
  inviteToken: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
});

// Residents
export const createResidentSchema = z.object({
  firstName: z.string().optional().or(z.literal("")),
  lastName: z.string().optional().or(z.literal("")),
  email: z.string().email("A valid email is required").optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  zone: z.string().min(1, "Zone selection is required"),
  billingCategory: z.enum(["commercial", "residential", "industrial", "health"]),
  propertyType: z.string().optional(),
  baseRate: z.string().or(z.number()),
  isOverride: z.boolean().optional(),
  billingModel: z.enum(["subscription", "on_demand"]).optional(),
  onDemandUnit1Rate: z.number().optional(),
  onDemandUnit2Rate: z.number().optional(),
}).refine(data => data.email || data.phone, { message: "Either email or phone number is required", path: ["phone"] });

export const importResidentsSchema = z.object({
  residents: z.array(z.object({
    name: z.string().optional().or(z.literal("")),
    email: z.string().email("A valid email is required").optional().or(z.literal("")),
    phone: z.string().optional().or(z.literal("")),
    address: z.string().optional().or(z.literal("")),
    billingCategory: z.enum(["commercial", "residential", "industrial", "health"]).optional(),
    propertyType: z.string().optional(),
    baseRate: z.number().optional(),
    zone: z.string().min(1, "Zone selection is required"),
  })).min(1),
});

// Services
export const serviceLogSchema = z.object({
  zoneId: z.string().min(1),
  residentId: z.string().min(1),
  status: z.enum(["completed", "no_access", "no_service", "failed_other"]),
  notes: z.string().optional(),
  imageUrl: z.string().url().optional(),
  loggedAt: z.string().or(z.number()).optional(),
  metrics: z.any().optional(),
});

export const serviceVerifySchema = z.object({
  transactionId: z.string().min(1),
  status: z.enum(["completed", "pending_cash_verification", "verified", "settled"]),
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

// Org Settings
export const organizationsettingsSchema = z.object({
  settlementBankCode: z.string().optional(),
  settlementAccountNumber: z.string().optional(),
  settlementAccountName: z.string().optional(),
  bvn: z.string().optional(),
  password: z.string().min(1, "Password is required for security verification"),
  unit1Name: z.string().optional(),
  unit2Name: z.string().optional(),
});

// Admin
export const registerorganizationschema = z.object({
  name: z.string().min(2),
  rcNumber: z.string().optional(),
  address: z.string().min(5),
  contactPhone: z.string().min(10),
  contactEmail: z.string().email(),
});

export const approveorganizationschema = z.object({
  orgId: z.string().min(1),
});

// Resident Profile
export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
  newPassword: z.string().min(8).optional(),
});

// Zones
export const createZoneSchema = z.object({
  name: z.string().min(2),
  description: z.string().optional(),
  serviceSchedule: z.string().min(2).optional(),
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

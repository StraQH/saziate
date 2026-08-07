import { config } from "@/lib/config";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format currency based on locality */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat(config.locality.locale, {
    style: "currency",
    currency: config.locality.currency,
    minimumFractionDigits: 2,
  }).format(amount);
}


/** Calculate resident-facing bill from Org base rate (adds Saziate 10% fee) */
export function calculateResidentBill(baseRate: number): {
  baseAmount: number;
  platformFee: number;
  totalAmount: number;
} {
  const platformFee = Math.round(baseRate * config.PLATFORM_FEE_RATE * 100) / 100;
  const totalAmount = Math.round((baseRate + platformFee) * 100) / 100;
  return { baseAmount: baseRate, platformFee, totalAmount };
}

/** Generate a secure alphanumeric reference code with an un-hyphenated prefix (e.g. SZ98A2F14B) */
export function generateSecureReference(length: number = 8, prefix: string = "SZ"): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  const code = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
  return `${prefix}${code}`;
}

/** Generate a secure random password */
export function generateSecurePassword(length: number = 10): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";
  return Array.from(array, byte => charset[byte % charset.length]).join('');
}

/** Generate a unique ID (used for D1 text PKs) */
export function generateId(): string {
  return crypto.randomUUID();
}

/**
 * Normalizes a phone number to international format using the active locality code.
 * - Removes non-digit characters except the leading +
 * - Converts local 0-prefixed numbers with 11 digits to international format
 * - Passes through valid numbers that don't match standard prefixes
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  
  // Strip all non-digit characters except leading +
  let cleaned = phone.trim().replace(/(?!^\+)[^\d]/g, "");

  // If it starts with 0 and has 11 digits, assume local format — prepend country code
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = config.locality.code + cleaned.substring(1);
  }
  // If it starts with 234 and has 13 digits (missing the +)
  else if (cleaned.startsWith("234") && cleaned.length === 13) {
    cleaned = "+" + cleaned;
  }
  // If no +, but isn't starting with 234, just pass it through or prepend +
  // We leave it as is if it's already properly formatted or doesn't match standard
  
  return cleaned;
}

export function getServiceUnits(serviceType: string = "general") {
  switch (serviceType) {
    case "waste":
      return { unit1: "Bin", unit1Plural: "Bins", unit2: "Drum", unit2Plural: "Drums" };
    case "water":
      return { unit1: "Tank", unit1Plural: "Tanks", unit2: "Liter", unit2Plural: "Liters" };
    case "power":
      return { unit1: "Meter", unit1Plural: "Meters", unit2: "Unit", unit2Plural: "Units" };
    case "estate_dues":
      return { unit1: "Unit", unit1Plural: "Units", unit2: "Room", unit2Plural: "Rooms" };
    default:
      return { unit1: "Unit 1", unit1Plural: "Unit 1s", unit2: "Unit 2", unit2Plural: "Unit 2s" };
  }
}

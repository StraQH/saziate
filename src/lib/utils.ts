import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes safely */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format NGN currency */
export function formatNaira(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 2,
  }).format(amount);
}

/** Calculate resident-facing bill from PSP base rate (adds Saziate 5% fee) */
export function calculateResidentBill(baseRate: number): {
  baseAmount: number;
  platformFee: number;
  totalAmount: number;
} {
  const platformFee = parseFloat((baseRate * 0.05).toFixed(2));
  const totalAmount = parseFloat((baseRate + platformFee).toFixed(2));
  return { baseAmount: baseRate, platformFee, totalAmount };
}

/** Generate a secure alphanumeric reference code */
export function generateSecureReference(length: number = 8): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length).toUpperCase();
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
 * Normalizes a Nigerian phone number to international format (+234...).
 * - Removes non-digit characters except the leading +
 * - Converts 080..., 070..., 090..., 081..., 091... to +234...
 * - Keeps existing +234...
 * - Passes through valid numbers that don't match standard prefixes
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return phone;
  
  // Strip all non-digit characters except leading +
  let cleaned = phone.trim().replace(/(?!^\+)[^\d]/g, "");

  // If it starts with 0 and has 11 digits, assume Nigerian local format
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = "+234" + cleaned.substring(1);
  }
  // If it starts with 234 and has 13 digits (missing the +)
  else if (cleaned.startsWith("234") && cleaned.length === 13) {
    cleaned = "+" + cleaned;
  }
  // If no +, but isn't starting with 234, just pass it through or prepend +
  // We leave it as is if it's already properly formatted or doesn't match standard
  
  return cleaned;
}

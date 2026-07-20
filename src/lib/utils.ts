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

/** Generate a Saziate resident reference code, e.g. "SZ-LEK-102" */
export function generateResidentReference(pspSlug: string, sequence: number): string {
  const slug = pspSlug.toUpperCase().slice(0, 3);
  return `SZ-${slug}-${sequence}`;
}

/** Generate a unique ID (used for D1 text PKs) */
export function generateId(): string {
  return crypto.randomUUID();
}

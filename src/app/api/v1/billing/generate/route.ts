export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, residentProfiles, users, zoneResidents, zoneBillingRates, transactions } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getActiveorgId } from "@/lib/session";
import { generateId, generateSecureReference } from "@/lib/utils";
import { z } from "zod";
import { config } from "@/lib/config";

const generateBillingSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    
    const rawBody = await req.json() as any;
    const parsed = generateBillingSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { year, month } = parsed.data;

    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1; // 1-indexed

    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      return new Response("Cannot generate invoices for future billing periods.", { status: 400 });
    }

    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Force UTC boundaries
    const billingPeriodStart = Date.UTC(year, month - 1, 1);
    const billingPeriodEnd = Date.UTC(year, month, 0, 23, 59, 59, 999);
    // Standardized to the 7th of billing month in UTC to avoid date overflow bugs
    const dueDate = new Date(Date.UTC(year, month - 1, 7, 23, 59, 59, 999));

    let offset = 0;
    const BATCH_SIZE = 500;
    let hasMore = true;

    let generatedCount = 0;

    while (hasMore) {
      // Retrieve active resident profiles with their corresponding base rates
      const profiles = await db
        .select({
          userId: residentProfiles.userId,
          customMonthlyRate: residentProfiles.customMonthlyRate,
          billingCategory: residentProfiles.billingCategory,
          advancePaymentBalance: residentProfiles.advancePaymentBalance,
          orgId: users.orgId,
          zoneMonthlyRate: zoneBillingRates.monthlyRate,
        })
        .from(residentProfiles)
        .innerJoin(users, eq(residentProfiles.userId, users.id))
        .leftJoin(zoneResidents, eq(residentProfiles.userId, zoneResidents.residentId))
        .leftJoin(zoneBillingRates, and(
          eq(zoneResidents.zoneId, zoneBillingRates.zoneId),
          eq(residentProfiles.billingCategory, zoneBillingRates.billingCategory)
        ))
        .where(
          and(
            eq(users.orgId, orgId),
            eq(users.isActive, true),
            eq(residentProfiles.billingModel, "subscription")
          )
        )
        .limit(BATCH_SIZE)
        .offset(offset)
        .all();

      if (profiles.length === 0) {
        hasMore = false;
        break;
      }

      // Extract IDs to check existing invoices for just this batch
      const batchResidentIds = profiles.map(p => p.userId);
      const existingInvoices = await db
        .select({ residentId: invoices.residentId })
        .from(invoices)
        .where(
          and(
            eq(invoices.orgId, orgId),
            eq(invoices.billingPeriodStart, new Date(billingPeriodStart)),
            inArray(invoices.residentId, batchResidentIds)
          )
        )
        .all();
      
      const billedResidentIds = new Set(existingInvoices.map((inv) => (inv as any).residentId));

      const newInvoices: any[] = [];
      const newTransactions: any[] = [];
      const profileUpdates: { userId: string; advancePaymentBalance: number }[] = [];

      for (const profile of profiles) {
        // Prevent double billing
        if (billedResidentIds.has(profile.userId)) {
          continue;
        }

        // Base rate fallback or override check
        const baseRate = profile.customMonthlyRate || profile.zoneMonthlyRate || config.locality.rates.general.residential;
        const platformFee = Math.round((baseRate * config.PLATFORM_FEE_RATE) * 100) / 100;
        const totalAmount = Math.round((baseRate + platformFee) * 100) / 100;

        const advanceBalance = Math.round((profile.advancePaymentBalance || 0) * 100) / 100;
        let finalAmount = totalAmount;
        let invoiceStatus = "pending";
        let isFullySettled = false;
        let isPartiallySettled = false;
        let amountSettledFromAdvance = 0;

        if (advanceBalance >= totalAmount) {
          // Full Settlement
          finalAmount = 0;
          invoiceStatus = "paid";
          isFullySettled = true;
          amountSettledFromAdvance = totalAmount;
          profileUpdates.push({ userId: profile.userId, advancePaymentBalance: Math.round((advanceBalance - totalAmount) * 100) / 100 });
        } else if (advanceBalance > 0) {
          // Partial Settlement
          finalAmount = Math.round((totalAmount - advanceBalance) * 100) / 100;
          invoiceStatus = "pending";
          isPartiallySettled = true;
          amountSettledFromAdvance = advanceBalance;
          profileUpdates.push({ userId: profile.userId, advancePaymentBalance: 0 });
        }

        const invoiceId = generateId();
        const paymentReference = generateSecureReference(10);
        
        newInvoices.push({
          id: invoiceId,
          residentId: profile.userId,
          orgId: profile.orgId!,
          paymentReference,
          baseAmount: baseRate,
          platformFee,
          totalAmount: finalAmount,
          dueDate: dueDate,
          status: invoiceStatus,
          billingPeriodStart: new Date(billingPeriodStart),
          billingPeriodEnd: new Date(billingPeriodEnd),
        });

        if (isFullySettled || isPartiallySettled) {
          newTransactions.push({
            id: generateId(),
            invoiceId,
            residentId: profile.userId,
            reference: `ADV-SETTLE-${Date.now()}-${generateId().slice(0,4)}`,
            amount: amountSettledFromAdvance,
            paymentMethod: "advance_balance",
            cashStatus: "settled" as any,
            status: "success" as any,
            paidAt: new Date(),
          });
        }
        
        generatedCount++;
      }

      // Perform batch inserts in transaction
      if (newInvoices.length > 0) {
        await db.transaction(async (tx) => {
          for (const inv of newInvoices) {
            await tx.insert(invoices).values(inv);
          }
          for (const tr of newTransactions) {
            await tx.insert(transactions).values(tr);
          }
          for (const update of profileUpdates) {
            await tx
              .update(residentProfiles)
              .set({ advancePaymentBalance: update.advancePaymentBalance })
              .where(eq(residentProfiles.userId, update.userId));
          }
        });
      }

      offset += BATCH_SIZE;
    }

    return new Response(JSON.stringify({ status: "success", generated: generatedCount }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Billing Generation API Error:", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, residentProfiles, users, routeResidents, routeBillingRates, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivePspId } from "@/lib/session";
import { generateId, generateSecureReference } from "@/lib/utils";
import { z } from "zod";

export const runtime = "edge";

const generateBillingSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    
    const rawBody = await req.json();
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

    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Retrieve all active resident profiles with their corresponding base rates
    const profiles = await db
      .select({
        userId: residentProfiles.userId,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        billingCategory: residentProfiles.billingCategory,
        advancePaymentBalance: residentProfiles.advancePaymentBalance,
        pspId: users.pspId,
        routeMonthlyRate: routeBillingRates.monthlyRate,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .leftJoin(routeResidents, eq(residentProfiles.userId, routeResidents.residentId))
      .leftJoin(routeBillingRates, and(
        eq(routeResidents.routeId, routeBillingRates.routeId),
        eq(residentProfiles.billingCategory, routeBillingRates.billingCategory)
      ))
      .where(eq(users.pspId, pspId));

    // Force UTC boundaries
    const billingPeriodStart = Date.UTC(year, month - 1, 1);
    const billingPeriodEnd = Date.UTC(year, month, 0, 23, 59, 59, 999);

    // Fetch existing invoices for this month to prevent duplication
    const existingInvoices = await db
      .select({ residentId: invoices.residentId })
      .from(invoices)
      .where(and(
        eq(invoices.pspId, pspId),
        eq(invoices.billingPeriodStart, new Date(billingPeriodStart))
      ));
    
    const billedResidentIds = new Set(existingInvoices.map((inv: { residentId: string }) => inv.residentId));

    const newInvoices: any[] = [];
    const newTransactions: any[] = [];
    const profileUpdates: { userId: string; advancePaymentBalance: number }[] = [];

    for (const profile of profiles) {
      // Prevent double billing
      if (billedResidentIds.has(profile.userId)) {
        continue;
      }
      // Base rate fallback or override check
      const baseRate = profile.customMonthlyRate || profile.routeMonthlyRate || 6000;
      const platformFee = Math.round((baseRate * 0.05) * 100) / 100;
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
      
      // Standardized to the 7th of billing month in UTC to avoid date overflow bugs
      const dueDate = new Date(Date.UTC(year, month - 1, 7, 23, 59, 59, 999));

      newInvoices.push({
        id: invoiceId,
        residentId: profile.userId,
        pspId: profile.pspId!,
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
          cashStatus: "settled",
          status: "success",
          paidAt: new Date(),
        });
      }
    }

    // Optimization: Group mutations into atomic batch statement to eliminate sequential execution timeout bugs
    const batchOps: any[] = [];

    // Push Invoices
    for (const inv of newInvoices) {
      batchOps.push(db.insert(invoices).values(inv));
    }

    // Push Transactions
    for (const tx of newTransactions) {
      batchOps.push(db.insert(transactions).values(tx));
    }

    // Push Profile updates
    for (const update of profileUpdates) {
      batchOps.push(
        db.update(residentProfiles)
          .set({ advancePaymentBalance: update.advancePaymentBalance })
          .where(eq(residentProfiles.userId, update.userId))
      );
    }

    // Chunk batched execution into blocks of 90 statements to abide by D1 max request size limit (100)
    if (batchOps.length > 0) {
      const CHUNK_SIZE = 90;
      for (let i = 0; i < batchOps.length; i += CHUNK_SIZE) {
        const chunk = batchOps.slice(i, i + CHUNK_SIZE);
        await db.batch(chunk as any);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        invoicesCreatedCount: newInvoices.length,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Generate Billing Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { requireRole } from "@/lib/session";
import { generateBillingSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { invoices, residentProfiles, users, routeResidents, routeBillingRates, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivePspId } from "@/lib/session";
import { generateId, generateSecureReference } from "@/lib/utils";

export const runtime = "edge";

/**
 * Trigger batch invoice generation for a specific month.
 * Computes base rate + Saziate 5% markup, and records into the D1 DB.
 */
export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const { year, month } = await req.json() as { year: number; month: number };
    if (!year || !month) {
      return new Response("Missing year or month parameters.", { status: 400 });
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-indexed

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

    const billingPeriodStart = new Date(year, month - 1, 1).getTime();
    const billingPeriodEnd = new Date(year, month, 0).getTime();

    // Fetch existing invoices for this month to prevent duplication
    const existingInvoices = await db
      .select({ residentId: invoices.residentId })
      .from(invoices)
      .where(and(
        eq(invoices.pspId, pspId),
        eq(invoices.billingPeriodStart, new Date(billingPeriodStart))
      ));
    
    const billedResidentIds = new Set(existingInvoices.map((inv: { residentId: string }) => inv.residentId));

    const generatedInvoices = [];

    for (const profile of profiles) {
      // Prevent double billing
      if (billedResidentIds.has(profile.userId)) {
        continue;
      }
      // Base rate fallback or override check
      const baseRate = profile.customMonthlyRate || profile.routeMonthlyRate || 6000;
      const platformFee = parseFloat((baseRate * 0.05).toFixed(2));
      const totalAmount = parseFloat((baseRate + platformFee).toFixed(2));

      const advanceBalance = profile.advancePaymentBalance || 0;
      let finalAmount = totalAmount;
      let invoiceStatus = "pending";
      let isFullySettled = false;
      let isPartiallySettled = false;
      let amountSettledFromAdvance = 0;

      if (advanceBalance >= totalAmount) {
        // Full Settlement
        finalAmount = totalAmount;
        invoiceStatus = "paid";
        isFullySettled = true;
        amountSettledFromAdvance = totalAmount;
        
        await db.update(residentProfiles)
          .set({ advancePaymentBalance: advanceBalance - totalAmount })
          .where(eq(residentProfiles.userId, profile.userId));
      } else if (advanceBalance > 0) {
        // Partial Settlement
        finalAmount = totalAmount - advanceBalance;
        invoiceStatus = "pending";
        isPartiallySettled = true;
        amountSettledFromAdvance = advanceBalance;

        await db.update(residentProfiles)
          .set({ advancePaymentBalance: 0 })
          .where(eq(residentProfiles.userId, profile.userId));
      }

      const invoiceId = generateId();
      const paymentReference = generateSecureReference(10);
      
      const dueDate = new Date();
      dueDate.setFullYear(year);
      dueDate.setMonth(month - 1); // Current billing month
      dueDate.setDate(7); // Standardized to the 7th

      await db.insert(invoices).values({
        id: invoiceId,
        residentId: profile.userId,
        pspId: profile.pspId!,
        paymentReference,
        baseAmount: baseRate,
        platformFee,
        totalAmount: finalAmount,
        dueDate: new Date(dueDate),
        status: invoiceStatus,
        billingPeriodStart: new Date(billingPeriodStart),
        billingPeriodEnd: new Date(billingPeriodEnd),
      });

      if (isFullySettled || isPartiallySettled) {
        await db.insert(transactions).values({
          id: generateId(),
          invoiceId,
          residentId: profile.userId,
          reference: `ADV-SETTLE-${Date.now()}-${generateId().slice(0,4)}`,
          amount: amountSettledFromAdvance,
          paymentMethod: "advance_balance",
          cashStatus: "settled",
        });
      }

      generatedInvoices.push(invoiceId);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        invoicesCreatedCount: generatedInvoices.length,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, invoices, transactions, pendingNotifications, organizations, zoneResidents, zoneBillingRates } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId, generateSecureReference, calculateResidentBill } from "@/lib/utils";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  
  // Basic security: require a CRON_SECRET token
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB as any);
  
  try {
    // 1. Fetch all active residents and their zone billing rates
    const activeResidents = await db
      .select({
        userId: users.id,
        name: users.name,
        firstName: users.firstName,
        email: users.email,
        phone: users.phone,
        orgId: users.orgId,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        billingCategory: residentProfiles.billingCategory,
        advancePaymentBalance: residentProfiles.advancePaymentBalance,
        zoneRate: zoneBillingRates.monthlyRate,
      })
      .from(users)
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .leftJoin(organizations, eq(users.orgId, organizations.id))
      .leftJoin(zoneResidents, eq(users.id, zoneResidents.residentId))
      .leftJoin(
        zoneBillingRates,
        and(
          eq(zoneResidents.zoneId, zoneBillingRates.zoneId),
          eq(residentProfiles.billingCategory, zoneBillingRates.billingCategory)
        )
      )
      .where(
        and(
          eq(users.role, "resident"),
          eq(residentProfiles.billingModel, "subscription")
        )
      )
      .all();

    if (activeResidents.length === 0) {
      return new Response(JSON.stringify({ status: "success" as any, message: "No active residents found." }), { status: 200 });
    }

    // Force strict UTC timezone boundaries
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed

    const currentMonthStart = new Date(Date.UTC(year, month, 1));
    const currentMonthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const dueDate = new Date(Date.UTC(year, month, 7, 23, 59, 59, 999));
    
    // Fetch existing invoices for this month to prevent duplication
    const existingInvoices = await db
      .select({ residentId: invoices.residentId })
      .from(invoices)
      .where(eq(invoices.billingPeriodStart, currentMonthStart))
      .all();
    
    const billedResidentIds = new Set(existingInvoices.map((inv: { residentId: string }) => (inv as any).residentId));

    let generatedCount = 0;
    let emailCount = 0;

    const newInvoices: any[] = [];
    const newTransactions: any[] = [];
    const pendingNotificationsQueue: any[] = [];
    const profileUpdates: { userId: string; advancePaymentBalance: number }[] = [];

    // 2. Prepare Invoices & Transactions in memory
    for (const resident of activeResidents) {
      if (!resident.orgId) continue;
      
      // Prevent double billing
      if (billedResidentIds.has(resident.userId)) {
        continue;
      }
      
      // Priority: custom rate > assigned zone category rate > global fallback
      const baseRate = resident.customMonthlyRate || resident.zoneRate || config.locality.rates.general.residential;
      const { baseAmount, platformFee, totalAmount } = calculateResidentBill(baseRate);

      const invoiceId = generateId();
      const paymentReference = generateSecureReference(10);
      
      const advanceBalance = Math.round((resident.advancePaymentBalance || 0) * 100) / 100;
      let finalAmount = totalAmount;
      let invoiceStatus = "pending";
      let isFullySettled = false;
      let isPartiallySettled = false;
      let amountSettledFromAdvance = 0;

      if (advanceBalance > 0) {
        if (advanceBalance >= totalAmount) {
          finalAmount = 0;
          invoiceStatus = "paid";
          isFullySettled = true;
          amountSettledFromAdvance = totalAmount;
          profileUpdates.push({
            userId: resident.userId,
            advancePaymentBalance: Math.round((advanceBalance - totalAmount) * 100) / 100,
          });
        } else {
          finalAmount = Math.round((totalAmount - advanceBalance)*100)/100;
          invoiceStatus = "pending";
          isPartiallySettled = true;
          amountSettledFromAdvance = advanceBalance;
          profileUpdates.push({
            userId: resident.userId,
            advancePaymentBalance: 0,
          });
        }
      }

      newInvoices.push({
        id: invoiceId,
        residentId: resident.userId,
        orgId: resident.orgId,
        billingPeriodStart: currentMonthStart,
        billingPeriodEnd: currentMonthEnd,
        baseAmount,
        platformFee,
        totalAmount: finalAmount,
        dueDate,
        status: invoiceStatus,
        paymentReference,
      });

      if (isFullySettled || isPartiallySettled) {
        newTransactions.push({
          id: generateId(),
          residentId: resident.userId,
          orgId: resident.orgId,
          invoiceId,
          amount: amountSettledFromAdvance,
          paymentMethod: "advance_balance",
          paymentReference: `ADV-${paymentReference}`,
          status: "settled",
        });
      }

      // Queue email notification if resident has email
      if (resident.email) {
        pendingNotificationsQueue.push({
          id: generateId(),
          orgId: resident.orgId,
          userId: resident.userId,
          channel: "email",
          recipient: resident.email,
          subject: `Monthly Service Invoice - ${currentMonthStart.toLocaleString("default", { month: "long", year: "numeric" })}`,
          body: emailTemplates.monthlyBill(
            resident.name || "Valued Customer",
            paymentReference,
            finalAmount,
            dueDate.toLocaleDateString()
          ),
          status: "pending",
        });
        emailCount++;
      }

      generatedCount++;
    }

    // 3. Perform batch inserts in transaction
    if (newInvoices.length > 0) {
      await db.transaction(async (tx) => {
        for (const inv of newInvoices) {
          await tx.insert(invoices).values(inv);
        }
        for (const tr of newTransactions) {
          await tx.insert(transactions).values(tr);
        }
        for (const notif of pendingNotificationsQueue) {
          await tx.insert(pendingNotifications).values(notif);
        }
        for (const update of profileUpdates) {
          await tx
            .update(residentProfiles)
            .set({ advancePaymentBalance: update.advancePaymentBalance })
            .where(eq(residentProfiles.userId, update.userId));
        }
      });
    }

    return new Response(
      JSON.stringify({
        status: "success",
        generatedInvoices: generatedCount,
        queuedEmails: emailCount,
        billingPeriod: `${currentMonthStart.toISOString()} - ${currentMonthEnd.toISOString()}`,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Monthly Invoice Generation Cron Failed:", error);
    return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500 });
  }
}

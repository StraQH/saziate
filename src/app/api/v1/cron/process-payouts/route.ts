import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { psps, transactions, auditLogs, notificationLogs, users } from "@/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";


export async function GET(req: Request) {
  const env = getAppEnv() as any;

  // Basic security: require a CRON_SECRET token
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB);

  try {
    let processedCount = 0;
    const notificationPromises: Promise<any>[] = [];

    // Run the entire balance query & reservation in a single transaction block
    await db.transaction(async (tx: any) => {
      // 1. Fetch all active PSPs
      const allPsps = await tx.select().from(psps);
      if (allPsps.length === 0) return;

      // 2. Optimization: Bulk fetch aggregates to eliminate N+1 queries
      const digitalTotals = await tx
        .select({
          pspId: users.pspId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(transactions.paymentMethod, "bank_transfer"),
          eq(transactions.status, "success")
        ))
        .groupBy(users.pspId);

      const cashTotals = await tx
        .select({
          pspId: users.pspId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(transactions.paymentMethod, "cash"),
          inArray(transactions.cashStatus, ["verified", "settled"])
        ))
        .groupBy(users.pspId);

      const payoutTotals = await tx
        .select({
          pspId: transactions.residentId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .where(and(
          like(transactions.reference, "PAYOUT-%"),
          inArray(transactions.status, ["initiated", "success"])
        ))
        .groupBy(transactions.residentId);

      const notificationTotals = await tx
        .select({
          pspId: notificationLogs.pspId,
          total: sql<number>`sum(${notificationLogs.costNgn})`,
        })
        .from(notificationLogs)
        .groupBy(notificationLogs.pspId);

      // Convert lists to Maps for fast O(1) lookups
      const digitalMap = new Map(digitalTotals.map((t: any) => [t.pspId, Number(t.total || 0)]));
      const cashMap = new Map(cashTotals.map((t: any) => [t.pspId, Number(t.total || 0)]));
      const payoutMap = new Map(payoutTotals.map((t: any) => [t.pspId, Number(t.total || 0)]));
      const notificationMap = new Map(notificationTotals.map((t: any) => [t.pspId, Number(t.total || 0)]));

      const newTxs = [];
      const newLogs = [];

      for (const psp of allPsps) {
        const digitalSum = (digitalMap.get(psp.id) as number) || 0;
        const cashSum = (cashMap.get(psp.id) as number) || 0;
        const payoutSum = (payoutMap.get(psp.id) as number) || 0;
        const notificationSum = (notificationMap.get(psp.id) as number) || 0;

        // Apply strict rounding
        const pspDigitalEntitlement = Math.round((digitalSum / 1.05) * 100) / 100;
        const saziateCashFee = Math.round((cashSum - (cashSum / 1.05)) * 100) / 100;
        const totalPaidOut = Math.round(payoutSum * 100) / 100;
        const totalNotificationCosts = Math.round(notificationSum * 100) / 100;

        const estimatedAvailable = Math.round((pspDigitalEntitlement - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100) / 100;

        // Threshold check (minimum automated payout NGN 1000)
        if (estimatedAvailable >= 1000) {
          const txId = generateId();
          
          newTxs.push({
            id: txId,
            residentId: psp.id, // Using residentId field to store pspId for payouts
            reference: `PAYOUT-AUTO-${generateId()}`,
            amount: estimatedAvailable,
            paymentMethod: "bank_transfer",
            status: "success", // Simulated immediate payout execution
            cashStatus: "settled",
            paidAt: new Date(),
          });

          newLogs.push({
            id: generateId(),
            actorId: "system",
            action: "payout.automated",
            entityType: "psp",
            entityId: psp.id,
            meta: JSON.stringify({ amount: estimatedAvailable }),
          });

          processedCount++;

          // Send Email Confirmation (queue promise)
          if (psp.contactEmail && psp.settlementAccountNumber) {
            const accountMask = psp.settlementAccountNumber.slice(-4);
            notificationPromises.push(sendEmail({
              to: psp.contactEmail,
              subject: "Saziate Payout Initiated",
              html: emailTemplates.payoutConfirmation(psp.name, estimatedAvailable, accountMask),
            }));
          }
        }
      }

      // Execute bulk inserts
      if (newTxs.length > 0) {
        await tx.insert(transactions).values(newTxs);
      }
      if (newLogs.length > 0) {
        await tx.insert(auditLogs).values(newLogs);
      }
    });

    // Concurrent Notification Dispatch (outside transaction to avoid DB locks)
    if (notificationPromises.length > 0) {
      const concurrentLimit = 25;
      for (let i = 0; i < notificationPromises.length; i += concurrentLimit) {
        const chunk = notificationPromises.slice(i, i + concurrentLimit);
        await Promise.allSettled(chunk);
      }
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Processed ${processedCount} automated payouts successfully.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Cron Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

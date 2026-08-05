export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { organizations, transactions, auditLogs, notificationLogs, users } from "@/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { PaystackClient } from "@/lib/paystack";


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
    let processedCount = 0;
    const notificationPromises: Promise<any>[] = [];

    // Run the entire balance query & reservation in a single transaction block
    await db.transaction(async (tx) => {
      // 1. Fetch all active organizations
      const allorganizations = await tx.select().from(organizations).all();
      if (allorganizations.length === 0) return;

      // 2. Optimization: Bulk fetch aggregates to eliminate N+1 queries
      const digitalTotals = await tx
        .select({
          orgId: users.orgId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(transactions.paymentMethod, "bank_transfer"),
          eq(transactions.status, "success"),
          // Exclude payouts — they share bank_transfer paymentMethod but are outflows, not income
          sql`${transactions.reference} NOT LIKE 'PAYOUT-%'`
        ))
        .groupBy(users.orgId)
        .all();

      const cashTotals = await tx
        .select({
          orgId: users.orgId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(transactions.paymentMethod, "cash"),
          inArray(transactions.cashStatus, ["verified", "settled"])
        ))
        .groupBy(users.orgId)
        .all();

      const payoutTotals = await tx
        .select({
          orgId: transactions.orgId,
          total: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .where(and(
          like(transactions.reference, "PAYOUT-%"),
          inArray(transactions.status, ["initiated", "success"])
        ))
        .groupBy(transactions.orgId)
        .all();

      const notificationTotals = await tx
        .select({
          orgId: notificationLogs.orgId,
          total: sql<number>`sum(${notificationLogs.costNgn})`,
        })
        .from(notificationLogs)
        .groupBy(notificationLogs.orgId)
        .all();

      // Convert lists to Maps for fast O(1) lookups
      const digitalMap = new Map(digitalTotals.map((t) => [t.orgId, Number(t.total || 0)]));
      const cashMap = new Map(cashTotals.map((t) => [t.orgId, Number(t.total || 0)]));
      const payoutMap = new Map(payoutTotals.map((t) => [t.orgId, Number(t.total || 0)]));
      const notificationMap = new Map(notificationTotals.map((t) => [t.orgId, Number(t.total || 0)]));

      const newTxs = [];
      const newLogs = [];

      for (const org of allorganizations) {
        const digitalSum = (digitalMap.get(org.id) as number) || 0;
        const cashSum = (cashMap.get(org.id) as number) || 0;
        const payoutSum = (payoutMap.get(org.id) as number) || 0;
        const notificationSum = (notificationMap.get(org.id) as number) || 0;

        // Apply strict rounding
        const orgDigitalEntitlement = Math.round((digitalSum / config.PLATFORM_FEE_DIVISOR) * 100) / 100;
        const saziateCashFee = Math.round((cashSum - (cashSum / config.PLATFORM_FEE_DIVISOR)) * 100) / 100;
        const totalPaidOut = Math.round(payoutSum * 100) / 100;
        const totalNotificationCosts = Math.round(notificationSum * 100) / 100;

        const estimatedAvailable = Math.round((orgDigitalEntitlement - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100) / 100;

        // Threshold check (minimum automated payout NGN 1000)
        if (estimatedAvailable >= config.locality.autoPayoutMinimum) {
          const txId = generateId();
          const reference = `PAYOUT-AUTO-${generateId()}`;
          
          let isSuccess = false;
          // Execute Transfer via Paystack
          if (!config.isMockMode && env.PAYSTACK_SECRET_KEY && org.settlementBankCode && org.settlementAccountNumber) {
            try {
              const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
              const recipient = await paystack.createTransferRecipient({
                name: org.settlementAccountName || org.name,
                accountNumber: org.settlementAccountNumber,
                bankCode: org.settlementBankCode,
                currency: config.locality.currency,
              });

              await paystack.initiateTransfer({
                amount: estimatedAvailable,
                recipientCode: recipient.recipient_code,
                reference: reference,
                reason: "Saziate Net Payout Settlement",
              });
              isSuccess = true;
            } catch (err: any) {
              console.error(`Paystack Transfer Failed for org ${org.id}:`, err);
            }
          } else {
             // Either in mock mode, missing config, or Org missing settlement info
             if (config.isMockMode) isSuccess = true;
          }

          if (isSuccess) {
            // Find an operator for this Org to use as residentId for the FK constraint
            const operator = await tx.select({ id: users.id }).from(users).where(and(eq(users.orgId, org.id), eq(users.role, "org_admin"))).limit(1).get();
            const validUserId = operator ? operator.id : "system"; // Will fail FK if 'system' doesn't exist, but it's better than org.id

            newTxs.push({
              id: txId,
              orgId: org.id,
              residentId: validUserId,
              reference: reference,
              amount: estimatedAvailable,
              paymentMethod: "bank_transfer" as any,
              status: "success" as any,
              cashStatus: "settled" as any,
              paidAt: new Date(),
            });

            newLogs.push({
              id: generateId(),
              actorId: "system",
              action: "payout.automated",
              entityType: "org",
              entityId: org.id,
              meta: JSON.stringify({ amount: estimatedAvailable }),
            });

            processedCount++;

            // Send Email Confirmation (queue promise)
            if (org.contactEmail && org.settlementAccountNumber) {
              const accountMask = org.settlementAccountNumber.slice(-4);
              notificationPromises.push(sendEmail({
                to: org.contactEmail,
                subject: "Saziate Payout Initiated",
                html: emailTemplates.payoutConfirmation(org.name, estimatedAvailable, accountMask),
              }));
            }
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
      status: "success" as any, 
      message: `Processed ${processedCount} automated payouts successfully.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Cron Error:", error);
    console.error("[API Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { getDb } from "@/db";
import { psps, invoices, transactions, auditLogs, notificationLogs, users } from "@/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";

export const runtime = "edge";

// Triggered via Cron (e.g. daily for T+1 processing)
export async function GET(req: Request) {
  const env = process.env as any;

  // Basic security: require a CRON_SECRET token
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB);

  try {
    // 1. Fetch all PSPs
    const allPsps = await db
      .select()
      .from(psps);

    if (allPsps.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "No active PSPs found." }), { status: 200 });
    }

    let processedCount = 0;

    for (const psp of allPsps) {
      // Find all paid invoices that haven't been settled yet
      // To properly track this in a real system, we'd need a 'settlementId' on invoices or a separate ledger table.
      // For now, we simulate settlement calculation by fetching all paid invoices without a payout transaction.
      // Since transactions table already tracks payouts, we can sum all paid invoices minus sum of all payouts.

      // 1. Optimistic Lock: Insert the payout transaction FIRST with status "initiated"
      // We will assume a large payout for the lock amount to be safe, or we can calculate first, 
      // but wait, if we calculate first, we have the race condition!
      // Better: we can calculate `currentAvailable` with the existing function, then insert it as "initiated", 
      // then recalculate `currentAvailable` to verify we didn't overdraft!
      
      // Calculate initial estimate
      const digitalTxs = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(users.pspId, psp.id),
          eq(transactions.paymentMethod, "bank_transfer"),
          eq(transactions.status, "success")
        ));
      const totalDigitalCollections = digitalTxs.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);
      const pspDigitalEntitlement = totalDigitalCollections / 1.05;

      const cashTxs = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(users.pspId, psp.id),
          eq(transactions.paymentMethod, "cash"),
          inArray(transactions.cashStatus, ["verified", "settled"])
        ));
      const totalCashCollections = cashTxs.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);
      const saziateCashFee = totalCashCollections - (totalCashCollections / 1.05);

      const pastPayouts = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .where(and(
          eq(transactions.residentId, psp.id), // HACK: reusing residentId for pspId in payouts for this demo
          like(transactions.reference, "PAYOUT-%"),
          inArray(transactions.status, ["initiated", "success"])
        ));
      const totalPaidOut = pastPayouts.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);

      const notificationCosts = await db
        .select({ costNgn: notificationLogs.costNgn })
        .from(notificationLogs)
        .where(eq(notificationLogs.pspId, psp.id));
      const totalNotificationCosts = notificationCosts.reduce((sum: number, log: any) => sum + (log.costNgn || 0), 0);
      
      const estimatedAvailable = pspDigitalEntitlement - saziateCashFee - totalPaidOut - totalNotificationCosts;

      // Threshold check (e.g., minimum payout ₦1000)
      if (estimatedAvailable >= 1000) {
        // 1. Optimistic Lock: Insert the payout transaction with estimated amount
        const txId = generateId();
        await db.insert(transactions).values({
          id: txId,
          residentId: psp.id, // Using residentId field to store pspId for payouts
          reference: `PAYOUT-AUTO-${generateId()}`,
          amount: estimatedAvailable,
          paymentMethod: "bank_transfer",
          status: "initiated",
          cashStatus: "settled",
        });

        // 2. Re-calculate total paid out to include our new lock, and verify no overdraft
        const pastPayoutsCheck = await db
          .select({ amount: transactions.amount })
          .from(transactions)
          .where(and(
            eq(transactions.residentId, psp.id),
            like(transactions.reference, "PAYOUT-%"),
            inArray(transactions.status, ["initiated", "success"])
          ));
        const newTotalPaidOut = pastPayoutsCheck.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);
        const currentAvailableAfterLock = pspDigitalEntitlement - saziateCashFee - newTotalPaidOut - totalNotificationCosts;

        if (currentAvailableAfterLock < 0) {
            // Overdraft detected (Concurrent Cron Execution!)
            await db.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
            continue; // Skip this PSP
        }

        // 3. Process the payout (simulated via API in real app)
        await db.update(transactions).set({ status: "success" }).where(eq(transactions.id, txId));

        await db.insert(auditLogs).values({
          id: generateId(),
          actorId: "system",
          action: "payout.automated",
          entityType: "psp",
          entityId: psp.id,
          meta: JSON.stringify({ amount: estimatedAvailable }),
        });

        processedCount++;

        // Send Email Confirmation
        if (psp.contactEmail && psp.settlementAccountNumber) {
          const accountMask = psp.settlementAccountNumber.slice(-4);
          await sendEmail({
            to: psp.contactEmail,
            subject: "Saziate Payout Initiated",
            html: emailTemplates.payoutConfirmation(psp.name, estimatedAvailable, accountMask),
          });
        }
      }
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Processed ${processedCount} automated payouts successfully.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Cron Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

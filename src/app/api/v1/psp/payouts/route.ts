import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { psps, transactions, auditLogs, invoices, notificationLogs } from "@/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { users } from "@/db/schema";



export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { amount } = await req.json() as { amount: number };
    if (!amount || amount <= 0) {
      return new Response("Invalid payout amount.", { status: 400 });
    }

    // Get PSP details to verify settlement account
    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp || !psp.settlementBankCode || !psp.settlementAccountNumber) {
      return new Response("Settlement account details not configured.", { status: 400 });
    }

    // 1. Optimistic Lock: Insert the payout transaction FIRST with status "initiated"
    const txId = generateId();
    await db.insert(transactions).values({
      id: txId,
      residentId: psp.id, // HACK: reusing residentId for pspId in payouts
      reference: `PAYOUT-MANUAL-${generateSecureReference(10)}`,
      amount,
      paymentMethod: "bank_transfer",
      status: "initiated",
      cashStatus: "settled",
      paidAt: new Date(),
    });

    // 2. Verify manual payout balance via Master Ledger Equation
    // Because we just inserted the "initiated" transaction, it will naturally be included in `totalPaidOut`!
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
        eq(transactions.residentId, psp.id),
        like(transactions.reference, "PAYOUT-%"),
        inArray(transactions.status, ["initiated", "success"])
      ));
    const totalPaidOut = pastPayouts.reduce((sum: number, tx: { amount: number }) => sum + tx.amount, 0);

    const notificationCosts = await db
      .select({ costNgn: notificationLogs.costNgn })
      .from(notificationLogs)
      .where(eq(notificationLogs.pspId, psp.id));
    const totalNotificationCosts = notificationCosts.reduce((sum: number, log: any) => sum + (log.costNgn || 0), 0);

    // 3. The current available balance AFTER optimistic deduction
    const currentAvailable = pspDigitalEntitlement - saziateCashFee - totalPaidOut - totalNotificationCosts;

    if (currentAvailable < 0) {
      // 4. Overdraft Detected (Concurrent Double-Spend Exploit Attempt)
      // Immediately fail the transaction to release the lock
      await db.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
      return new Response(`Insufficient balance. Transaction aborted.`, { status: 400 });
    }

    // 5. Proceed with Paystack Transfer
    if (!config.isMockMode && process.env.NODE_ENV !== "development") {
      if (!env.PAYSTACK_SECRET_KEY) {
        await db.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
        return new Response("Payment provider not configured.", { status: 500 });
      }
      
      try {
        const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            type: "nuban",
            name: psp.settlementAccountName || psp.name,
            account_number: psp.settlementAccountNumber,
            bank_code: psp.settlementBankCode,
            currency: "NGN",
          }),
        });

        if (!recipientRes.ok) throw new Error("Failed to create transfer recipient on Paystack.");

        const recipientData = await recipientRes.json() as any;
        const recipientCode = recipientData.data.recipient_code;

        const transferRes = await fetch("https://api.paystack.co/transfer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            source: "balance",
            amount: Math.round(amount * 100),
            recipient: recipientCode,
            reason: "Saziate Settlement Payout",
          }),
        });

        if (!transferRes.ok) throw new Error("Failed to initiate transfer on Paystack.");
        
        // 6a. Paystack API succeeded, lock finalized
        await db.update(transactions).set({ status: "success" }).where(eq(transactions.id, txId));
      } catch (err: any) {
        // 6b. Paystack API failed, release the lock
        await db.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
        throw err;
      }
    } else {
        // In mock mode, just succeed
        await db.update(transactions).set({ status: "success" }).where(eq(transactions.id, txId));
    }

    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: pspId,
      action: "payout.manual",
      entityType: "psp",
      entityId: psp.id,
      meta: JSON.stringify({ amount }),
    });

    // Send Confirmation Email to Operator
    if (psp.contactEmail) {
      const accountMask = psp.settlementAccountNumber.slice(-4);
      await sendEmail({
        to: psp.contactEmail,
        subject: "Saziate Payout Initiated",
        html: emailTemplates.payoutConfirmation(psp.name, amount, accountMask),
      });
    }

    return new Response(JSON.stringify({ status: "success", message: "Payout initiated successfully." }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

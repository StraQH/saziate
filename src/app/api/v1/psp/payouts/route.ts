import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { psps, transactions, auditLogs, invoices, notificationLogs, users } from "@/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { z } from "zod";


const payoutSchema = z.object({
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = payoutSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { amount } = parsed.data;

    // Get PSP details to verify settlement account
    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp || !psp.settlementBankCode || !psp.settlementAccountNumber) {
      return new Response("Settlement account details not configured.", { status: 400 });
    }

    const txId = generateId();
    const reference = `PAYOUT-MANUAL-${generateSecureReference(10)}`;

    try {
      // 1. Check balance and reserve inside Drizzle transaction
      await db.transaction(async (tx: any) => {
        const digitalTxs = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.pspId, psp.id),
            eq(transactions.paymentMethod, "bank_transfer"),
            eq(transactions.status, "success")
          ));
        const totalDigitalCollections = digitalTxs.reduce((sum: number, t: any) => sum + t.amount, 0);
        const pspDigitalEntitlement = totalDigitalCollections / 1.05;

        const cashTxs = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.pspId, psp.id),
            eq(transactions.paymentMethod, "cash"),
            inArray(transactions.cashStatus, ["verified", "settled"])
          ));
        const totalCashCollections = cashTxs.reduce((sum: number, t: any) => sum + t.amount, 0);
        const saziateCashFee = totalCashCollections - (totalCashCollections / 1.05);

        const pastPayouts = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .where(and(
            eq(transactions.residentId, psp.id),
            like(transactions.reference, "PAYOUT-%"),
            inArray(transactions.status, ["initiated", "success"])
          ));
        const totalPaidOut = pastPayouts.reduce((sum: number, t: any) => sum + t.amount, 0);

        const notificationCosts = await tx
          .select({ costNgn: notificationLogs.costNgn })
          .from(notificationLogs)
          .where(eq(notificationLogs.pspId, psp.id));
        const totalNotificationCosts = notificationCosts.reduce((sum: number, log: any) => sum + (log.costNgn || 0), 0);

        // Standardize calculations with 2 decimal precision
        const roundedDigital = Math.round(pspDigitalEntitlement * 100) / 100;
        const roundedCashFee = Math.round(saziateCashFee * 100) / 100;
        const roundedPaidOut = Math.round(totalPaidOut * 100) / 100;
        const roundedNotification = Math.round(totalNotificationCosts * 100) / 100;

        const currentAvailable = Math.round((roundedDigital - roundedCashFee - roundedPaidOut - roundedNotification) * 100) / 100;

        if (currentAvailable < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        // Insert the initiated transaction to lock the balance
        await tx.insert(transactions).values({
          id: txId,
          residentId: psp.id,
          reference,
          amount,
          paymentMethod: "bank_transfer",
          status: "initiated",
          cashStatus: "settled",
          paidAt: new Date(),
        });
      });
    } catch (txErr: any) {
      if (txErr.message === "INSUFFICIENT_BALANCE") {
        return new Response("Insufficient balance. Transaction aborted.", { status: 400 });
      }
      throw txErr;
    }

    // 2. Proceed with Paystack Transfer
    let isSuccess = false;
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
        
        isSuccess = true;
      } catch (err: any) {
        await db.update(transactions).set({ status: "failed" }).where(eq(transactions.id, txId));
        throw err;
      }
    } else {
      isSuccess = true; // In mock/dev environment
    }

    if (isSuccess) {
      await db.transaction(async (tx: any) => {
        await tx.update(transactions).set({ status: "success" }).where(eq(transactions.id, txId));
        await tx.insert(auditLogs).values({
          id: generateId(),
          actorId: pspId,
          action: "payout.manual",
          entityType: "psp",
          entityId: psp.id,
          meta: JSON.stringify({ amount }),
        });
      });

      // Send Confirmation Email (non-blocking)
      if (psp.contactEmail) {
        const accountMask = psp.settlementAccountNumber.slice(-4);
        try {
          await sendEmail({
            to: psp.contactEmail,
            subject: "Saziate Payout Initiated",
            html: emailTemplates.payoutConfirmation(psp.name, amount, accountMask),
          });
        } catch (emailErr) {
          console.error("Failed to send payout confirmation email:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ status: "success", message: "Payout initiated successfully." }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Payout Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

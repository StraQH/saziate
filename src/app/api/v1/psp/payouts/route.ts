export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { psps, transactions, auditLogs, invoices, notificationLogs, users, accounts } from "@/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { z } from "zod";
import { verifyPassword } from "@/lib/hash";

const payoutSchema = z.object({
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const sessionResponse = await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = payoutSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { amount, password } = parsed.data;

    // Verify confirmation password
    if (!config.isMockMode) {
      const userRecord = await db
        .select({ password: accounts.password })
        .from(accounts)
        .where(and(
          eq(accounts.userId, sessionResponse.user.id),
          inArray(accounts.providerId, ["email", "credential"])
        ))
        .get();

      if (!userRecord || !userRecord.password) {
        return new Response("Unauthorized.", { status: 401 });
      }

      const isPasswordCorrect = await verifyPassword(password, userRecord.password);
      if (!isPasswordCorrect) {
        return new Response("Incorrect authorization password.", { status: 401 });
      }
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

    const txId = generateId();
    const reference = `PAYOUT-MANUAL-${generateSecureReference(10)}`;

    try {
      // 1. Check balance and reserve inside Drizzle transaction
      await db.transaction(async (tx) => {
        const digitalTxs = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.pspId, psp.id),
            eq(transactions.paymentMethod, "bank_transfer"),
            eq(transactions.status, "success")
          ))
          .all();
        const totalDigitalCollections = digitalTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);
        const pspDigitalEntitlement = totalDigitalCollections / config.PLATFORM_FEE_DIVISOR;

        const cashTxs = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.pspId, psp.id),
            eq(transactions.paymentMethod, "cash"),
            inArray(transactions.cashStatus, ["verified", "settled"])
          ))
          .all();
        const totalCashCollections = cashTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);
        const saziateCashFee = totalCashCollections - (totalCashCollections / config.PLATFORM_FEE_DIVISOR);

        const pastPayouts = await tx
          .select({ amount: transactions.amount })
          .from(transactions)
          .where(and(
            eq(transactions.pspId, psp.id),
            like(transactions.reference, "PAYOUT-%"),
            inArray(transactions.status, ["initiated", "success"])
          ))
          .all();
        const totalPaidOut = pastPayouts.reduce((sum: number, t) => sum + (t.amount || 0), 0);

        const notificationCosts = await tx
          .select({ costNgn: notificationLogs.costNgn })
          .from(notificationLogs)
          .where(eq(notificationLogs.pspId, psp.id))
          .all();
        const totalNotificationCosts = notificationCosts.reduce((sum: number, log) => sum + (log.costNgn || 0), 0);

        // Standardize calculations with 2 decimal precision
        const roundedDigital = Math.round(pspDigitalEntitlement * 100) / 100;
        const roundedCashFee = Math.round(saziateCashFee * 100) / 100;
        const roundedPaidOut = Math.round(totalPaidOut * 100) / 100;
        const roundedNotification = Math.round(totalNotificationCosts * 100) / 100;

        const currentAvailable = Math.round((roundedDigital - roundedCashFee - roundedPaidOut - roundedNotification) * 100) / 100;

        if (currentAvailable < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        // Insert the initiated transaction to lock the balance.
        // residentId stores the operator's user ID (satisfies NOT NULL FK), while
        // pspId is the authoritative field for all payout lookups.
        await tx.insert(transactions).values({
          id: txId,
          pspId: psp.id,
          residentId: sessionResponse.user.id,
          reference,
          amount,
          paymentMethod: "bank_transfer" as any,
          status: "initiated",
          cashStatus: "settled" as any,
          paidAt: new Date(),
        });
      });
    } catch (txErr: any) {
      if ((txErr as any).message === "INSUFFICIENT_BALANCE") {
        return new Response("Insufficient balance. Transaction aborted.", { status: 400 });
      }
      throw txErr;
    }

    // 2. Proceed with Paystack Transfer
    let isSuccess = false;
    if (!config.isMockMode) {
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
      await db.transaction(async (tx) => {
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

    return new Response(JSON.stringify({ status: "success" as any, message: "Payout initiated successfully." }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Payout Error:", error);
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

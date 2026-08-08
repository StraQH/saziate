export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { organizations, transactions, auditLogs, invoices, notificationLogs, users, accounts } from "@/db/schema";
import { eq, and, like, inArray } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { z } from "zod";
import { verifyPassword } from "@/lib/hash";
import { PaystackClient } from "@/lib/paystack";

const payoutSchema = z.object({
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
  password: z.string().min(1, "Password is required"),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const sessionResponse = await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = (sessionResponse.user as any).orgId;

    if (!orgId) {
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

    // Get Org details to verify settlement account
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();

    if (!org || !org.settlementBankCode || !org.settlementAccountNumber) {
      return new Response("Settlement account details not configured.", { status: 400 });
    }

    const txId = generateId();
    const reference = `PAYOUT-MANUAL-${generateSecureReference(10)}`;

    try {
      // 1. Check balance and reserve inside Drizzle transaction
      await db.transaction(async (tx) => {
        const digitalTxs = await tx
          .select({ total: sql<number>`SUM(${transactions.amount})` })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.orgId, org.id),
            eq(transactions.paymentMethod, "bank_transfer"),
            eq(transactions.status, "success")
          ))
          .get();
        const totalDigitalRevenue = digitalTxs?.total || 0;
        const orgDigitalEntitlement = totalDigitalRevenue / config.PLATFORM_FEE_DIVISOR;

        const cashTxs = await tx
          .select({ total: sql<number>`SUM(${transactions.amount})` })
          .from(transactions)
          .innerJoin(users, eq(transactions.residentId, users.id))
          .where(and(
            eq(users.orgId, org.id),
            eq(transactions.paymentMethod, "cash"),
            inArray(transactions.cashStatus, ["verified", "settled"])
          ))
          .get();
        const totalCashRevenue = cashTxs?.total || 0;
        const saziateCashFee = totalCashRevenue - (totalCashRevenue / config.PLATFORM_FEE_DIVISOR);

        const pastPayouts = await tx
          .select({ total: sql<number>`SUM(${transactions.amount})` })
          .from(transactions)
          .where(and(
            eq(transactions.orgId, org.id),
            like(transactions.reference, "PAYOUT-%"),
            inArray(transactions.status, ["initiated", "success"])
          ))
          .get();
        const totalPaidOut = pastPayouts?.total || 0;

        const notificationCosts = await tx
          .select({ total: sql<number>`SUM(${notificationLogs.costNgn})` })
          .from(notificationLogs)
          .where(eq(notificationLogs.orgId, org.id))
          .get();
        const totalNotificationCosts = notificationCosts?.total || 0;

        // Standardize calculations with 2 decimal precision
        const roundedDigital = Math.round(orgDigitalEntitlement * 100) / 100;
        const roundedCashFee = Math.round(saziateCashFee * 100) / 100;
        const roundedPaidOut = Math.round(totalPaidOut * 100) / 100;
        const roundedNotification = Math.round(totalNotificationCosts * 100) / 100;

        const currentAvailable = Math.round((roundedDigital - roundedCashFee - roundedPaidOut - roundedNotification) * 100) / 100;

        if (currentAvailable < amount) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        // Insert the initiated transaction to lock the balance.
        // residentId stores the operator's user ID (satisfies NOT NULL FK), while
        // orgId is the authoritative field for all payout lookups.
        await tx.insert(transactions).values({
          id: txId,
          orgId: org.id,
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
        const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
        
        // Step A: Create a Transfer Recipient dynamically
        const recipient = await paystack.createTransferRecipient({
          name: org.settlementAccountName || org.name,
          accountNumber: org.settlementAccountNumber,
          bankCode: org.settlementBankCode,
          currency: config.locality.currency,
        });

        // Step B: Initiate the Transfer using the recipient code
        await paystack.initiateTransfer({
          amount: amount,
          recipientCode: recipient.recipient_code,
          reference: reference,
          reason: "Saziate Settlement Payout",
        });

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
          actorId: orgId,
          action: "payout.manual",
          entityType: "org",
          entityId: org.id,
          meta: JSON.stringify({ amount }),
        });
      });

      // Send Confirmation Email (non-blocking)
      if (org.contactEmail) {
        const accountMask = org.settlementAccountNumber.slice(-4);
        try {
          await sendEmail({
            to: org.contactEmail,
            subject: "Saziate Payout Initiated",
            html: emailTemplates.payoutConfirmation(org.name, amount, accountMask),
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

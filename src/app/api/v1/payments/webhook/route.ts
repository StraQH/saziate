import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, users, transactions, residentProfiles } from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";


async function verifyMonnifySignature(
  signature: string,
  rawBody: string,
  secretKey: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyBuf = encoder.encode(secretKey);
  const bodyBuf = encoder.encode(rawBody);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["verify", "sign"]
  );

  const signatureBuf = await crypto.subtle.sign("HMAC", cryptoKey, bodyBuf);
  const hashHex = Array.from(new Uint8Array(signatureBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex === signature;
}

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  try {
    const signature = req.headers.get("monnify-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const rawBody = await req.text();
    const webhookSecret = env.MONNIFY_SECRET_KEY;
    
    if (!webhookSecret) {
      console.error("MONNIFY_SECRET_KEY environment variable is required.");
      return new Response("Server configuration error", { status: 500 });
    }

    const isValid = await verifyMonnifySignature(
      signature,
      rawBody,
      webhookSecret
    );

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    const eventPayload = JSON.parse(rawBody);
    const event = eventPayload.eventType;

    if (config.isMockMode) {
      console.log(`[MOCK WEBHOOK] Received event: ${event}`);
      console.log(`[MOCK WEBHOOK] Payload:`, JSON.stringify(eventPayload.data, null, 2));
      return new Response(JSON.stringify({ status: "success", mock: true }), { status: 200 });
    }

    const db = getDb(env.DB as any);

    // Dedicated virtual account assignment success
    if (event === "RESERVED_ACCOUNT_ALLOCATION_SUCCESSFUL") {
      return new Response(JSON.stringify({ status: "success" }), { status: 200 });
    }

    if (event === "SUCCESSFUL_TRANSACTION") {
      const data = eventPayload.eventData;
      const amountInNaira = data.amountPaid;
      const reference = data.paymentReference;

      // Check webhook idempotency
      const existingTx = await db
        .select()
        .from(transactions)
        .where(eq(transactions.reference, reference))
        .get();

      if (existingTx) {
        // If it's already a success or failed, skip (true duplicate)
        if (existingTx.status === "success" || existingTx.status === "failed") {
          return new Response(JSON.stringify({ status: "duplicate" }), { status: 200 });
        }
        // If it's an "initiated" pre-log (e.g. from a top-up flow), continue processing
      }

      let profile: any = null;
      let residentUser: any = null;

      // 1. Try matching by paymentReference from narration
      const narration = data.narration || data.metadata?.narration || "";
      const refMatch = narration.match(/\b[a-f0-9]{10}\b/i);
      
      let matchedInvoice: any = null;

      if (refMatch) {
        const extractedRef = refMatch[0].toUpperCase();
        matchedInvoice = await db
          .select()
          .from(invoices)
          .where(eq(invoices.paymentReference, extractedRef))
          .get();

        if (matchedInvoice) {
          residentUser = await db
            .select()
            .from(users)
            .where(eq(users.id, matchedInvoice.residentId))
            .get();
          
          profile = await db
            .select()
            .from(residentProfiles)
            .where(eq(residentProfiles.userId, matchedInvoice.residentId))
            .get();
        }
      }

      // 2. Fallback to customer email matching
      if (!profile && data.customer?.email) {
        residentUser = await db
          .select()
          .from(users)
          .where(eq(users.email, data.customer.email))
          .get();

        if (residentUser) {
          profile = await db
            .select()
            .from(residentProfiles)
            .where(eq(residentProfiles.userId, residentUser.id))
            .get();
        }
      }

      if (!profile || !residentUser) {
        return new Response("Resident profile not found for reference code or email.", { status: 404 });
      }

      // Fetch unpaid invoices
      const invoiceList = matchedInvoice ? [matchedInvoice] : await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.residentId, profile.userId),
            inArray(invoices.status, ["pending", "overdue"])
          )
        )
        .orderBy(asc(invoices.dueDate))
        .all();

      const txId = generateId();

      // Wrap all database operations in a transaction
      await db.transaction(async (tx) => {
        // If there's a pre-logged "initiated" transaction, update it; otherwise insert fresh
        if (existingTx && existingTx.status === "initiated") {
          await tx
            .update(transactions)
            .set({
              invoiceId: invoiceList.length > 0 ? invoiceList[0].id : null,
              amount: amountInNaira,
              status: "success" as any,
              paidAt: new Date(),
            })
            .where(eq(transactions.id, existingTx.id));
        } else {
          await tx.insert(transactions).values({
            id: txId,
            invoiceId: invoiceList.length > 0 ? invoiceList[0].id : null,
            residentId: profile.userId,
            reference,
            amount: amountInNaira,
            status: "success" as any,
            paymentMethod: "bank_transfer" as any,
            paidAt: new Date(),
          });
        }

        let remainingAmount = amountInNaira;

        for (const inv of invoiceList) {
          if (remainingAmount <= 0) break;

          if (remainingAmount >= inv.totalAmount) {
            // Fully pay this invoice
            remainingAmount = Math.round((remainingAmount - inv.totalAmount) * 100) / 100;
            await tx
              .update(invoices)
              .set({ status: "paid", totalAmount: 0 })
              .where(eq(invoices.id, inv.id));
          } else {
            // Partially pay this invoice
            await tx
              .update(invoices)
              .set({ totalAmount: sql`${invoices.totalAmount} - ${remainingAmount}` })
              .where(eq(invoices.id, inv.id));
            remainingAmount = 0;
          }
        }

        if (remainingAmount > 0) {
          // Resident is pre-funding their account (no pending invoices, or surplus left over)
          await tx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${remainingAmount}` })
            .where(eq(residentProfiles.userId, profile.userId));
          
          // Log secondary transaction for ledger balance (only if they actually paid invoices too, otherwise it's just one big pre-fund)
          if (amountInNaira > remainingAmount) {
            await tx.insert(transactions).values({
              id: generateId(),
              residentId: profile.userId,
              reference: `${reference}-SURPLUS`,
              amount: remainingAmount,
              status: "success" as any,
              paymentMethod: "advance_surplus",
              paidAt: new Date(),
            });
          }
        }
      });

      // Dispatch real-time payment confirmation receipt (non-blocking)
      if (residentUser?.email) {
        const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
        try {
          if (invoiceList.length > 0) {
            await sendEmail({
              to: residentUser.email,
              subject: "Saziate Payment Receipt",
              html: emailTemplates.invoiceReceipt(
                firstName,
                amountInNaira,
                invoiceList[0].paymentReference || invoiceList[0].id,
                reference
              ),
            });
          } else {
            await sendEmail({
              to: residentUser.email,
              subject: "Advance Payment Received!",
              html: emailTemplates.advancePaymentReceipt(firstName, amountInNaira),
            });
          }
        } catch (emailErr) {
          console.error("Failed to send email confirmation:", emailErr);
        }
      }

      return new Response(JSON.stringify({ status: "reconciled", transactionId: txId }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (event === "FAILED_DISBURSEMENT" || event === "REVERSED_DISBURSEMENT") {
      const data = eventPayload.eventData;
      const reference = data.reference;

      // Look up transaction by reference to mark as failed
      const existingTx = await db
        .select()
        .from(transactions)
        .where(eq(transactions.reference, reference))
        .get();

      if (existingTx) {
        await db
          .update(transactions)
          .set({ status: "failed" })
          .where(eq(transactions.id, existingTx.id));
      }

      return new Response(JSON.stringify({ status: "failed_payout_logged" }), { status: 200 });
    }

    return new Response("Event unhandled", { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, users, transactions, residentProfiles } from "@/db/schema";
import { eq, and, asc, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";


async function verifyPaystackSignature(
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

  const signatureBuf = new Uint8Array(
    signature.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  return crypto.subtle.verify("HMAC", cryptoKey, signatureBuf, bodyBuf);
}

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  try {
    const signature = req.headers.get("x-paystack-signature");
    if (!signature) {
      return new Response("Missing signature", { status: 400 });
    }

    const rawBody = await req.text();
    const webhookSecret = env.PAYSTACK_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error("PAYSTACK_WEBHOOK_SECRET environment variable is required.");
      return new Response("Server configuration error", { status: 500 });
    }

    const isValid = await verifyPaystackSignature(
      signature,
      rawBody,
      webhookSecret
    );

    if (!isValid) {
      return new Response("Invalid signature", { status: 401 });
    }

    const eventPayload = JSON.parse(rawBody);
    const event = eventPayload.event;
    const db = getDb(env.DB as any);

    // Dedicated virtual account assignment success
    if (event === "dedicatedaccount.assign.success") {
      return new Response(JSON.stringify({ status: "success" }), { status: 200 });
    }

    if (event === "charge.success") {
      const data = eventPayload.data;
      const amountInNaira = Math.round(data.amount) / 100;
      const reference = data.reference;

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

      // Fetch the invoice
      const invoice = matchedInvoice || await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.residentId, profile.userId),
            eq(invoices.status, "pending")
          )
        )
        .orderBy(asc(invoices.dueDate))
        .get();

      const txId = generateId();
      const invoiceId = invoice ? invoice.id : null;

      // Wrap all database operations in a transaction
      await db.transaction(async (tx) => {
        // If there's a pre-logged "initiated" transaction, update it; otherwise insert fresh
        if (existingTx && existingTx.status === "initiated") {
          await tx
            .update(transactions)
            .set({
              invoiceId: invoiceId,
              amount: amountInNaira,
              status: "success" as any,
              paidAt: new Date(),
            })
            .where(eq(transactions.id, existingTx.id));
        } else {
          await tx.insert(transactions).values({
            id: txId,
            invoiceId,
            residentId: profile.userId,
            reference,
            amount: amountInNaira,
            status: "success" as any,
            paymentMethod: "bank_transfer" as any,
            paidAt: new Date(),
          });
        }

        if (invoice) {
          if (amountInNaira >= invoice.totalAmount) {
            const surplus = Math.round((amountInNaira - invoice.totalAmount) * 100) / 100;
            
            if (surplus > 0) {
              await tx
                .update(residentProfiles)
                .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${surplus}` })
                .where(eq(residentProfiles.userId, profile.userId));
              
              // Log secondary transaction for ledger balance
              await tx.insert(transactions).values({
                id: generateId(),
                residentId: profile.userId,
                reference: `${reference}-SURPLUS`,
                amount: surplus,
                status: "success" as any,
                paymentMethod: "advance_surplus",
                paidAt: new Date(),
              });
            }

            // Mark invoice paid
            await tx
              .update(invoices)
              .set({ status: "paid", totalAmount: 0 })
              .where(eq(invoices.id, invoice.id));
          } else {
            // Partial Payment - reduce total amount but keep it pending
            await tx
              .update(invoices)
              .set({ totalAmount: sql`${invoices.totalAmount} - ${amountInNaira}` })
              .where(eq(invoices.id, invoice.id));
          }
        } else {
          // Resident is pre-funding their account (no pending invoices)
          await tx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amountInNaira}` })
            .where(eq(residentProfiles.userId, profile.userId));
        }
      });

      // Dispatch real-time payment confirmation receipt (non-blocking)
      if (residentUser?.email) {
        const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
        try {
          if (invoice) {
            await sendEmail({
              to: residentUser.email,
              subject: "Saziate Payment Receipt",
              html: emailTemplates.invoiceReceipt(
                firstName,
                amountInNaira,
                invoice.paymentReference || invoice.id,
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

    if (event === "transfer.failed" || event === "transfer.reversed") {
      const data = eventPayload.data;
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

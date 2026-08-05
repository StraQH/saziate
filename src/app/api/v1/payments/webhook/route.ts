export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, users, transactions, residentProfiles } from "@/db/schema";
import { eq, and, asc, sql, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";
import { verifyPaystackSignature } from "@/lib/paystack";

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const rawBody = await req.text();
  
  const paystackSignature = req.headers.get("x-paystack-signature");

  if (config.isMockMode) {
    console.log(`[MOCK WEBHOOK] Received webhook payload:`, rawBody);
    return new Response(JSON.stringify({ status: "success", mock: true }), { status: 200 });
  }

  let eventType = "";
  let amountInNaira = 0;
  let reference = "";
  let customerEmail = "";
  let narration = "";
  let invoiceIdsList: string[] = [];
  let isPaystack = false;

  // 1. Paystack Webhook Handler
  if (paystackSignature && env.PAYSTACK_SECRET_KEY) {
    const isValid = await verifyPaystackSignature(paystackSignature, rawBody, env.PAYSTACK_SECRET_KEY);
    if (!isValid) {
      return new Response("Invalid Paystack signature", { status: 401 });
    }
    const payload = JSON.parse(rawBody);
    eventType = payload.event;

    if (eventType === "charge.success") {
      isPaystack = true;
      const data = payload.data;
      amountInNaira = Math.round((data.amount / 100) * 100) / 100; // Paystack sends kobo
      reference = data.reference;
      customerEmail = data.customer?.email || "";
      narration = data.metadata?.narration || data.reference || "";
      if (data.metadata?.invoiceIds) {
        invoiceIdsList = data.metadata.invoiceIds.split(",");
      }
    } else {
      return new Response(JSON.stringify({ status: "ignored_event" }), { status: 200 });
    }
  } else {
    return new Response("Missing signature header or unconfigured provider", { status: 400 });
  }

  const db = getDb(env.DB as any);

  // Check webhook idempotency
  const existingTx = await db
    .select()
    .from(transactions)
    .where(eq(transactions.reference, reference))
    .get();

  if (existingTx) {
    if (existingTx.status === "success" || existingTx.status === "failed") {
      return new Response(JSON.stringify({ status: "duplicate" }), { status: 200 });
    }
  }

  let profile: any = null;
  let residentUser: any = null;

  // 1. Try matching by un-hyphenated reference code from narration (e.g. SZ98A2F14B or SZOD...)
  const refMatch = narration.match(/\b(SZ)?[A-Z0-9]{8,10}\b/i);
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

  // 2. Fallback to matching by customer email
  if (!profile && customerEmail) {
    residentUser = await db
      .select()
      .from(users)
      .where(eq(users.email, customerEmail))
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
  let invoiceList: any[] = [];
  if (invoiceIdsList.length > 0) {
    invoiceList = await db
      .select()
      .from(invoices)
      .where(
        and(
          eq(invoices.residentId, profile.userId),
          inArray(invoices.id, invoiceIdsList)
        )
      )
      .all();
  } else if (matchedInvoice) {
    invoiceList = [matchedInvoice];
  } else {
    invoiceList = await db
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
  }

  const txId = generateId();

  // Wrap all database operations in a transaction
  await db.transaction(async (tx) => {
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
        remainingAmount = Math.round((remainingAmount - inv.totalAmount) * 100) / 100;
        await tx
          .update(invoices)
          .set({ status: "paid", totalAmount: 0 })
          .where(eq(invoices.id, inv.id));
      } else {
        await tx
          .update(invoices)
          .set({ totalAmount: Math.round((inv.totalAmount - remainingAmount) * 100) / 100 })
          .where(eq(invoices.id, inv.id));
        remainingAmount = 0;
      }
    }

    if (remainingAmount > 0) {
      await tx
        .update(residentProfiles)
        .set({ advancePaymentBalance: Math.round(((profile.advancePaymentBalance || 0) + remainingAmount) * 100) / 100 })
        .where(eq(residentProfiles.userId, profile.userId));
      
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
          subject: "Payment Received - Thank You!",
          html: emailTemplates.invoiceReceipt(firstName, amountInNaira, invoiceList[0].paymentReference || reference, reference),
        });
      } else {
        await sendEmail({
          to: residentUser.email,
          subject: "Wallet Advance Top-Up Confirmed!",
          html: emailTemplates.invoiceReceipt(firstName, amountInNaira, "ADVANCE-TOPUP", reference),
        });
      }
    } catch (emailErr) {
      console.error("Failed to send payment receipt email:", emailErr);
    }
  }

  return new Response(JSON.stringify({ status: "success", reconciled: true }), { status: 200 });
}

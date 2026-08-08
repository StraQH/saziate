import { config } from "@/lib/config";
export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole, getActiveorgId } from "@/lib/session";
import { getDb } from "@/db";
import { transactions, invoices, residentProfiles, auditLogs, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { z } from "zod";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { smsTemplates } from "@/lib/sms-templates";


const cashVerifySchema = z.object({
  transactionId: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = cashVerifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { transactionId } = parsed.data;

    // Fetch the cash transaction and verify it belongs to the current Org's invoice
    const txData = await db
      .select({
        id: transactions.id,
        paymentMethod: transactions.paymentMethod,
        cashStatus: transactions.cashStatus,
        amount: transactions.amount,
        invoiceId: transactions.invoiceId,
        orgId: invoices.orgId,
      })
      .from(transactions)
      .innerJoin(invoices, eq(transactions.invoiceId, invoices.id))
      .where(eq(transactions.id, transactionId))
      .get();

    if (!txData || txData.paymentMethod !== "cash") {
      return new Response("Valid cash transaction not found.", { status: 404 });
    }

    if (txData.orgId !== orgId) {
      return new Response("Unauthorized to verify this transaction.", { status: 403 });
    }

    if (txData.cashStatus !== "pending_cash_verification") {
      return new Response("Cash transaction is not pending verification.", { status: 400 });
    }

    const tx = txData;
    let invoice: any = null;

    if (tx.invoiceId) {
      invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, tx.invoiceId))
        .get();
    }

    // Wrap multiple updates in transaction block
    await db.transaction(async (dbTx) => {
      // Update transaction cashStatus to 'verified'
      await dbTx
        .update(transactions)
        .set({ cashStatus: "verified" })
        .where(eq(transactions.id, transactionId));

      // Update the invoice if attached
      if (tx.invoiceId && invoice) {
        if (invoice.status !== "paid") {
          if (tx.amount >= invoice.totalAmount) {
            // Full Payment or Overpayment
            await dbTx
              .update(invoices)
              .set({ status: "paid", totalAmount: 0 })
              .where(eq(invoices.id, invoice.id));
            
            const surplus = Math.round((tx.amount - invoice.totalAmount) * 100) / 100;
            if (surplus > 0) {
              await dbTx
                .update(residentProfiles)
                .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${surplus}` })
                .where(eq(residentProfiles.userId, invoice.residentId));
            }
          } else {
            // Partial Payment: Reduce invoice total, leave as pending
            await dbTx
              .update(invoices)
              .set({ totalAmount: sql`${invoices.totalAmount} - ${tx.amount}` })
              .where(eq(invoices.id, invoice.id));
          }
        } else {
          // Invoice is already paid. Check if this is a genuine double-payment situation
          // (e.g. resident also paid via bank transfer after cash was logged).
          // The cash amount goes to advance balance, and we log an audit warning.
          await dbTx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${tx.amount}` })
            .where(eq(residentProfiles.userId, invoice.residentId));

          // Audit the double-payment for operator visibility
          const session2 = await auth(env.DB as any).api.getSession({ headers: req.headers });
          await dbTx.insert(auditLogs).values({
            id: generateId(),
            actorId: session2?.user?.id || orgId,
            action: "cash.double_payment_warning",
            entityType: "transaction",
            entityId: transactionId,
            meta: JSON.stringify({
              orgId,
              invoiceId: tx.invoiceId,
              cashAmount: tx.amount,
              note: "Invoice was already paid when cash was verified. Cash amount credited to advance balance.",
            }),
          });
        }
      }
      
      const session = await auth(env.DB as any).api.getSession({ headers: req.headers });
      await dbTx.insert(auditLogs).values({
        id: generateId(),
        actorId: session?.user?.id || orgId,
        action: "cash.verified",
        entityType: "transaction",
        entityId: transactionId,
        meta: JSON.stringify({ orgId, invoiceId: tx.invoiceId }),
      });
    });

    // Send Receipt (non-blocking)
    if (invoice) {
      const residentUser = await db.select().from(users).where(eq(users.id, invoice.residentId)).get();
      if (residentUser) {
        const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
        const hasRealEmail = residentUser.email && residentUser.email.includes("@") && !residentUser.email.endsWith("@saziate.com");
        
        try {
          if (hasRealEmail) {
            await sendEmail({
              to: residentUser.email,
              subject: "Saziate Payment Receipt",
              html: emailTemplates.paymentReceipt(firstName, tx.amount),
            });
          } else if (residentUser.phone) {
            const termiiKey = env.TERMII_API_KEY;
            if (termiiKey) {
              const msgText = smsTemplates.paymentVerified(String(tx.amount), invoice.id);
              await sendNotificationWithFallback({
                dbBinding: env.DB as any,
                termiiApiKey: termiiKey,
                orgId,
                residentId: invoice.residentId,
                phone: residentUser.phone,
                messageText: msgText,
                messageType: "payment_receipt",
                channel: "sms",
              });
            }
          }
        } catch (err) {
          console.error("Failed to send cash verification receipt:", err);
        }
      }
    }

    return new Response(JSON.stringify({ status: "success" as any, message: "Cash verified." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Cash Verification Error:", error);
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

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Fetch all pending cash transactions for this Org (by joining invoices)
    const pendingCash = await db
      .select({
        id: transactions.id,
        invoiceId: transactions.invoiceId,
        residentId: transactions.residentId,
        reference: transactions.reference,
        amount: transactions.amount,
        paidAt: transactions.paidAt,
        loggedById: transactions.loggedById,
      })
      .from(transactions)
      .innerJoin(invoices, eq(transactions.invoiceId, invoices.id))
      .where(
        and(
          eq(invoices.orgId, orgId),
          eq(transactions.cashStatus, "pending_cash_verification")
        )
      )
      .all();

    return new Response(JSON.stringify(pendingCash), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("GET Pending Cash Error:", error);
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

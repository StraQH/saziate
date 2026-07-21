import { requireRole, getActivePspId } from "@/lib/session";
import { getDb } from "@/db";
import { transactions, invoices, residentProfiles, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { TermiiClient } from "@/lib/termii";
import { users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as { transactionId?: string };
    const { transactionId } = rawBody;

    if (!transactionId) {
      return new Response("Missing transactionId.", { status: 400 });
    }

    // Fetch the cash transaction and verify it belongs to the current PSP's invoice
    const txData = await db
      .select({
        id: transactions.id,
        paymentMethod: transactions.paymentMethod,
        cashStatus: transactions.cashStatus,
        amount: transactions.amount,
        invoiceId: transactions.invoiceId,
        pspId: invoices.pspId,
      })
      .from(transactions)
      .innerJoin(invoices, eq(transactions.invoiceId, invoices.id))
      .where(eq(transactions.id, transactionId))
      .get();

    if (!txData || txData.paymentMethod !== "cash") {
      return new Response("Valid cash transaction not found.", { status: 404 });
    }

    if (txData.pspId !== pspId) {
      return new Response("Unauthorized to verify this transaction.", { status: 403 });
    }

    if (txData.cashStatus === "verified" || txData.cashStatus === "settled") {
      return new Response("Cash is already verified or settled.", { status: 400 });
    }

    const tx = txData;

    // Update transaction cashStatus to 'verified'
    await db
      .update(transactions)
      .set({ cashStatus: "verified" })
      .where(eq(transactions.id, transactionId));

    // Update the invoice if attached
    if (tx.invoiceId) {
      const invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, tx.invoiceId))
        .get();

      if (invoice) {
        if (invoice.status !== "paid") {
          if (tx.amount >= invoice.totalAmount) {
            // Full Payment or Overpayment
            await db
              .update(invoices)
              .set({ status: "paid" })
              .where(eq(invoices.id, invoice.id));
            
            const surplus = tx.amount - invoice.totalAmount;
            if (surplus > 0) {
              const profile = await db
                .select()
                .from(residentProfiles)
                .where(eq(residentProfiles.userId, invoice.residentId))
                .get();
                
              if (profile) {
                await db
                  .update(residentProfiles)
                  .set({ advancePaymentBalance: (profile.advancePaymentBalance || 0) + surplus })
                  .where(eq(residentProfiles.userId, profile.userId));
              }
            }
          } else {
            // Partial Payment: Reduce invoice total, leave as pending
            await db
              .update(invoices)
              .set({ totalAmount: invoice.totalAmount - tx.amount })
              .where(eq(invoices.id, invoice.id));
          }
        } else {
          // Invoice is already paid! The ENTIRE cash amount goes to advance balance
          const profile = await db
            .select()
            .from(residentProfiles)
            .where(eq(residentProfiles.userId, invoice.residentId))
            .get();
            
          if (profile) {
            await db
              .update(residentProfiles)
              .set({ advancePaymentBalance: (profile.advancePaymentBalance || 0) + tx.amount })
              .where(eq(residentProfiles.userId, profile.userId));
          }
        }

        // Send Email Receipt
        const residentUser = await db.select().from(users).where(eq(users.id, invoice.residentId)).get();
        if (residentUser && residentUser.email) {
          const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
          await sendEmail({
            to: residentUser.email,
            subject: "Saziate Payment Receipt",
            html: emailTemplates.paymentReceipt(firstName, tx.amount),
          });
        }
      }
    }

    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || pspId,
      action: "cash.verified",
      entityType: "transaction",
      entityId: transactionId,
      meta: JSON.stringify({ pspId, invoiceId: tx.invoiceId }),
    });

    return new Response(JSON.stringify({ status: "success", message: "Cash verified." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Fetch all pending cash transactions for this PSP (by joining invoices)
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
          eq(invoices.pspId, pspId),
          eq(transactions.cashStatus, "pending_cash_verification")
        )
      );

    return new Response(JSON.stringify(pendingCash), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

import { getAppEnv } from "@/lib/env";
import { requireRole, getActivePspId } from "@/lib/session";
import { getDb } from "@/db";
import { transactions, invoices, residentProfiles, auditLogs, users } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { z } from "zod";


const cashVerifySchema = z.object({
  transactionId: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = cashVerifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { transactionId } = parsed.data;

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
    let invoice: any = null;

    if (tx.invoiceId) {
      invoice = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, tx.invoiceId))
        .get();
    }

    // Wrap multiple updates in transaction block
    await db.transaction(async (dbTx: any) => {
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
          // Invoice is already paid! The ENTIRE cash amount goes to advance balance
          await dbTx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${tx.amount}` })
            .where(eq(residentProfiles.userId, invoice.residentId));
        }
      }
      
      const session = await auth(env.DB).api.getSession({ headers: req.headers });
      await dbTx.insert(auditLogs).values({
        id: generateId(),
        actorId: session?.user?.id || pspId,
        action: "cash.verified",
        entityType: "transaction",
        entityId: transactionId,
        meta: JSON.stringify({ pspId, invoiceId: tx.invoiceId }),
      });
    });

    // Send Email Receipt (non-blocking)
    if (invoice) {
      const residentUser = await db.select().from(users).where(eq(users.id, invoice.residentId)).get();
      if (residentUser && residentUser.email) {
        const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
        try {
          await sendEmail({
            to: residentUser.email,
            subject: "Saziate Payment Receipt",
            html: emailTemplates.paymentReceipt(firstName, tx.amount),
          });
        } catch (emailErr) {
          console.error("Failed to send cash verification email receipt:", emailErr);
        }
      }
    }

    return new Response(JSON.stringify({ status: "success", message: "Cash verified." }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error: any) {
    console.error("Cash Verification Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function GET(req: Request) {
  const env = getAppEnv() as any;
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
    console.error("GET Pending Cash Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

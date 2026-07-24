export const runtime = "edge";
import { getAppEnv } from "@/lib/env";
import { reconcileInvoiceSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { invoices, transactions, users, residentProfiles, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActivePspId, requireRole } from "@/lib/session";
import { generateId } from "@/lib/utils";



export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { invoiceId } = await req.json() as { invoiceId: string };
    if (!invoiceId) {
      return new Response("Missing invoice ID.", { status: 400 });
    }

    // Verify invoice ownership
    const invoice = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.pspId, pspId)))
      .get();

    if (!invoice) {
      return new Response("Invoice not found or unauthorized.", { status: 404 });
    }

    if (invoice.status === "paid") {
      return new Response("Invoice is already marked as paid.", { status: 400 });
    }

    // Simulate Paystack verification success
    const txId = generateId();
    const paystackRef = `MAN-REC-${Date.now()}`;

    // Mark invoice paid
    await db
      .update(invoices)
      .set({ status: "paid" })
      .where(eq(invoices.id, invoiceId));

    // Record successful transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceId: invoiceId,
      residentId: invoice.residentId,
      reference: paystackRef,
      amount: invoice.totalAmount,
      status: "success",
      paymentMethod: "cash",
      cashStatus: "settled",
      paidAt: new Date(),
    });

    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || pspId,
      action: "invoice.reconciled",
      entityType: "invoice",
      entityId: invoiceId,
      meta: JSON.stringify({ txId, reference: paystackRef }),
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Invoice successfully reconciled and marked as paid.",
        transaction: { id: txId, reference: paystackRef },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { reconcileInvoiceSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { invoices, transactions, users, residentProfiles, auditLogs } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { getActiveorgId, requireRole } from "@/lib/session";
import { generateId } from "@/lib/utils";



export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { invoiceId } = await req.json() as any as { invoiceId: string };
    if (!invoiceId) {
      return new Response("Missing invoice ID.", { status: 400 });
    }

    // Verify invoice ownership
    const invoice = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
      .get();

    if (!invoice) {
      return new Response("Invoice not found or unauthorized.", { status: 404 });
    }

    if (invoice.status === "paid") {
      return new Response("Invoice is already marked as paid.", { status: 400 });
    }

    // Simulate manual payment verification success
    const txId = generateId();
    const paymentRef = `MAN-REC-${Date.now()}`;

    // Mark invoice paid and zero out totalAmount to be consistent with all other payment paths
    await db
      .update(invoices)
      .set({ status: "paid", totalAmount: 0 })
      .where(eq(invoices.id, invoiceId));

    // Record successful transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceId: invoiceId,
      residentId: invoice.residentId,
      reference: paymentRef,
      amount: invoice.totalAmount,
      status: "success" as any,
      paymentMethod: "cash",
      cashStatus: "settled" as any,
      paidAt: new Date(),
    });

    const session = await auth(env.DB as any).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || orgId,
      action: "invoice.reconciled",
      entityType: "invoice",
      entityId: invoiceId,
      meta: JSON.stringify({ txId, reference: paymentRef }),
    });

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Invoice successfully reconciled and marked as paid.",
        transaction: { id: txId, reference: paymentRef },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
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

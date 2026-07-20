import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, transactions, auditLogs } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { generateId } from "@/lib/utils";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    // Only agents and operators can manually trigger verification
    await requireRole(req, env.DB, ["field_agent", "psp_operator"]);

    const rawBody = await req.json() as { reference?: string };
    const { reference } = rawBody; // Paystack transaction reference

    if (!reference) {
      return new Response("Missing Paystack reference.", { status: 400 });
    }

    const paystackSecret = env.PAYSTACK_SECRET_KEY;
    if (!paystackSecret) {
      throw new Error("Paystack secret key is missing from environment.");
    }

    // Ping Paystack to verify
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
      },
    });

    if (!verifyRes.ok) {
      return new Response("Failed to verify transaction with Paystack.", { status: 400 });
    }

    const verifyData = await verifyRes.json() as any;
    if (!verifyData.status || verifyData.data.status !== "success") {
      return new Response(JSON.stringify({ status: "failed", message: "Transaction is not successful on Paystack." }), { status: 400 });
    }

    const narration = verifyData.data.metadata?.custom_fields?.[0]?.value || verifyData.data.reference;
    // Extract paymentReference from narration using regex SZ-[A-Z0-9]+
    const match = narration.match(/SZ-[A-Z0-9]+/);
    const paymentRef = match ? match[0] : null;

    if (!paymentRef) {
      return new Response(JSON.stringify({ status: "failed", message: "No Saziate payment reference (SZ-...) found in transaction narration." }), { status: 400 });
    }

    // Find the invoice based on paymentRef
    const invoice = await db
      .select()
      .from(invoices)
      .where(like(invoices.paymentReference, `%${paymentRef}%`))
      .get();

    if (!invoice) {
      return new Response(JSON.stringify({ status: "failed", message: "Matching invoice not found for this reference." }), { status: 404 });
    }

    if (invoice.status === "paid") {
      return new Response(JSON.stringify({ status: "success", message: "Invoice is already paid." }), { status: 200 });
    }

    const txId = generateId();

    // Mark invoice paid
    await db
      .update(invoices)
      .set({ status: "paid" })
      .where(eq(invoices.id, invoice.id));

    // Insert transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceId: invoice.id,
      residentId: invoice.residentId,
      reference: verifyData.data.reference,
      amount: invoice.totalAmount, // or verifyData.data.amount / 100
      status: "success",
      paymentMethod: "bank_transfer",
      paidAt: new Date(),
    });

    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || "unknown", // could also get pspId if operator
      action: "invoice.reconciled",
      entityType: "invoice",
      entityId: invoice.id,
      meta: JSON.stringify({ txId, reference: verifyData.data.reference, method: "manual_verify" }),
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Transaction verified and invoice reconciled.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

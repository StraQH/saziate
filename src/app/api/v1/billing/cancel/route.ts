import { cancelInvoiceSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";

export const runtime = "edge";

export async function PATCH(req: Request) {
  const env = process.env as any;
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

    // Verify invoice belongs to PSP and is pending
    const existing = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.pspId, pspId)))
      .get();

    if (!existing) {
      return new Response("Invoice not found or unauthorized.", { status: 404 });
    }

    if (existing.status !== "pending" && existing.status !== "overdue") {
      return new Response(`Cannot cancel invoice with status ${existing.status}`, { status: 400 });
    }

    await db
      .update(invoices)
      .set({ status: "cancelled" })
      .where(eq(invoices.id, invoiceId));

    return new Response(JSON.stringify({ status: "success", message: "Invoice cancelled." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

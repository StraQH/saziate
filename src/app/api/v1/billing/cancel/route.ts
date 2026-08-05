export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, transactions, residentProfiles } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getActiveorgId, requireRole } from "@/lib/session";
import { generateId } from "@/lib/utils";
import { z } from "zod";


const cancelInvoiceSchema = z.object({
  invoiceId: z.string().min(1),
});

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = cancelInvoiceSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { invoiceId } = parsed.data;

    // Verify invoice belongs to Org and is pending
    const existing = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, orgId)))
      .get();

    if (!existing) {
      return new Response("Invoice not found or unauthorized.", { status: 404 });
    }

    if (existing.status !== "pending" && existing.status !== "overdue") {
      return new Response(`Cannot cancel invoice with status ${existing.status}`, { status: 400 });
    }

    // Calculate total refundable amount (advance_balance + bank_transfer + verified cash)
    const txs = await db
      .select({
        amount: transactions.amount,
        paymentMethod: transactions.paymentMethod,
        cashStatus: transactions.cashStatus,
      })
      .from(transactions)
      .where(and(eq(transactions.invoiceId, invoiceId), eq(transactions.status, "success")));

    let refundAmount = 0;
    for (const tx of txs) {
      if (tx.paymentMethod === "cash" && tx.cashStatus !== "verified" && tx.cashStatus !== "settled") {
        continue; // Unverified cash shouldn't be refunded to digital balance
      }
      refundAmount += tx.amount;
    }
    refundAmount = Math.round(refundAmount * 100) / 100;

    // Execute mutations inside a transaction block
    await db.transaction(async (tx) => {
      if (refundAmount > 0) {
        const profile = await tx
          .select()
          .from(residentProfiles)
          .where(eq(residentProfiles.userId, existing.residentId))
          .get();

        if (profile) {
          await tx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${refundAmount}` })
            .where(eq(residentProfiles.userId, profile.userId));
          
          await tx.insert(transactions).values({
            id: generateId(),
            residentId: profile.userId,
            reference: `REFUND-${Date.now()}-${generateId().slice(0, 4)}`,
            amount: refundAmount,
            status: "success" as any,
            paymentMethod: "advance_surplus",
            paidAt: new Date(),
          });
        }
      }

      await tx
        .update(invoices)
        .set({ status: "cancelled" })
        .where(eq(invoices.id, invoiceId));
    });

    return new Response(JSON.stringify({ status: "success" as any, message: "Invoice cancelled." }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Cancel Invoice Error:", error);
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

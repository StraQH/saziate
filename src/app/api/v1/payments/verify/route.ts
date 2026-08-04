export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, transactions, auditLogs, residentProfiles } from "@/db/schema";
import { eq, like, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { generateId } from "@/lib/utils";
import { z } from "zod";
import { MonnifyClient } from "@/lib/monnify";

const verifySchema = z.object({
  reference: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    // Only agents and operators can manually trigger verification
    await requireRole(req, env.DB as any, ["field_agent", "psp_operator"]);

    const rawBody = await req.json() as any;
    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { reference } = parsed.data;

    if (!env.MONNIFY_API_KEY || !env.MONNIFY_SECRET_KEY || !env.MONNIFY_CONTRACT_CODE) {
      throw new Error("Monnify configuration is missing from environment.");
    }

    let verifyData: any;
    try {
      const monnify = new MonnifyClient(env.MONNIFY_API_KEY, env.MONNIFY_SECRET_KEY, env.MONNIFY_CONTRACT_CODE);
      verifyData = await monnify.getTransactionStatus(reference);
    } catch (err: any) {
      return new Response("Failed to verify transaction with Monnify.", { status: 400 });
    }

    if (verifyData.paymentStatus !== "PAID") {
      return new Response(JSON.stringify({ status: "failed", message: "Transaction is not successful on Monnify." }), { status: 400 });
    }

    const narration = verifyData.paymentDescription || verifyData.paymentReference;
    const match = narration.match(/\b[a-f0-9]{10}\b/i);
    const paymentRef = match ? match[0] : null;

    if (!paymentRef) {
      return new Response(JSON.stringify({ status: "failed", message: "No secure payment reference found in transaction narration." }), { status: 400 });
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

    const amountInNaira = verifyData.amountPaid;
    const txId = generateId();

    // Perform database operations within a Drizzle transaction
    await db.transaction(async (tx) => {
      // 1. Insert transaction with EXACT amount from Monnify
      await tx.insert(transactions).values({
        id: txId,
        invoiceId: invoice.id,
        residentId: invoice.residentId,
        reference: verifyData.paymentReference,
        amount: amountInNaira,
        status: "success" as any,
        paymentMethod: "bank_transfer" as any,
        paidAt: new Date(),
      });

      if (invoice.status !== "paid") {
        if (amountInNaira >= invoice.totalAmount) {
          // Full Payment or Overpayment
          await tx
            .update(invoices)
            .set({ status: "paid", totalAmount: 0 })
            .where(eq(invoices.id, invoice.id));
          
          const surplus = Math.round((amountInNaira - invoice.totalAmount) * 100) / 100;
          if (surplus > 0) {
            const profile = await tx
              .select()
              .from(residentProfiles)
              .where(eq(residentProfiles.userId, invoice.residentId))
              .get();
              
            if (profile) {
              await tx
                .update(residentProfiles)
                .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${surplus}` })
                .where(eq(residentProfiles.userId, profile.userId));
                
              // Log secondary transaction for ledger balance
              await tx.insert(transactions).values({
                id: generateId(),
                residentId: profile.userId,
                reference: `${verifyData.paymentReference}-SURPLUS`,
                amount: surplus,
                status: "success" as any,
                paymentMethod: "advance_surplus",
                paidAt: new Date(),
              });
            }
          }
        } else {
          // Partial Payment - reduce total amount but keep it pending
          await tx
            .update(invoices)
            .set({ totalAmount: sql`${invoices.totalAmount} - ${amountInNaira}` })
            .where(eq(invoices.id, invoice.id));
        }
      } else {
        // Invoice is already paid! The ENTIRE amount goes to advance balance
        const profile = await tx
          .select()
          .from(residentProfiles)
          .where(eq(residentProfiles.userId, invoice.residentId))
          .get();
          
        if (profile) {
          await tx
            .update(residentProfiles)
            .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amountInNaira}` })
            .where(eq(residentProfiles.userId, profile.userId));
            
          // Log secondary transaction for ledger balance
          await tx.insert(transactions).values({
            id: generateId(),
            residentId: profile.userId,
            reference: `${verifyData.paymentReference}-SURPLUS`,
            amount: amountInNaira,
            status: "success" as any,
            paymentMethod: "advance_surplus",
            paidAt: new Date(),
          });
        }
      }

      const session = await auth(env.DB as any).api.getSession({ headers: req.headers });
      await tx.insert(auditLogs).values({
        id: generateId(),
        actorId: session?.user?.id || "unknown",
        action: "invoice.reconciled",
        entityType: "invoice",
        entityId: invoice.id,
        meta: JSON.stringify({ txId, reference: verifyData.paymentReference, method: "manual_verify" }),
      });
    });

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Transaction verified and invoice reconciled.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Verify Error:", error);
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

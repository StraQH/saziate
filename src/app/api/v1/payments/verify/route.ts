import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, transactions, auditLogs, residentProfiles } from "@/db/schema";
import { eq, like, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { generateId } from "@/lib/utils";
import { z } from "zod";


const verifySchema = z.object({
  reference: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    // Only agents and operators can manually trigger verification
    await requireRole(req, env.DB, ["field_agent", "psp_operator"]);

    const rawBody = await req.json();
    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { reference } = parsed.data;

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

    const amountInNaira = Math.round(verifyData.data.amount) / 100;
    const txId = generateId();

    // Perform database operations within a Drizzle transaction
    await db.transaction(async (tx: any) => {
      // 1. Insert transaction with EXACT amount from Paystack
      await tx.insert(transactions).values({
        id: txId,
        invoiceId: invoice.id,
        residentId: invoice.residentId,
        reference: verifyData.data.reference,
        amount: amountInNaira,
        status: "success",
        paymentMethod: "bank_transfer",
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
                reference: `${verifyData.data.reference}-SURPLUS`,
                amount: surplus,
                status: "success",
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
            reference: `${verifyData.data.reference}-SURPLUS`,
            amount: amountInNaira,
            status: "success",
            paymentMethod: "advance_surplus",
            paidAt: new Date(),
          });
        }
      }

      const session = await auth(env.DB).api.getSession({ headers: req.headers });
      await tx.insert(auditLogs).values({
        id: generateId(),
        actorId: session?.user?.id || "unknown",
        action: "invoice.reconciled",
        entityType: "invoice",
        entityId: invoice.id,
        meta: JSON.stringify({ txId, reference: verifyData.data.reference, method: "manual_verify" }),
      });
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
    console.error("Verify Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

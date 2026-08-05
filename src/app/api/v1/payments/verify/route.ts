export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, transactions, residentProfiles } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { z } from "zod";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";

const verifySchema = z.object({
  reference: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    // Only agents and operators can manually trigger verification
    await requireRole(req, env.DB as any, ["field_agent", "org_admin"]);

    const rawBody = await req.json() as any;
    const parsed = verifySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { reference } = parsed.data;

    if (config.isMockMode) {
      return new Response(JSON.stringify({ status: "success", message: "Transaction verified successfully in mock mode." }), { status: 200 });
    }

    let isSuccess = false;
    let amountInNaira = 0;
    let narration = reference;

    // 1. Try Paystack Verification
    if (env.PAYSTACK_SECRET_KEY) {
      try {
        const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
        const data = await paystack.verifyTransaction(reference);
        if (data && data.status === "success") {
          isSuccess = true;
          amountInNaira = Math.round((data.amount / 100) * 100) / 100;
          narration = data.metadata?.narration || data.reference || reference;
        }
      } catch (err) {
        console.error("Paystack transaction verification failed:", err);
      }
    }

    if (!isSuccess) {
      return new Response(JSON.stringify({ status: "failed", message: "Transaction verification failed or unpaid on gateway." }), { status: 400 });
    }

    const match = narration.match(/\b(SZ)?[A-Z0-9]{8,10}\b/i);
    const paymentRef = match ? match[0] : null;

    // Find matching invoice
    const invoice = paymentRef
      ? await db.select().from(invoices).where(like(invoices.paymentReference, `%${paymentRef}%`)).get()
      : null;

    if (!invoice) {
      return new Response(JSON.stringify({ status: "failed", message: "Matching invoice not found for reference." }), { status: 404 });
    }

    const txId = generateId();

    // Perform database operations within a transaction
    await db.transaction(async (tx) => {
      await tx.insert(transactions).values({
        id: txId,
        invoiceId: invoice.id,
        residentId: invoice.residentId,
        reference: reference,
        amount: amountInNaira,
        status: "success" as any,
        paymentMethod: "bank_transfer" as any,
        paidAt: new Date(),
      });

      if (invoice.status !== "paid") {
        if (amountInNaira >= invoice.totalAmount) {
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
                .set({ advancePaymentBalance: Math.round(((profile.advancePaymentBalance || 0) + surplus) * 100) / 100 })
                .where(eq(residentProfiles.userId, profile.userId));
                
              await tx.insert(transactions).values({
                id: generateId(),
                residentId: profile.userId,
                reference: `${reference}-SURPLUS`,
                amount: surplus,
                status: "success" as any,
                paymentMethod: "advance_surplus",
                paidAt: new Date(),
              });
            }
          }
        } else {
          await tx
            .update(invoices)
            .set({ totalAmount: Math.round((invoice.totalAmount - amountInNaira) * 100) / 100 })
            .where(eq(invoices.id, invoice.id));
        }
      }
    });

    return new Response(JSON.stringify({ status: "success", amountPaid: amountInNaira, reference }), { status: 200 });
  } catch (error: any) {
    console.error("Verification Error:", error);
    return new Response(`Verification process failed: ${error.message}`, { status: 500 });
  }
}

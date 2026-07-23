import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, transactions, auditLogs, residentProfiles } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { generateId } from "@/lib/utils";



export async function POST(req: Request) {
  const env = getAppEnv() as any;
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
    // Extract paymentReference from narration using regex for 10-char hex string
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

    const amountInNaira = verifyData.data.amount / 100;

    const txId = generateId();

    // Insert transaction with EXACT amount from Paystack
    await db.insert(transactions).values({
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
        await db
          .update(invoices)
          .set({ status: "paid" })
          .where(eq(invoices.id, invoice.id));
        
        const surplus = amountInNaira - invoice.totalAmount;
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
              
            // Log secondary transaction for ledger balance
            await db.insert(transactions).values({
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
        await db
          .update(invoices)
          .set({ totalAmount: invoice.totalAmount - amountInNaira })
          .where(eq(invoices.id, invoice.id));
      }
    } else {
      // Invoice is already paid! The ENTIRE amount goes to advance balance
      const profile = await db
        .select()
        .from(residentProfiles)
        .where(eq(residentProfiles.userId, invoice.residentId))
        .get();
        
      if (profile) {
        await db
          .update(residentProfiles)
          .set({ advancePaymentBalance: (profile.advancePaymentBalance || 0) + amountInNaira })
          .where(eq(residentProfiles.userId, profile.userId));
          
        // Log secondary transaction for ledger balance
        await db.insert(transactions).values({
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

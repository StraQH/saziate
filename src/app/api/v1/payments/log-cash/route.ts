import { MOCK_AGENT_ID } from "@/lib/mockdata";
import { requireRole } from "@/lib/session";
import { logCashSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { transactions, invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { config } from "@/lib/config";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["field_agent", "psp_operator"]);
    let actorId = "";
    if (config.isMockMode) {
      actorId = MOCK_AGENT_ID;
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      actorId = session.user.id;
    }

    const rawBody = await req.json();
    const parsed = logCashSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { invoiceId, residentId, amount } = body;

    if (!invoiceId || !residentId || !amount) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Verify invoice status
    const inv = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .get();

    if (!inv) {
      return new Response("Invoice not found.", { status: 404 });
    }

    if (inv.status === "paid") {
      return new Response("Invoice already marked paid.", { status: 400 });
    }

    const txId = generateId();
    const cashRef = `CASH-REC-${Date.now()}`;

    // Insert cash transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceId,
      residentId,
      reference: cashRef,
      amount: typeof amount === "number" ? amount : parseFloat(amount),
      status: "success",
      paymentMethod: "cash",
      cashStatus: "pending_cash_verification",
      loggedById: actorId,
      paidAt: new Date(),
    });

    // NOTE: We do NOT mark the invoice as "paid" here. 
    // The PSP Operator must physically verify the cash first.

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Cash payment logged successfully.",
        transactionId: txId,
        reference: cashRef,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

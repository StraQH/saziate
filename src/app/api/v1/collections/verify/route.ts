import { collectionVerifySchema } from "@/lib/validators";
import { getDb } from "@/db";
import { transactions, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";

export const runtime = "edge";

export async function PUT(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { transactionId, status } = await req.json() as {
      transactionId: string;
      status: "collected" | "pending_cash_verification" | "verified" | "settled";
    };

    if (!transactionId || !status) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Verify transaction owner (resident is under the PSP)
    const tx = await db
      .select({
        id: transactions.id,
        paymentMethod: transactions.paymentMethod,
        pspId: users.pspId,
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.residentId, users.id))
      .where(and(eq(transactions.id, transactionId), eq(users.pspId, pspId)))
      .get();

    if (!tx) {
      return new Response("Transaction not found or unauthorized.", { status: 404 });
    }

    if (tx.paymentMethod !== "cash") {
      return new Response("Can only verify cash transaction status flows.", { status: 400 });
    }

    await db
      .update(transactions)
      .set({ cashStatus: status })
      .where(eq(transactions.id, transactionId));

    return new Response(
      JSON.stringify({
        status: "success",
        message: `Cash transaction status advanced to ${status}.`,
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

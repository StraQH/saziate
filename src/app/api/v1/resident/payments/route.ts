import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { transactions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";

export const runtime = "edge";

export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
    }

    if (config.isMockMode) {
      // Mock payments list matching Babajide Sanwo r1
      return new Response(
        JSON.stringify([
          {
            id: "tx-001",
            reference: "PAYSTACK-9902341",
            amount: 6300,
            status: "success",
            paymentMethod: "bank_transfer",
            paidAt: "26 Jun 2026",
          },
          {
            id: "tx-002",
            reference: "CASH-29104",
            amount: 6300,
            status: "success",
            paymentMethod: "cash",
            paidAt: "25 May 2026",
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Query transactions from D1
    const results = await db
      .select()
      .from(transactions)
      .where(eq(transactions.residentId, residentId))
      .orderBy(transactions.createdAt)
      .all();

    const formatted = results.map((tx: any) => ({
      id: tx.id,
      reference: tx.reference,
      amount: tx.amount,
      status: tx.status,
      paymentMethod: tx.paymentMethod,
      paidAt: tx.paidAt ? new Date(tx.paidAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Pending confirmation",
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

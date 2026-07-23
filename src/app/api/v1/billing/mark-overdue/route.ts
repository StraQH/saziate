import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { and, lt, eq } from "drizzle-orm";
import { config } from "@/lib/config";



export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!config.isMockMode) {
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized cron trigger.", { status: 401 });
      }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalize to start of day

    // Query pending invoices that are past their due date
    const pendingInvoices = await db
      .select({ id: invoices.id, dueDate: invoices.dueDate })
      .from(invoices)
      .where(eq(invoices.status, "pending"))
      .all();

    const overdueInvoices = pendingInvoices.filter((inv: any) => new Date(inv.dueDate) < today);
    const ids = overdueInvoices.map((inv: any) => inv.id);

    if (ids.length > 0) {
      for (const id of ids) {
        await db.update(invoices).set({ status: "overdue" }).where(eq(invoices.id, id));
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        updatedCount: ids.length,
        updatedInvoiceIds: ids,
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

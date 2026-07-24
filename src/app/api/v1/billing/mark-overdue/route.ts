import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { and, lt, eq } from "drizzle-orm";
import { config } from "@/lib/config";


export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!config.isMockMode) {
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized cron trigger.", { status: 401 });
      }
    }

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); // Normalize to start of day in UTC

    // Optimized: Single SQL statement instead of sequential loop N+1 updates
    await db
      .update(invoices)
      .set({ status: "overdue" })
      .where(
        and(
          eq(invoices.status, "pending"),
          lt(invoices.dueDate, today)
        )
      );

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Overdue invoices processed successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Mark Overdue Invoices Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { and, lt, eq } from "drizzle-orm";
import { config } from "@/lib/config";


export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

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
        status: "success" as any,
        message: "Overdue invoices processed successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Mark Overdue Invoices Error:", error);
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

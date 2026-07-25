import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/session";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);

    // Calculate total platform volume (sum of paid invoices total amount)
    const paidInvoicesVolume = await db
      .select({ total: sql<number>`SUM(${invoices.totalAmount})` })
      .from(invoices)
      .where(eq(invoices.status, "paid"))
      .get();

    // Calculate Saziate revenue (sum of paid invoices platform fee)
    const platformFeeRevenue = await db
      .select({ total: sql<number>`SUM(${invoices.platformFee})` })
      .from(invoices)
      .where(eq(invoices.status, "paid"))
      .get();

    const totalPlatformVolume = paidInvoicesVolume?.total || 0;
    const saziateRevenue = platformFeeRevenue?.total || 0;

    return new Response(JSON.stringify({
      totalPlatformVolume,
      saziateRevenue
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Admin Metrics error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, transactions, residentProfiles, psps, users } from "@/db/schema";
import { eq, sql, and, notLike, isNotNull, isNull, like, inArray } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["admin"]);

    // Total platform volume = sum of all successful bank_transfer transactions (resident payments)
    // Cannot use invoices.totalAmount because it is zeroed out when invoices are marked paid.
    const txVolume = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .where(and(
        eq(transactions.paymentMethod, "bank_transfer"),
        eq(transactions.status, "success"),
        notLike(transactions.reference, "PAYOUT-%")
      ))
      .get();

    // Saziate revenue = sum of platformFee from all paid invoices (this field is NOT zeroed out)
    const platformFeeRevenue = await db
      .select({ total: sql<number>`SUM(${invoices.platformFee})` })
      .from(invoices)
      .where(eq(invoices.status, "paid"))
      .get();

    // Total advance held
    const advanceHeld = await db
      .select({ total: sql<number>`SUM(${residentProfiles.advancePaymentBalance})` })
      .from(residentProfiles)
      .get();

    // PSP counts
    const activePsps = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(psps)
      .where(isNotNull(psps.dvaAccountNumber))
      .get();
      
    const pendingPsps = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(psps)
      .where(isNull(psps.dvaAccountNumber))
      .get();

    // Resident count
    const totalResidents = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.role, "resident"))
      .get();

    // Payouts owed = total digital volume - saziate fees - payouts already made (simple approximation for admin dashboard)
    // We get actual total digital volume without fees:
    const totalDigitalVolume = txVolume?.total || 0;
    const saziateRev = platformFeeRevenue?.total || 0;
    
    // Get total paid out
    const payoutsMade = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .where(and(
        like(transactions.reference, "PAYOUT-%"),
        inArray(transactions.status, ["initiated", "success"])
      ))
      .get();
      
    const totalPaidOut = payoutsMade?.total || 0;
    // Approximation: what's owed is roughly what came in minus Saziate's fee minus what was paid out
    // Since platform fee is taken on top of invoices, and PSP gets collections / 1.05.
    const totalPlatformVolume = totalDigitalVolume;
    const saziateRevenue = saziateRev;
    const totalAdvanceHeld = advanceHeld?.total || 0;
    
    // A slightly more accurate calculation of what is owed to PSPs overall:
    const totalPspPayoutsOwed = Math.max(0, (totalDigitalVolume / config.PLATFORM_FEE_DIVISOR) - totalPaidOut);
    
    const activePspCount = activePsps?.count || 0;
    const pendingPspCount = pendingPsps?.count || 0;
    const totalResidentCount = totalResidents?.count || 0;

    return new Response(JSON.stringify({
      totalPlatformVolume,
      saziateRevenue,
      totalAdvanceHeld,
      totalPspPayoutsOwed,
      activePspCount,
      pendingPspCount,
      totalResidentCount
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Admin Metrics error:", error);
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

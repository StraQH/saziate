export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, fieldLogs, organizations, users, notificationLogs, transactions, zones  } from "@/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";
import { getActiveorgId, requireRole } from "@/lib/session";
import { config } from "@/lib/config";
export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Total payments received (count of paid invoices)
    const paidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")))
      .all();

    // Sum all digital (bank_transfer) payments made by residents of this PSP —
    // this is the ground-truth income figure. We can NOT use invoice.totalAmount
    // because it is zeroed out when an invoice is marked paid.
    const residentIds = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, "resident")))
      .all();
    const residentIdList = residentIds.map((u) => u.id);

    let totalDigitalCollections = 0;
    let totalCashCollections = 0;
    let invoicePaidDates: { createdAt: number }[] = [];

    if (residentIdList.length > 0) {
      // Digital (bank transfer) income
      const digitalTxs = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(users.orgId, orgId),
          eq(users.role, "resident"),
          eq(transactions.paymentMethod, "bank_transfer"),
          eq(transactions.status, "success"),
          // Exclude payouts — same paymentMethod but are outflows, not income
          sql`${transactions.reference} NOT LIKE 'PAYOUT-%'`
        ))
        .all();
      totalDigitalCollections = digitalTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);

      // Verified/settled cash income
      const cashTxs = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .innerJoin(users, eq(transactions.residentId, users.id))
        .where(and(
          eq(users.orgId, orgId),
          eq(users.role, "resident"),
          eq(transactions.paymentMethod, "cash"),
          inArray(transactions.cashStatus, ["verified", "settled"])
        ))
        .all();
      totalCashCollections = cashTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);

      // Invoice creation dates for revenue trend chart
      const rawInvoices = await db
        .select({ createdAt: invoices.createdAt })
        .from(invoices)
        .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")))
        .all();
      invoicePaidDates = rawInvoices.map((x) => ({ createdAt: x.createdAt.getTime() }));
    }

    // PSP entitlement: Saziate keeps 5% on every collection
    const pspDigitalEntitlement = totalDigitalCollections / config.PLATFORM_FEE_DIVISOR;
    const saziateCashFee = totalCashCollections - (totalCashCollections / config.PLATFORM_FEE_DIVISOR);
    const totalPaidSum = Math.round((pspDigitalEntitlement + (totalCashCollections - saziateCashFee)) * 100) / 100;

    // Count unpaid invoices
    const unpaidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "pending")))
      .all();

    // Sum unpaid invoices amount
    const unpaidSums = await db
      .select({ total: invoices.totalAmount })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "pending")))
      .all();
    const totalUnpaidSum = unpaidSums.reduce((sum: number, inv) => sum + ((inv as any).total || 0), 0);

    // Count routes for this PSP
    const orgZones = await db
      .select({ id: zones.id })
      .from(zones)
      
      .where(eq(zones.orgId, orgId))
      .all();

    // Sum of manual and automatic payouts — now using dedicated orgId column
    const pastPayouts = await db
      .select({ amount: transactions.amount, status: transactions.status, paidAt: transactions.paidAt })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        like(transactions.reference, "PAYOUT-%")
      ))
      .all();

    const totalPaidOut = pastPayouts
      .filter((tx) => ["success", "initiated"].includes(tx.status))
      .reduce((sum: number, tx) => sum + (tx.amount || 0), 0);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const settledToday = pastPayouts
      .filter((tx) => {
        if (tx.status !== "success" || !tx.paidAt) return false;
        const pDate = new Date(tx.paidAt);
        return pDate.getTime() >= startOfToday.getTime();
      })
      .reduce((sum: number, tx) => sum + (tx.amount || 0), 0);

    // Sum of custom messaging SMS costs
    const notificationCosts = await db
      .select({ costNgn: notificationLogs.costNgn })
      .from(notificationLogs)
      .where(eq(notificationLogs.orgId, orgId))
      .all();
    const totalNotificationCosts = notificationCosts.reduce((sum: number, log) => sum + (log.costNgn || 0), 0);

    // Available = PSP's share of digital - PSP's cash fee already taken - payouts already made - notification costs
    const availableSettlement = Math.max(
      0,
      Math.round(
        ((totalDigitalCollections / config.PLATFORM_FEE_DIVISOR) - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100
      ) / 100
    );

    // residentUsers for count
    const residentUsers = residentIds;

    // Weekly collections logs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const weeklyLogs = await db
      .select({ loggedAt: fieldLogs.loggedAt })
      .from(fieldLogs)
      .innerJoin(zones, eq(fieldLogs.zoneId, zones.id))
      .where(and(
        eq(zones.orgId, orgId),
        sql`${fieldLogs.loggedAt} >= ${sevenDaysAgo.getTime()}`
      ))
      .all();

    // Group monthly revenue
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyRevMap: Record<string, number> = {};
    for (const m of monthNames) {
      monthlyRevMap[m] = 0;
    }
    for (const inv of invoicePaidDates) {
      const date = new Date((inv as any).createdAt);
      const mName = monthNames[date.getMonth()];
      monthlyRevMap[mName] += 1; // increment collection count per month
    }
    const revenueTrend = monthNames.map((m) => ({
      month: m,
      revenue: monthlyRevMap[m]
    }));

    // Group weekly collections
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dailyMap: Record<string, number> = {};
    for (const d of dayNames) {
      dailyMap[d] = 0;
    }
    for (const log of weeklyLogs) {
      const date = new Date(log.loggedAt);
      const dName = dayNames[date.getDay()];
      dailyMap[dName]++;
    }
    const weeklyCollections = dayNames.map((d) => ({
      day: d,
      collections: dailyMap[d]
    }));

    const metrics = [
      { label: "Collections This Month", value: `₦${totalPaidSum.toLocaleString("en-NG")}` },
      { label: "Settled Today",          value: `₦${settledToday.toLocaleString("en-NG")}` },
      { label: "Available Settlement",   value: `₦${availableSettlement.toLocaleString("en-NG")}` }, // Less Saziate 5% commission and payouts/SMS costs
      { label: "Next Settlement Date",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }, // T+1
      { label: "Total Active Residents", value: residentUsers.length.toLocaleString() },
      { label: "Paid Invoices",          value: paidInvoices.length.toLocaleString() },
      { label: "Unpaid Invoices",        value: unpaidInvoices.length.toLocaleString() },
      { label: "Active Routes",          value: orgZones.length.toLocaleString() },
    ];

    const org = await db
      .select({ settlementAccountNumber: organizations.settlementAccountNumber })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();


    return new Response(JSON.stringify({ 
      metrics, 
      revenueTrend,
      weeklyCollections,
      raw: {
        totalPaidSum,
        totalUnpaidSum,
        settledToday,
        availableSettlement,
        totalActiveResidents: residentUsers.length,
        paidInvoicesCount: paidInvoices.length,
        unpaidInvoicesCount: unpaidInvoices.length,
        activeRoutesCount: orgZones.length,
        totalNotificationCosts
      }
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
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

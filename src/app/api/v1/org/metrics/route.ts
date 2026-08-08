export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, fieldLogs, organizations, users, notificationLogs, transactions, zones  } from "@/db/schema";
import { eq, and, like, inArray, sql, isNotNull, isNull } from "drizzle-orm";
import { getActiveorgId, requireRole } from "@/lib/session";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // 1. Total payments received (count of paid invoices)
    const paidInvoicesRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")))
      .get();
    const paidInvoicesCount = paidInvoicesRes?.count || 0;

    // 2. Total Digital Collections (SQL SUM)
    const digitalTxsRes = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .innerJoin(users, eq(transactions.residentId, users.id))
      .where(and(
        eq(users.orgId, orgId),
        eq(users.role, "resident"),
        eq(transactions.paymentMethod, "bank_transfer"),
        eq(transactions.status, "success"),
        sql`${transactions.reference} NOT LIKE 'PAYOUT-%'`
      ))
      .get();
    const totalDigitalCollections = digitalTxsRes?.total || 0;

    // 3. Total Cash Collections (SQL SUM)
    const cashTxsRes = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .innerJoin(users, eq(transactions.residentId, users.id))
      .where(and(
        eq(users.orgId, orgId),
        eq(users.role, "resident"),
        eq(transactions.paymentMethod, "cash"),
        inArray(transactions.cashStatus, ["verified", "settled"])
      ))
      .get();
    const totalCashCollections = cashTxsRes?.total || 0;

    // Invoice creation dates for revenue trend chart (limited for safety)
    const rawInvoices = await db
      .select({ createdAt: invoices.createdAt })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "paid")))
      .limit(1000)
      .all();
    const invoicePaidDates = rawInvoices.map((x) => ({ createdAt: x.createdAt.getTime() }));

    // PSP entitlement: Saziate keeps 10% on every collection
    const pspDigitalEntitlement = totalDigitalCollections / config.PLATFORM_FEE_DIVISOR;
    const saziateCashFee = totalCashCollections - (totalCashCollections / config.PLATFORM_FEE_DIVISOR);
    const totalPaidSum = Math.round((pspDigitalEntitlement + (totalCashCollections - saziateCashFee)) * 100) / 100;

    // 4. Count unpaid invoices
    const unpaidInvoicesRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "pending")))
      .get();
    const unpaidInvoicesCount = unpaidInvoicesRes?.count || 0;

    // 5. Sum unpaid invoices amount
    const unpaidSumsRes = await db
      .select({ total: sql<number>`SUM(${invoices.totalAmount})` })
      .from(invoices)
      .where(and(eq(invoices.orgId, orgId), eq(invoices.status, "pending")))
      .get();
    const totalUnpaidSum = unpaidSumsRes?.total || 0;

    // Count routes for this PSP
    const orgZonesRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(zones)
      .where(eq(zones.orgId, orgId))
      .get();
    const orgZonesCount = orgZonesRes?.count || 0;

    // 6. Total Paid Out
    const totalPaidOutRes = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        like(transactions.reference, "PAYOUT-%"),
        inArray(transactions.status, ["success", "initiated"])
      ))
      .get();
    const totalPaidOut = totalPaidOutRes?.total || 0;

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const settledTodayRes = await db
      .select({ total: sql<number>`SUM(${transactions.amount})` })
      .from(transactions)
      .where(and(
        eq(transactions.orgId, orgId),
        like(transactions.reference, "PAYOUT-%"),
        eq(transactions.status, "success"),
        sql`${transactions.paidAt} >= ${startOfToday.getTime()}`
      ))
      .get();
    const settledToday = settledTodayRes?.total || 0;

    // 7. Notification Costs
    const notificationCostsRes = await db
      .select({ total: sql<number>`SUM(${notificationLogs.costNgn})` })
      .from(notificationLogs)
      .where(eq(notificationLogs.orgId, orgId))
      .get();
    const totalNotificationCosts = notificationCostsRes?.total || 0;

    // Available = PSP's share of digital - PSP's cash fee already taken - payouts already made - notification costs
    const availableSettlement = Math.max(
      0,
      Math.round(
        ((totalDigitalCollections / config.PLATFORM_FEE_DIVISOR) - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100
      ) / 100
    );

    // 8. Resident Users
    const residentUsersRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(and(eq(users.orgId, orgId), eq(users.role, "resident")))
      .get();
    const residentUsersCount = residentUsersRes?.count || 0;

    // 9. Weekly collections logs (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    const weeklyLogsRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fieldLogs)
      .innerJoin(zones, eq(fieldLogs.zoneId, zones.id))
      .where(and(
        eq(zones.orgId, orgId),
        sql`${fieldLogs.loggedAt} >= ${sevenDaysAgo.getTime()}`
      ))
      .get();
    const serviceRunsThisWeek = weeklyLogsRes?.count || 0;

    // Determine readiness
    const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).get();
    const isReady = org && org.settlementAccountNumber ? true : false;
    const minPayoutThreshold = config.locality.autoPayoutMinimum || 1000;

    return new Response(
      JSON.stringify({
        orgId,
        totalPaidSum,
        totalUnpaidSum,
        unpaidInvoices: unpaidInvoicesCount,
        paidInvoices: paidInvoicesCount,
        residentUsers: residentUsersCount,
        invoicePaidDates, // Returning max 1000 for frontend rendering
        routesCount: orgZonesCount,
        serviceRunsThisWeek,
        availableSettlement,
        isReadyForPayout: isReady,
        totalPaidOut,
        settledToday,
        settlementStatusMessage: !isReady 
          ? "Awaiting bank details verification." 
          : availableSettlement < minPayoutThreshold
            ? `Available balance is below minimum payout threshold of ${config.locality.symbol}${minPayoutThreshold}.`
            : "Available for T+1 settlement via Paystack.",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("GET Org Metrics Error:", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

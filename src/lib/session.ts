import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { MOCK_ORG_ID } from "./mockdata";
import { getDb, type Db } from "@/db";
import { users, transactions, notificationLogs } from "@/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";

/**
 * Retrieve active session and verify associated tenant orgId.
 * Fallbacks to mock operator metadata when NEXT_PUBLIC_MOCK_MODE is enabled.
 */
export async function getActiveorgId(req: Request, dbBinding: D1Database): Promise<string | null> {
  if (config.isMockMode) {
    return MOCK_ORG_ID;
  }

  try {
    const betterAuth = auth(dbBinding);
    const session = await betterAuth.api.getSession({
      headers: req.headers,
    });

    return (session?.user as { role?: string, orgId?: string })?.orgId || null;
  } catch (err) {
    console.error("Session retrieval error:", err);
    return null;
  }
}

/**
 * Validates the session and ensures the user has one of the allowed roles.
 * Returns the session object if valid, otherwise throws an Error.
 */
export async function requireRole(req: Request, dbBinding: D1Database, allowedRoles: string[]) {
  if (config.isMockMode) {
    return { user: { role: allowedRoles[0], id: "mock_user", orgId: MOCK_ORG_ID } };
  }

  const betterAuth = auth(dbBinding);
  const session = await betterAuth.api.getSession({
    headers: req.headers,
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const userRole = (session.user as { role?: string, orgId?: string }).role as string;
  
  if (!allowedRoles.includes(userRole)) {
    throw new Error("Forbidden");
  }

  if (userRole === "org_admin") {
    const orgId = (session.user as { role?: string, orgId?: string }).orgId;
    if (!orgId) {
      throw new Error("Forbidden");
    }
  }

  return session;
}

export async function getOrgAvailableBalance(db: Db, orgId: string): Promise<number> {
  if (config.isMockMode) {
    return 380000.00; // Mock balance NGN 380k
  }

  // Get all resident IDs for this Org
  const residentRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, orgId), eq(users.role, "resident")))
    .all();
  const residentIdList = residentRows.map((u) => u.id);

  let totalDigitalRevenue = 0;
  let totalCashRevenue = 0;

  if (residentIdList.length > 0) {
    const digitalTxs = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(and(
        inArray(transactions.residentId, residentIdList),
        eq(transactions.paymentMethod, "bank_transfer"),
        eq(transactions.status, "success"),
        sql`${transactions.reference} NOT LIKE 'PAYOUT-%'`
      ))
      .all();
    totalDigitalRevenue = digitalTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);

    const cashTxs = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(and(
        inArray(transactions.residentId, residentIdList),
        eq(transactions.paymentMethod, "cash"),
        inArray(transactions.cashStatus, ["verified", "settled"])
      ))
      .all();
    totalCashRevenue = cashTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);
  }

  const saziateCashFee = totalCashRevenue - (totalCashRevenue / config.PLATFORM_FEE_DIVISOR);

  const pastPayouts = await db
    .select({ amount: transactions.amount, status: transactions.status })
    .from(transactions)
    .where(and(
      eq(transactions.orgId, orgId),
      like(transactions.reference, "PAYOUT-%")
    ))
    .all();
  const totalPaidOut = pastPayouts
    .filter((tx) => ["success", "initiated"].includes(tx.status))
    .reduce((sum: number, tx) => sum + (tx.amount || 0), 0);

  const notificationCostRows = await db
    .select({ costNgn: notificationLogs.costNgn })
    .from(notificationLogs)
    .where(eq(notificationLogs.orgId, orgId))
    .all();
  const totalNotificationCosts = notificationCostRows.reduce((sum: number, log) => sum + (log.costNgn || 0), 0);

  const available = Math.round(
    ((totalDigitalRevenue / config.PLATFORM_FEE_DIVISOR) - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100
  ) / 100;
  return Math.max(0, available);
}

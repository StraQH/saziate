import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { MOCK_PSP_ID } from "./mockdata";
import { getDb, type Db } from "@/db";
import { users, transactions, notificationLogs } from "@/db/schema";
import { eq, and, like, inArray, sql } from "drizzle-orm";

/**
 * Retrieve active session and verify associated tenant pspId.
 * Fallbacks to mock operator metadata when NEXT_PUBLIC_MOCK_MODE is enabled.
 */
export async function getActivePspId(req: Request, dbBinding: D1Database): Promise<string | null> {
  if (config.isMockMode) {
    return MOCK_PSP_ID;
  }

  try {
    const betterAuth = auth(dbBinding);
    const session = await betterAuth.api.getSession({
      headers: req.headers,
    });

    return (session?.user as { role?: string, pspId?: string })?.pspId || null;
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
    return { user: { role: allowedRoles[0], id: "mock_user", pspId: MOCK_PSP_ID } };
  }

  const betterAuth = auth(dbBinding);
  const session = await betterAuth.api.getSession({
    headers: req.headers,
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const userRole = (session.user as { role?: string, pspId?: string }).role as string;
  
  if (!allowedRoles.includes(userRole)) {
    throw new Error("Forbidden");
  }

  if (userRole === "psp_operator") {
    const pspId = (session.user as { role?: string, pspId?: string }).pspId;
    if (!pspId) {
      throw new Error("Forbidden");
    }
  }

  return session;
}

export async function getPspAvailableBalance(db: Db, pspId: string): Promise<number> {
  if (config.isMockMode) {
    return 380000.00; // Mock balance NGN 380k
  }

  // Get all resident IDs for this PSP
  const residentRows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.pspId, pspId), eq(users.role, "resident")))
    .all();
  const residentIdList = residentRows.map((u) => u.id);

  let totalDigitalCollections = 0;
  let totalCashCollections = 0;

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
    totalDigitalCollections = digitalTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);

    const cashTxs = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(and(
        inArray(transactions.residentId, residentIdList),
        eq(transactions.paymentMethod, "cash"),
        inArray(transactions.cashStatus, ["verified", "settled"])
      ))
      .all();
    totalCashCollections = cashTxs.reduce((sum: number, t) => sum + (t.amount || 0), 0);
  }

  const saziateCashFee = totalCashCollections - (totalCashCollections / config.PLATFORM_FEE_DIVISOR);

  const pastPayouts = await db
    .select({ amount: transactions.amount, status: transactions.status })
    .from(transactions)
    .where(and(
      eq(transactions.pspId, pspId),
      like(transactions.reference, "PAYOUT-%")
    ))
    .all();
  const totalPaidOut = pastPayouts
    .filter((tx) => ["success", "initiated"].includes(tx.status))
    .reduce((sum: number, tx) => sum + (tx.amount || 0), 0);

  const notificationCostRows = await db
    .select({ costNgn: notificationLogs.costNgn })
    .from(notificationLogs)
    .where(eq(notificationLogs.pspId, pspId))
    .all();
  const totalNotificationCosts = notificationCostRows.reduce((sum: number, log) => sum + (log.costNgn || 0), 0);

  const available = Math.round(
    ((totalDigitalCollections / config.PLATFORM_FEE_DIVISOR) - saziateCashFee - totalPaidOut - totalNotificationCosts) * 100
  ) / 100;
  return Math.max(0, available);
}

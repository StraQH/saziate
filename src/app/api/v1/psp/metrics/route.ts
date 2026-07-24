export const runtime = "edge";
﻿import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, collectionLogs, psps, users, notificationLogs, transactions, routes } from "@/db/schema";
import { eq, and, like } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Total payments received (count of paid invoices)
    const paidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.pspId, pspId), eq(invoices.status, "paid")));

    // Sum total paid amount
    const paidSums = await db
      .select({ total: invoices.totalAmount })
      .from(invoices)
      .where(and(eq(invoices.pspId, pspId), eq(invoices.status, "paid")));
      
    // Count unpaid invoices
    const unpaidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.pspId, pspId), eq(invoices.status, "pending")));

    // Count residents for this PSP
    const residentUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pspId, pspId), eq(users.role, "resident")));
      
    // Count routes for this PSP
    const pspRoutes = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.pspId, pspId));

    const totalPaidSum = paidSums.reduce((sum: number, inv: any) => sum + inv.total, 0);

    // Sum of manual and automatic payouts
    const pastPayouts = await db
      .select({ amount: transactions.amount })
      .from(transactions)
      .where(and(
        eq(transactions.residentId, pspId), // reusing residentId
        like(transactions.reference, "PAYOUT-%")
      ));
    const totalPaidOut = pastPayouts.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0);

    // Sum of custom messaging SMS costs
    const notificationCosts = await db
      .select({ costNgn: notificationLogs.costNgn })
      .from(notificationLogs)
      .where(eq(notificationLogs.pspId, pspId));
    const totalNotificationCosts = notificationCosts.reduce((sum: number, log: any) => sum + (log.costNgn || 0), 0);

    const availableSettlement = Math.max(0, (totalPaidSum * 0.95) - totalPaidOut - totalNotificationCosts);

    const metrics = [
      { label: "Collections This Month", value: `₦${totalPaidSum.toLocaleString("en-NG")}` },
      { label: "Settled Today",          value: "₦0" },
      { label: "Available Settlement",   value: `₦${availableSettlement.toLocaleString("en-NG")}` }, // Less Saziate 5% commission and payouts/SMS costs
      { label: "Next Settlement Date",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }, // T+1
      { label: "Total Active Residents", value: residentUsers.length.toLocaleString() },
      { label: "Paid Invoices",          value: paidInvoices.length.toLocaleString() },
      { label: "Unpaid Invoices",        value: unpaidInvoices.length.toLocaleString() },
      { label: "Active Routes",          value: pspRoutes.length.toLocaleString() },
    ];

    return new Response(JSON.stringify({ metrics }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

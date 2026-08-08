export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { organizations, transactions, notificationLogs, users, residentProfiles } from "@/db/schema";
import { eq, and, sql, isNotNull, inArray, like } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;

  // Basic security check: require CRON_SECRET unless mock mode
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB as any);

  try {
    // 1. Fetch all organizations with valid NIBSS settlement account details
    const orgs = await db
      .select()
      .from(organizations)
      .where(
        and(
          isNotNull(organizations.settlementAccountNumber),
          isNotNull(organizations.settlementBankCode)
        )
      )
      .all();

    if (orgs.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "No eligible organizations with bank details found." }), { status: 200 });
    }

    let sweptCount = 0;
    let totalAmountSwept = 0;
    const sweepResults: any[] = [];

    const paystack = env.PAYSTACK_SECRET_KEY ? new PaystackClient(env.PAYSTACK_SECRET_KEY) : null;

    for (const org of orgs) {
      if (!org.settlementAccountNumber || !org.settlementBankCode) continue;

      // Calculate total digital inflow for this org
      const residents = await db
        .select({ id: users.id })
        .from(users)
        .where(and(eq(users.orgId, org.id), eq(users.role, "resident")))
        .all();

      const residentIdList = residents.map((r) => r.id);
      if (residentIdList.length === 0) continue;

      const digitalTxs = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            inArray(transactions.residentId, residentIdList),
            eq(transactions.paymentMethod, "bank_transfer"),
            eq(transactions.status, "success")
          )
        )
        .all();

      const totalDigitalRevenue = digitalTxs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
      const grossEarnedNet = Math.round((totalDigitalRevenue / config.PLATFORM_FEE_DIVISOR) * 100) / 100;

      // Subtract cash fees, past payouts, and notification costs
      const pastPayouts = await db
        .select({ amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            eq(transactions.orgId, org.id),
            like(transactions.reference, "PAYOUT-%"),
            inArray(transactions.status, ["success", "initiated"])
          )
        )
        .all();

      const totalPaidOut = pastPayouts.reduce((sum, tx) => sum + (tx.amount || 0), 0);

      const notificationCostRows = await db
        .select({ costNgn: notificationLogs.costNgn })
        .from(notificationLogs)
        .where(eq(notificationLogs.orgId, org.id))
        .all();

      const totalNotificationCosts = notificationCostRows.reduce((sum, log) => sum + (log.costNgn || 0), 0);

      const availablePayout = Math.round((grossEarnedNet - totalPaidOut - totalNotificationCosts) * 100) / 100;

      const minPayoutThreshold = config.locality.autoPayoutMinimum || 1000;

      if (availablePayout >= minPayoutThreshold) {
        const dateStr = new Date().toISOString().split('T')[0];
        const payoutReference = `PAYOUT-${org.id.slice(0, 8)}-${dateStr}`;

        if (config.isMockMode || !paystack) {
          // Log mock payout transaction
          await db.insert(transactions).values({
            id: generateId(),
            orgId: org.id,
            residentId: residentIdList[0],
            amount: availablePayout,
            reference: payoutReference,
            paymentMethod: "bank_transfer",
            status: "success" as any,
            paidAt: new Date(),
          });

          sweptCount++;
          totalAmountSwept += availablePayout;
          sweepResults.push({ orgId: org.id, orgName: org.name, amount: availablePayout, mode: "mock" });
        } else {
          try {
            // 1. Create transfer recipient via Paystack
            const recipient = await paystack.createTransferRecipient({
              name: org.name,
              accountNumber: org.settlementAccountNumber,
              bankCode: org.settlementBankCode,
            });

            // 2. Initiate transfer via Paystack Single Disbursement API
            const transfer = await paystack.initiateTransfer({
              amount: availablePayout,
              recipientCode: recipient.recipient_code,
              reference: payoutReference,
              reason: `Saziate Daily T+1 Settlement Payout - ${org.name}`,
            });

            await db.insert(transactions).values({
              id: generateId(),
              orgId: org.id,
              residentId: residentIdList[0],
              amount: availablePayout,
              reference: payoutReference,
              paymentMethod: "bank_transfer",
              status: "initiated" as any,
              paidAt: new Date(),
            });

            sweptCount++;
            totalAmountSwept += availablePayout;
            sweepResults.push({ orgId: org.id, orgName: org.name, amount: availablePayout, mode: "live", transferCode: transfer.transfer_code });
          } catch (paystackErr: any) {
            console.error(`Paystack automated payout failed for org ${org.id}:`, paystackErr);
            sweepResults.push({ orgId: org.id, orgName: org.name, amount: availablePayout, status: "error", message: paystackErr.message });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        sweptOrganizations: sweptCount,
        totalAmountDisbursed: totalAmountSwept,
        results: sweepResults,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("T+1 Payout Sweep Cron Failed:", error);
    return new Response(JSON.stringify({ status: "error", message: error.message }), { status: 500 });
  }
}

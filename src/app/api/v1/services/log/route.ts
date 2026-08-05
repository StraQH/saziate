export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { MOCK_AGENT_ID } from "@/lib/mockdata";
import { requireRole } from "@/lib/session";
import { serviceLogSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { fieldLogs, users, zones, zoneResidents, residentProfiles, invoices, transactions, pendingNotifications, organizations } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { config } from "@/lib/config";
import { emailTemplates } from "@/lib/email-templates";

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["field_agent"]);
    let actorId = "";
    if (config.isMockMode) {
      actorId = MOCK_AGENT_ID;
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      actorId = session.user.id;
    }

    const rawBody = await req.json() as any;
    const parsed = serviceLogSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { zoneId, residentId, status, notes, imageUrl, loggedAt, metrics } = body;

    if (!zoneId || !residentId || !status) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Ensure the zone is assigned to the current field agent
    const zone = await db
      .select()
      .from(zones)
      .where(eq(zones.id, zoneId))
      .get();

    if (!zone) {
      return new Response("Zone not found.", { status: 404 });
    }

    if (zone.assignedAgentId !== actorId) {
      return new Response("Unauthorized to log services for this zone.", { status: 403 });
    }

    const org = await db
      .select({ serviceType: organizations.serviceType })
      .from(organizations)
      .where(eq(organizations.id, zone.orgId))
      .get();
    const st = org?.serviceType || "utility";

    // Ensure the resident is actually assigned to this zone
    const residentMapping = await db
      .select()
      .from(zoneResidents)
      .where(and(eq(zoneResidents.zoneId, zoneId), eq(zoneResidents.residentId, residentId)))
      .get();

    if (!residentMapping) {
      return new Response("Resident is not assigned to this zone.", { status: 403 });
    }

    // 1. Fetch resident profile for billing checks
    const residentProfile = await db
      .select({
        userId: users.id,
        name: users.name,
        firstName: users.firstName,
        email: users.email,
        phone: users.phone,
        billingModel: residentProfiles.billingModel,
        onDemandUnit1Rate: residentProfiles.onDemandUnit1Rate,
        onDemandUnit2Rate: residentProfiles.onDemandUnit2Rate,
        advancePaymentBalance: residentProfiles.advancePaymentBalance,
      })
      .from(users)
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .where(eq(users.id, residentId))
      .get();



    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const existingLogsTodayCount = await db
      .select({ count: sql`COUNT(*)` })
      .from(fieldLogs)
      .where(
        and(
          eq(fieldLogs.zoneId, zoneId),
          sql`${fieldLogs.loggedAt} >= ${startOfToday.getTime()}`
        )
      )
      .get();

    const isFirstServiceOfToday = Number(existingLogsTodayCount?.count || 0) === 0;

    // 3. Process billing if resident is on-demand and we visited
    if (residentProfile && residentProfile.billingModel === "on_demand") {
      let baseAmount = 0;
      const unit1Rate = residentProfile.onDemandUnit1Rate || 0;
      const unit2Rate = residentProfile.onDemandUnit2Rate || 0;

      const unit1s = (metrics && metrics.unit1Count) ? metrics.unit1Count : 0;
      const unit2s = (metrics && metrics.unit2Count) ? metrics.unit2Count : 0;

      if (status === "completed") {
        baseAmount = (unit1s * unit1Rate) + (unit2s * unit2Rate);
      } else {
        baseAmount = 0;
      }

      if (baseAmount > 0) {
        const platformFee = Math.round(baseAmount * config.PLATFORM_FEE_RATE * 100) / 100;
        const totalAmount = baseAmount + platformFee;

        const advanceBalance = residentProfile.advancePaymentBalance || 0;
        let finalAmount = totalAmount;
        let invoiceStatus = "pending";
        let amountSettledFromAdvance = 0;
        let isFullySettled = false;
        let isPartiallySettled = false;
        let newWalletBalance = advanceBalance;

        if (advanceBalance >= totalAmount) {
          isFullySettled = true;
          amountSettledFromAdvance = totalAmount;
          invoiceStatus = "paid";
          newWalletBalance = Math.round((advanceBalance - totalAmount) * 100) / 100;
          finalAmount = 0;
        } else if (advanceBalance > 0) {
          isPartiallySettled = true;
          amountSettledFromAdvance = advanceBalance;
          invoiceStatus = "pending";
          newWalletBalance = 0;
          finalAmount = Math.round((totalAmount - advanceBalance) * 100) / 100;
        }

        const invoiceId = generateId();
        const paymentReference = generateSecureReference(8, "SZOD");
        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        currentMonthStart.setHours(0, 0, 0, 0);
        const currentMonthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0, 23, 59, 59, 999);
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + config.ONDEMAND_DUE_DAYS);

        // Wrap all billing mutations atomically to prevent partial state
        await db.transaction(async (billingTx) => {
          // Deduct from wallet balance
          await billingTx
            .update(residentProfiles)
            .set({ advancePaymentBalance: newWalletBalance })
            .where(eq(residentProfiles.userId, residentId));

          // Create on-demand invoice
          await billingTx.insert(invoices).values({
            id: invoiceId,
            residentId,
            orgId: zone.orgId,
            paymentReference,
            baseAmount,
            platformFee,
            totalAmount: finalAmount,
            status: invoiceStatus as any,
            dueDate,
            billingPeriodStart: currentMonthStart,
            billingPeriodEnd: currentMonthEnd,
          });

          // Record wallet deduction transaction
          if (amountSettledFromAdvance > 0) {
            await billingTx.insert(transactions).values({
              id: generateId() as any,
              invoiceId,
              residentId,
              reference: `ADV-SETTLE-${Date.now()}-${generateId().substring(0, 4)}`,
              amount: amountSettledFromAdvance,
              paymentMethod: "advance_balance",
              status: "success" as any,
              cashStatus: "settled" as any,
              paidAt: new Date(),
            });
          }
        });

        // Dispatch notifications
        const hasRealEmail = residentProfile.email && residentProfile.email.includes("@") && !residentProfile.email.endsWith("@saziate.com");
        const firstName = residentProfile.firstName || residentProfile.name.split(" ")[0];

        if (hasRealEmail) {
          let subject = "";
          let html = "";
          if (isFullySettled) {
            subject = `${st.charAt(0).toUpperCase() + st.slice(1)} Service Settled (Receipt)`;
            html = emailTemplates.invoiceReceipt(firstName, totalAmount, paymentReference, `ADV-SETTLE-${Date.now()}`, st);
          } else if (isPartiallySettled) {
            subject = `On-Demand ${st.charAt(0).toUpperCase() + st.slice(1)} Charge (Partial Payment)`;
            html = emailTemplates.partialAdvanceSettled(firstName, amountSettledFromAdvance, finalAmount);
          } else {
            subject = `On-Demand ${st.charAt(0).toUpperCase() + st.slice(1)} Invoice Ready`;
            html = emailTemplates.monthlyBill(
              firstName,
              paymentReference,
              totalAmount,
              dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
              st
            );
          }

          await db.insert(pendingNotifications).values({
            id: generateId() as any,
            orgId: zone.orgId,
            residentId,
            channel: "email",
            messageType: "due_invoice",
            recipientPhone: residentProfile.email!,
            messageText: JSON.stringify({ subject, html }),
          });
        } else if (residentProfile.phone) {
          let msg = "";
          if (isFullySettled) {
            msg = `Hello ${firstName}, a charge of \${config.locality.symbol}\${totalAmount} for your ${st} service today has been fully paid from your Saziate balance. Thank you!`;
          } else if (isPartiallySettled) {
            msg = `Hello ${firstName}, a charge of \${config.locality.symbol}\${totalAmount} was generated for your ${st} service today. \${config.locality.symbol}\${amountSettledFromAdvance} was paid from your wallet. Settle the remaining \${config.locality.symbol}\${finalAmount} at saziate.com. Ref: ${paymentReference}`;
          } else {
            msg = `Hello ${firstName}, a charge of \${config.locality.symbol}\${totalAmount} was generated for your ${st} service today. Please log in at saziate.com to pay this invoice. Ref: ${paymentReference}`;
          }

          await db.insert(pendingNotifications).values({
            id: generateId() as any,
            orgId: zone.orgId,
            residentId,
            channel: "sms",
            messageType: "due_invoice",
            recipientPhone: residentProfile.phone,
            messageText: msg,
          });
        }
      }
    }

    // 4. Log the service
    const logId = generateId();
    await db.insert(fieldLogs).values({
      id: logId,
      zoneId,
      residentId,
      loggedById: actorId,
      status,
      notes: notes || null,
      imageUrl: imageUrl || null,
      metrics: metrics || {},
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
    });

    // 5. Send Dispatch Alerts if this is the start of the zone
    if (isFirstServiceOfToday) {
      try {
        const zoneName = zone.name || "assigned zone";

        const zoneResidentsList = await db
          .select({
            id: users.id,
            name: users.name,
            firstName: users.firstName,
            email: users.email,
            phone: users.phone,
          })
          .from(zoneResidents)
          .innerJoin(users, eq(zoneResidents.residentId, users.id))
          .where(eq(zoneResidents.zoneId, zoneId))
          .all();

        const alertNotifications = [];
        for (const res of zoneResidentsList) {
          const hasEmail = res.email && res.email.includes("@") && !res.email.endsWith("@saziate.com");
          const rFirstName = res.firstName || res.name.split(" ")[0];

          if (hasEmail) {
            alertNotifications.push({
              id: generateId() as any,
              orgId: zone.orgId,
              residentId: res.id,
              channel: "email" as const,
              messageType: "setup",
              recipientPhone: res.email!,
              messageText: JSON.stringify({
                subject: `${st.charAt(0).toUpperCase() + st.slice(1)} Service Agent is On The Way!`,
                html: emailTemplates.zoneActive(rFirstName, zoneName, st),
              }),
            });
          } else if (res.phone) {
            alertNotifications.push({
              id: generateId() as any,
              orgId: zone.orgId,
              residentId: res.id,
              channel: "sms" as const,
              messageType: "setup",
              recipientPhone: res.phone,
              messageText: `Hello ${rFirstName}, the ${st} service agent is now active on your zone (${zoneName}) today. Please ensure your units are accessible!`,
            });
          }
        }

        if (alertNotifications.length > 0) {
          const chunkSize = 50;
          for (let i = 0; i < alertNotifications.length; i += chunkSize) {
            await db.insert(pendingNotifications).values(alertNotifications.slice(i, i + chunkSize));
          }
        }
      } catch (err) {
        console.error("Failed to queue start-zone alert notifications:", err);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Service log stored successfully.",
        logId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("POST service log error:", error);
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

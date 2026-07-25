import { getAppEnv } from "@/lib/env";
import { MOCK_AGENT_ID } from "@/lib/mockdata";
import { requireRole } from "@/lib/session";
import { collectionLogSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { collectionLogs, users, routes, routeResidents, residentProfiles, invoices, transactions, pendingNotifications } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { config } from "@/lib/config";
import { emailTemplates } from "@/lib/email-templates";

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["field_agent"]);
    let actorId = "";
    if (config.isMockMode) {
      actorId = MOCK_AGENT_ID;
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      actorId = session.user.id;
    }

    const rawBody = await req.json();
    const parsed = collectionLogSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { routeId, residentId, status, notes, imageUrl, loggedAt, binsCollected, drumsCollected } = body;

    if (!routeId || !residentId || !status) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Ensure the route is assigned to the current field agent
    const route = await db
      .select()
      .from(routes)
      .where(eq(routes.id, routeId))
      .get();

    if (!route) {
      return new Response("Route not found.", { status: 404 });
    }

    if (route.assignedAgentId !== actorId) {
      return new Response("Unauthorized to log collections for this route.", { status: 403 });
    }

    // Ensure the resident is actually assigned to this route
    const residentMapping = await db
      .select()
      .from(routeResidents)
      .where(and(eq(routeResidents.routeId, routeId), eq(routeResidents.residentId, residentId)))
      .get();

    if (!residentMapping) {
      return new Response("Resident is not assigned to this route.", { status: 403 });
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
        onDemandTripRate: residentProfiles.onDemandTripRate,
        onDemandBinRate: residentProfiles.onDemandBinRate,
        onDemandDrumRate: residentProfiles.onDemandDrumRate,
        advancePaymentBalance: residentProfiles.advancePaymentBalance,
      })
      .from(users)
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .where(eq(users.id, residentId))
      .get();

    // 2. Perform route start check before inserting log
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const existingLogsTodayCount = await db
      .select({ count: sql`COUNT(*)` })
      .from(collectionLogs)
      .where(
        and(
          eq(collectionLogs.routeId, routeId),
          sql`${collectionLogs.loggedAt} >= ${startOfToday.getTime()}`
        )
      )
      .get();

    const isFirstCollectionOfToday = Number(existingLogsTodayCount?.count || 0) === 0;

    // 3. Process billing if resident is on-demand and we visited
    if (residentProfile && residentProfile.billingModel === "on_demand") {
      let baseAmount = 0;
      const tripRate = residentProfile.onDemandTripRate || 0;
      const binRate = residentProfile.onDemandBinRate || 0;
      const drumRate = residentProfile.onDemandDrumRate || 0;
      const bins = binsCollected || 0;
      const drums = drumsCollected || 0;

      if (status === "collected") {
        baseAmount = tripRate + (bins * binRate) + (drums * drumRate);
      } else {
        baseAmount = tripRate;
      }

      if (baseAmount > 0) {
        const platformFee = Math.round(baseAmount * 0.05 * 100) / 100;
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

        // Deduct from wallet balance
        await db
          .update(residentProfiles)
          .set({ advancePaymentBalance: newWalletBalance })
          .where(eq(residentProfiles.userId, residentId));

        // Create on-demand invoice
        const invoiceId = generateId();
        const paymentReference = `INV-OD-${generateId().substring(0, 8).toUpperCase()}`;

        const currentMonthStart = new Date();
        currentMonthStart.setDate(1);
        currentMonthStart.setHours(0, 0, 0, 0);
        const currentMonthEnd = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() + 1, 0, 23, 59, 59, 999);
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 3); // 3 days to pay on-demand pickup invoice

        await db.insert(invoices).values({
          id: invoiceId,
          residentId,
          pspId: route.pspId,
          paymentReference,
          baseAmount,
          platformFee,
          totalAmount: finalAmount,
          status: invoiceStatus,
          dueDate,
          billingPeriodStart: currentMonthStart,
          billingPeriodEnd: currentMonthEnd,
        });

        // Record wallet deduction transaction
        if (amountSettledFromAdvance > 0) {
          await db.insert(transactions).values({
            id: generateId(),
            invoiceId,
            residentId,
            reference: `ADV-SETTLE-${Date.now()}-${generateId().substring(0, 4)}`,
            amount: amountSettledFromAdvance,
            paymentMethod: "bank_transfer",
            status: "success",
            cashStatus: "settled",
            paidAt: new Date(),
          });
        }

        // Dispatch notifications
        const hasRealEmail = residentProfile.email && residentProfile.email.includes("@") && !residentProfile.email.endsWith("@saziate.com");
        const firstName = residentProfile.firstName || residentProfile.name.split(" ")[0];

        if (hasRealEmail) {
          let subject = "";
          let html = "";
          if (isFullySettled) {
            subject = "Waste Collection Settled (Receipt)";
            html = emailTemplates.invoiceReceipt(firstName, totalAmount, paymentReference, `ADV-SETTLE-${Date.now()}`);
          } else if (isPartiallySettled) {
            subject = "On-Demand Waste Pickup Charge (Partial Payment)";
            html = emailTemplates.partialAdvanceSettled(firstName, amountSettledFromAdvance, finalAmount);
          } else {
            subject = "On-Demand Waste Pickup Invoice Ready";
            html = emailTemplates.monthlyBill(
              firstName,
              paymentReference,
              totalAmount,
              dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            );
          }

          await db.insert(pendingNotifications).values({
            id: generateId(),
            pspId: route.pspId,
            residentId,
            channel: "email",
            messageType: "due_invoice",
            recipientPhone: residentProfile.email!,
            messageText: JSON.stringify({ subject, html }),
          });
        } else if (residentProfile.phone) {
          let msg = "";
          if (isFullySettled) {
            msg = `Hello ${firstName}, a charge of ₦${totalAmount} for your waste collection today has been fully paid from your Saziate balance. Thank you!`;
          } else if (isPartiallySettled) {
            msg = `Hello ${firstName}, a charge of ₦${totalAmount} was generated for your collection today. ₦${amountSettledFromAdvance} was paid from your wallet. Settle the remaining ₦${finalAmount} at saziate.com. Ref: ${paymentReference}`;
          } else {
            msg = `Hello ${firstName}, a charge of ₦${totalAmount} was generated for your collection today. Please log in at saziate.com to pay this invoice. Ref: ${paymentReference}`;
          }

          await db.insert(pendingNotifications).values({
            id: generateId(),
            pspId: route.pspId,
            residentId,
            channel: "sms",
            messageType: "due_invoice",
            recipientPhone: residentProfile.phone,
            messageText: msg,
          });
        }
      }
    }

    // 4. Log the collection
    const logId = generateId();
    await db.insert(collectionLogs).values({
      id: logId,
      routeId,
      residentId,
      loggedById: actorId,
      status,
      notes: notes || null,
      imageUrl: imageUrl || null,
      binsCollected: binsCollected || 0,
      drumsCollected: drumsCollected || 0,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
    });

    // 5. Send Dispatch Alerts if this is the start of the route
    if (isFirstCollectionOfToday) {
      try {
        const routeName = route.name || "assigned route";

        const routeResidentsList = await db
          .select({
            id: users.id,
            name: users.name,
            firstName: users.firstName,
            email: users.email,
            phone: users.phone,
          })
          .from(routeResidents)
          .innerJoin(users, eq(routeResidents.residentId, users.id))
          .where(eq(routeResidents.routeId, routeId))
          .all();

        const alertNotifications = [];
        for (const res of routeResidentsList) {
          const hasEmail = res.email && res.email.includes("@") && !res.email.endsWith("@saziate.com");
          const rFirstName = res.firstName || res.name.split(" ")[0];

          if (hasEmail) {
            alertNotifications.push({
              id: generateId(),
              pspId: route.pspId,
              residentId: res.id,
              channel: "email" as const,
              messageType: "setup",
              recipientPhone: res.email!,
              messageText: JSON.stringify({
                subject: `Waste Collection Truck is En Route!`,
                html: emailTemplates.routeActive(rFirstName, routeName),
              }),
            });
          } else if (res.phone) {
            alertNotifications.push({
              id: generateId(),
              pspId: route.pspId,
              residentId: res.id,
              channel: "sms" as const,
              messageType: "setup",
              recipientPhone: res.phone,
              messageText: `Hello ${rFirstName}, the waste collection truck is now active on your route (${routeName}) today. Please place your bins at the curb!`,
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
        console.error("Failed to queue start-route alert notifications:", err);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Collection log stored successfully.",
        logId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("POST collection log error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, residentProfiles, psps, invoices, routes, routeResidents, collectionLogs } from "@/db/schema";
import { eq, and, sql, inArray, asc } from "drizzle-orm";
import { config } from "@/lib/config";



export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["resident"]);
    let residentId = "";
    let residentName = "Resident";
    let residentEmail = "";
    let pspInfo = {
      name: "",
      dvaBankName: "",
      dvaAccountNumber: "",
      dvaAccountName: "",
    };

    let advancePaymentBalance = 0;

    if (config.isMockMode) {
      residentId = "r1";
      residentName = "Babajide Sanwo";
      residentEmail = "08031234567@saziate.com"; // mock placeholder email to test banner
      advancePaymentBalance = 12000;
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
      residentName = session.user.name;
      residentEmail = session.user.email || "";

      // Fetch user profile and associated PSP dva details
        const profileResult = await db
          .select({
            pspId: users.pspId,
            advancePaymentBalance: residentProfiles.advancePaymentBalance,
          })
        .from(residentProfiles)
        .innerJoin(users, eq(residentProfiles.userId, users.id))
        .where(eq(users.id, residentId))
        .get();

      if (profileResult) {
        advancePaymentBalance = profileResult.advancePaymentBalance || 0;
        
        if (profileResult.pspId) {
          const psp = await db
          .select()
          .from(psps)
          .where(eq(psps.id, profileResult.pspId))
          .get();

        if (psp) {
          pspInfo = {
            name: psp.name,
            dvaBankName: psp.dvaBankName || "Providus Bank (via Monnify)",
            dvaAccountNumber: psp.dvaAccountNumber || "Not provisioned yet",
            dvaAccountName: psp.dvaAccountName || `${psp.name} Settlement`,
          };
        }
        }
      }
    }

    // Fetch all unpaid / pending invoices
    let currentInvoice = null;
    let totalOutstandingBalance = 0;
    if (config.isMockMode) {
      currentInvoice = {
        id: "inv-001",
        paymentReference: "SZ-MOCK123",
        baseAmount: 6000,
        platformFee: 300,
        totalAmount: 6300,
        dueDate: new Date(Date.now() + 5 * 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
        status: "pending",
        billingPeriod: "July 2026",
      };
      totalOutstandingBalance = 6300;
    } else {
      const unpaidInvoices = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.residentId, residentId),
            inArray(invoices.status, ["pending", "overdue"])
          )
        )
        .orderBy(asc(invoices.dueDate))
        .all();

      if (unpaidInvoices && unpaidInvoices.length > 0) {
        totalOutstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + Number((inv as any).totalAmount), 0);
        
        const inv = unpaidInvoices[0]; // Oldest unpaid invoice
        currentInvoice = {
          id: (inv as any).id,
          paymentReference: (inv as any).paymentReference,
          baseAmount: (inv as any).baseAmount,
          platformFee: (inv as any).platformFee,
          totalAmount: (inv as any).totalAmount,
          dueDate: new Date((inv as any).dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          status: (inv as any).status,
          billingPeriod: new Date((inv as any).billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        };
      }
    }

    let routeName = "";
    let routeSchedule = "Mondays & Thursdays";
    let nextCollection = {
      date: "Mondays & Thursdays",
      status: "Scheduled",
      route: "",
    };

    if (!config.isMockMode) {
      const routeRes = await db
        .select({ 
          routeId: routes.id,
          name: routes.name, 
          collectionSchedule: routes.collectionSchedule,
          sequenceOrder: routeResidents.sequenceOrder 
        })
        .from(routeResidents)
        .innerJoin(routes, eq(routeResidents.routeId, routes.id))
        .where(eq(routeResidents.residentId, residentId))
        .get();

      if (routeRes) {
        routeName = routeRes.name;
        routeSchedule = routeRes.collectionSchedule || "Mondays & Thursdays";

        // Query today's logs on this route
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const logsToday = await db
          .select({
            residentId: collectionLogs.residentId,
            sequenceOrder: routeResidents.sequenceOrder,
            status: collectionLogs.status,
          })
          .from(collectionLogs)
          .innerJoin(routeResidents, eq(collectionLogs.residentId, routeResidents.residentId))
          .where(
            and(
              eq(collectionLogs.routeId, routeRes.routeId),
              sql`${collectionLogs.loggedAt} >= ${startOfToday.getTime()}`
            )
          )
          .all();

        const myLog = logsToday.find((l) => l.residentId === residentId);

        if (myLog) {
          nextCollection = {
            date: "Completed today",
            status: myLog.status === "collected" ? "Collected" : myLog.status === "no_access" ? "Access Blocked" : "Completed",
            route: routeName,
          };
        } else if (logsToday.length > 0) {
          const maxVisitedSeq = logsToday.reduce((max: number, l) => Math.max(max, l.sequenceOrder || 0), 0);
          const mySeq = routeRes.sequenceOrder || 1;
          
          if (mySeq > maxVisitedSeq) {
            const stopsAway = mySeq - maxVisitedSeq;
            nextCollection = {
              date: `${stopsAway} stops away`,
              status: "In Progress",
              route: routeName,
            };
          } else {
            nextCollection = {
              date: "Vehicle in your zone",
              status: "In Progress",
              route: routeName,
            };
          }
        } else {
          nextCollection = {
            date: routeSchedule,
            status: "Scheduled",
            route: routeName,
          };
        }
      }
    } else {
      nextCollection = {
        date: routeSchedule,
        status: "Scheduled",
        route: "No route assigned yet",
      };
    }

    return new Response(
      JSON.stringify({
        residentName,
        residentEmail,
        pspInfo,
        currentInvoice,
        nextCollection,
        advancePaymentBalance,
        totalOutstandingBalance,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("[Dashboard Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, residentProfiles, organizations, invoices, zones, zoneResidents, fieldLogs } from "@/db/schema";
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
    let orgInfo = {
      name: "",
      serviceType: "utility",
    };

    let advancePaymentBalance = 0;

    if (config.isMockMode) {
      residentId = "r1";
      residentName = "John Doe";
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

      // Fetch user profile and associated Org dva details
        const profileResult = await db
          .select({
            orgId: users.orgId,
            advancePaymentBalance: residentProfiles.advancePaymentBalance,
          })
        .from(residentProfiles)
        .innerJoin(users, eq(residentProfiles.userId, users.id))
        .where(eq(users.id, residentId))
        .get();

      if (profileResult) {
        advancePaymentBalance = profileResult.advancePaymentBalance || 0;
        
        if (profileResult.orgId) {
          const org = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, profileResult.orgId))
          .get();

        if (org) {
          orgInfo = {
            name: org.name,
            serviceType: org.serviceType,
          };
        }
        }
      }
    }

    // Fetch all unpaid / pending invoices
    let currentInvoice = null;
    let totalOutstandingBalance = 0;
    let whoIOwe: any[] = [];
    
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
      whoIOwe = [{
        orgName: "Mock Power Co.",
        serviceType: "power",
        amount: 6300,
      }];
    } else {
      const unpaidInvoices = await db
        .select({
          id: invoices.id,
          paymentReference: invoices.paymentReference,
          baseAmount: invoices.baseAmount,
          platformFee: invoices.platformFee,
          totalAmount: invoices.totalAmount,
          dueDate: invoices.dueDate,
          status: invoices.status,
          billingPeriodStart: invoices.billingPeriodStart,
          orgName: organizations.name,
          serviceType: organizations.serviceType,
        })
        .from(invoices)
        .innerJoin(organizations, eq(invoices.orgId, organizations.id))
        .where(
          and(
            eq(invoices.residentId, residentId),
            inArray(invoices.status, ["pending", "overdue"])
          )
        )
        .orderBy(asc(invoices.dueDate))
        .all();

      if (unpaidInvoices && unpaidInvoices.length > 0) {
        totalOutstandingBalance = unpaidInvoices.reduce((sum, inv) => sum + Number(inv.totalAmount), 0);
        
        const inv = unpaidInvoices[0]; // Oldest unpaid invoice
        currentInvoice = {
          id: inv.id,
          paymentReference: inv.paymentReference,
          baseAmount: inv.baseAmount,
          platformFee: inv.platformFee,
          totalAmount: inv.totalAmount,
          dueDate: new Date(inv.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          status: inv.status,
          billingPeriod: new Date(inv.billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        };

        // Group by provider for Who I Owe
        const providerMap = new Map();
        for (const invoice of unpaidInvoices) {
          const key = invoice.orgName;
          if (providerMap.has(key)) {
            providerMap.get(key).amount += Number(invoice.totalAmount);
            providerMap.get(key).invoiceIds.push(invoice.id);
          } else {
            providerMap.set(key, {
              orgName: invoice.orgName,
              serviceType: invoice.serviceType,
              amount: Number(invoice.totalAmount),
              invoiceIds: [invoice.id]
            });
          }
        }
        whoIOwe = Array.from(providerMap.values());
      }
    }

    let zoneName = "";
    let zoneSchedule = "Mondays & Thursdays";
    let nextService = {
      date: "Mondays & Thursdays",
      status: "Scheduled",
      zone: "",
    };
    
    let serviceHistory: any[] = [];

    if (!config.isMockMode) {
      const zoneRes = await db
        .select({ 
          zoneId: zones.id,
          name: zones.name, 
          serviceSchedule: zones.serviceSchedule,
          sequenceOrder: zoneResidents.sequenceOrder 
        })
        .from(zoneResidents)
        .innerJoin(zones, eq(zoneResidents.zoneId, zones.id))
        .where(eq(zoneResidents.residentId, residentId))
        .get();

      if (zoneRes) {
        zoneName = zoneRes.name;
        zoneSchedule = zoneRes.serviceSchedule || "Mondays & Thursdays";
        nextService = {
          date: zoneSchedule,
          status: "Scheduled",
          zone: zoneName,
        };

        // Fetch Service History (Field Logs)
        const logs = await db
          .select({
            id: fieldLogs.id,
            status: fieldLogs.status,
            loggedAt: fieldLogs.loggedAt,
            notes: fieldLogs.notes,
            agentName: users.name,
            orgName: organizations.name,
            serviceType: organizations.serviceType,
          })
          .from(fieldLogs)
          .innerJoin(users, eq(fieldLogs.loggedById, users.id))
          .innerJoin(zones, eq(fieldLogs.zoneId, zones.id))
          .innerJoin(organizations, eq(zones.orgId, organizations.id))
          .where(eq(fieldLogs.zoneId, zoneRes.zoneId)) // Only logs for their zone
          .orderBy(sql`${fieldLogs.loggedAt} DESC`)
          .limit(5)
          .all();
          
        serviceHistory = logs.map(l => ({
          id: l.id,
          status: l.status,
          date: new Date(l.loggedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
          agentName: l.agentName,
          orgName: l.orgName,
          serviceType: l.serviceType,
        }));

        // Query today's logs on this zone
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const logsToday = await db
          .select({
            residentId: fieldLogs.residentId,
            sequenceOrder: zoneResidents.sequenceOrder,
            status: fieldLogs.status,
          })
          .from(fieldLogs)
          .innerJoin(zoneResidents, eq(fieldLogs.residentId, zoneResidents.residentId))
          .where(
            and(
              eq(fieldLogs.zoneId, zoneRes.zoneId),
              sql`${fieldLogs.loggedAt} >= ${startOfToday.getTime()}`
            )
          )
          .all();

        const myLog = logsToday.find((l) => l.residentId === residentId);

        if (myLog) {
          nextService = {
            date: "Completed today",
            status: myLog.status === "completed" ? "Collected" : myLog.status === "no_access" ? "Access Blocked" : "Completed",
            zone: zoneName,
          };
        } else if (logsToday.length > 0) {
          const maxVisitedSeq = logsToday.reduce((max: number, l) => Math.max(max, l.sequenceOrder || 0), 0);
          const mySeq = zoneRes.sequenceOrder || 1;
          
          if (mySeq > maxVisitedSeq) {
            const stopsAway = mySeq - maxVisitedSeq;
            nextService = {
              date: `${stopsAway} stops away`,
              status: "In Progress",
              zone: zoneName,
            };
          } else {
            nextService = {
              date: "Agent in your zone",
              status: "In Progress",
              zone: zoneName,
            };
          }
        } else {
          nextService = {
            date: zoneSchedule,
            status: "Scheduled",
            zone: zoneName,
          };
        }
      }
    } else {
      nextService = {
        date: zoneSchedule,
        status: "Scheduled",
        zone: "No zone assigned yet",
      };
    }

    return new Response(
      JSON.stringify({
        residentName,
        residentEmail,
        orgInfo,
        currentInvoice,
        nextService,
        advancePaymentBalance,
        totalOutstandingBalance,
        whoIOwe,
        serviceHistory,
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

export const runtime = "edge";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, residentProfiles, psps, invoices, routes, routeResidents } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { config } from "@/lib/config";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
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
      const betterAuth = auth(env.DB);
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
            dvaBankName: psp.dvaBankName || "Providus Bank (via Paystack)",
            dvaAccountNumber: psp.dvaAccountNumber || "Not provisioned yet",
            dvaAccountName: psp.dvaAccountName || `${psp.name} Settlement`,
          };
        }
        }
      }
    }

    // Fetch latest unpaid / pending invoice
    let currentInvoice = null;
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
    } else {
      const inv = await db
        .select()
        .from(invoices)
        .where(
          and(
            eq(invoices.residentId, residentId),
            eq(invoices.status, "pending")
          )
        )
        .orderBy(invoices.dueDate)
        .get();

      if (inv) {
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
      }
    }

    let routeName = "";
    let routeSchedule = "Mondays & Thursdays";

    if (!config.isMockMode) {
      const routeRes = await db
        .select({ name: routes.name, collectionSchedule: routes.collectionSchedule })
        .from(routeResidents)
        .innerJoin(routes, eq(routeResidents.routeId, routes.id))
        .where(eq(routeResidents.residentId, residentId))
        .get();

      if (routeRes) {
        routeName = routeRes.name;
        routeSchedule = routeRes.collectionSchedule || "Mondays & Thursdays";
      }
    }

    const nextCollection = {
      date: routeSchedule,
      status: "Scheduled",
      route: routeName,
    };

    return new Response(
      JSON.stringify({
        residentName,
        residentEmail,
        pspInfo,
        currentInvoice,
        nextCollection,
        advancePaymentBalance,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

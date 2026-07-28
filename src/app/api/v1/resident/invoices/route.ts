export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";



export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
    }

    if (config.isMockMode) {
      // Mock invoices dataset
      return new Response(
        JSON.stringify([
          {
            id: "inv-001",
            baseAmount: config.DEFAULT_MONTHLY_RATE_NGN,
            platformFee: Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            totalAmount: config.DEFAULT_MONTHLY_RATE_NGN + Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            dueDate: "25 Jul 2026",
            status: "pending",
            billingPeriod: "July 2026",
            referenceCode: "SZ-LEK-001",
          },
          {
            id: "inv-002",
            baseAmount: config.DEFAULT_MONTHLY_RATE_NGN,
            platformFee: Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            totalAmount: config.DEFAULT_MONTHLY_RATE_NGN + Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            dueDate: "25 Jun 2026",
            status: "paid",
            billingPeriod: "June 2026",
            referenceCode: "SZ-LEK-001",
          },
          {
            id: "inv-003",
            baseAmount: config.DEFAULT_MONTHLY_RATE_NGN,
            platformFee: Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            totalAmount: config.DEFAULT_MONTHLY_RATE_NGN + Math.round(config.DEFAULT_MONTHLY_RATE_NGN * config.PLATFORM_FEE_RATE),
            dueDate: "25 May 2026",
            status: "paid",
            billingPeriod: "May 2026",
            referenceCode: "SZ-LEK-001",
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Query D1 database
    const results = await db
      .select({
        id: invoices.id,
        baseAmount: invoices.baseAmount,
        platformFee: invoices.platformFee,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        billingPeriodStart: invoices.billingPeriodStart,
        paymentReference: invoices.paymentReference,
      })
      .from(invoices)
      .where(eq(invoices.residentId, residentId))
      .orderBy(invoices.dueDate)
      .all();

    const formatted = results.map((inv) => ({
      id: (inv as any).id,
      baseAmount: (inv as any).baseAmount,
      platformFee: (inv as any).platformFee,
      totalAmount: (inv as any).totalAmount,
      dueDate: new Date((inv as any).dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      status: (inv as any).status,
      billingPeriod: new Date((inv as any).billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      referenceCode: (inv as any).paymentReference,
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
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

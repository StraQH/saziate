import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";



export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB);
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
            baseAmount: 6000,
            platformFee: 300,
            totalAmount: 6300,
            dueDate: "25 Jul 2026",
            status: "pending",
            billingPeriod: "July 2026",
            referenceCode: "SZ-LEK-001",
          },
          {
            id: "inv-002",
            baseAmount: 6000,
            platformFee: 300,
            totalAmount: 6300,
            dueDate: "25 Jun 2026",
            status: "paid",
            billingPeriod: "June 2026",
            referenceCode: "SZ-LEK-001",
          },
          {
            id: "inv-003",
            baseAmount: 6000,
            platformFee: 300,
            totalAmount: 6300,
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

    const formatted = results.map((inv: any) => ({
      id: inv.id,
      baseAmount: inv.baseAmount,
      platformFee: inv.platformFee,
      totalAmount: inv.totalAmount,
      dueDate: new Date(inv.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      status: inv.status,
      billingPeriod: new Date(inv.billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
      referenceCode: inv.paymentReference,
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

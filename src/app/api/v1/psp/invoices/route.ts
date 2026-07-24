export const runtime = "edge";
﻿import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { invoices, residentProfiles, users } from "@/db/schema";
import { eq, and, sql, like } from "drizzle-orm";
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

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    
    const offset = (page - 1) * limit;

    let baseQuery = db
      .select({
        id: invoices.id,
        residentName: users.name,
        paymentReference: invoices.paymentReference,
        baseAmount: invoices.baseAmount,
        platformFee: invoices.platformFee,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        billingPeriodStart: invoices.billingPeriodStart,
      })
      .from(invoices)
      .innerJoin(users, eq(invoices.residentId, users.id))
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .where(
        and(
          eq(invoices.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      );

    const results = await baseQuery.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(invoices)
      .innerJoin(users, eq(invoices.residentId, users.id))
      .where(
        and(
          eq(invoices.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      )
      .get();
      
    const totalCount = Number(countResult?.count || 0);

    const formattedResults = results.map((inv: any) => ({
      id: inv.id,
      residentName: inv.residentName,
      referenceCode: inv.paymentReference || inv.id,
      baseAmount: inv.baseAmount,
      platformFee: inv.platformFee,
      totalAmount: inv.totalAmount,
      dueDate: new Date(inv.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      status: inv.status,
      billingPeriod: new Date(inv.billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    }));

    return new Response(JSON.stringify({
      data: formattedResults,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

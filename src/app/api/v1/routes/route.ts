import { getAppEnv } from "@/lib/env";
import { createRouteSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { routes, routeBillingRates, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
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

    const list = await db
      .select()
      .from(routes)
      .where(eq(routes.pspId, pspId));

    if (list.length === 0) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    const routeIds = list.map((r: any) => r.id);
    
    // In drizzle with SQLite, using inArray is safe.
    // Fetch rates for these routes
    const ratesList = await db
      .select()
      .from(routeBillingRates)
      .where(inArray(routeBillingRates.routeId, routeIds));

    // Group rates by routeId
    const ratesMap = new Map();
    for (const r of ratesList) {
      if (!ratesMap.has(r.routeId)) ratesMap.set(r.routeId, []);
      ratesMap.get(r.routeId).push({
        category: r.billingCategory,
        monthlyRate: r.monthlyRate
      });
    }

    const routesWithRates = list.map((route: any) => ({
      ...route,
      rates: ratesMap.get(route.id) || []
    }));

    return new Response(JSON.stringify(routesWithRates), { status: 200 });
  } catch (error: any) {
    console.error("GET Routes Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = createRouteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, description, collectionSchedule, agentId: assignedAgentId, rates } = body;

    if (!name) {
      return new Response("Missing route name.", { status: 400 });
    }

    if (assignedAgentId) {
      const validAgent = await db
        .select()
        .from(users)
        .where(and(eq(users.id, assignedAgentId), eq(users.pspId, pspId)))
        .get();
        
      if (!validAgent) {
        return new Response("Unauthorized: The assigned agent does not belong to this PSP.", { status: 403 });
      }
    }

    const routeId = generateId();

    const inserts = [];
    inserts.push(
      db.insert(routes).values({
        id: routeId,
        pspId: pspId,
        name,
        description,
        collectionSchedule: collectionSchedule || "Mondays & Thursdays",
        assignedAgentId,
      })
    );

    if (rates && rates.length > 0) {
      const batchRates = rates.map((rate: any) => ({
        routeId,
        billingCategory: rate.category,
        monthlyRate: Math.round(rate.monthlyRate * 100) / 100,
      }));
      inserts.push(db.insert(routeBillingRates).values(batchRates));
    }

    // @ts-ignore: Drizzle batch typing with dynamic arrays causes TS to hang
    await db.batch(inserts);

    return new Response(JSON.stringify({ status: "success", routeId }), { status: 201 });
  } catch (error: any) {
    console.error("Create Route Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { getAppEnv } from "@/lib/env";
import { createRouteSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { routes, routeBillingRates, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";


export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const list = await db
      .select({
        id: routes.id,
        pspId: routes.pspId,
        name: routes.name,
        description: routes.description,
        collectionSchedule: routes.collectionSchedule,
        assignedAgentId: routes.assignedAgentId,
        assignedAgentName: users.name,
      })
      .from(routes)
      .leftJoin(users, eq(routes.assignedAgentId, users.id))
      .where(eq(routes.pspId, pspId))
      .all();

    if (list.length === 0) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    const routeIds = list.map((r) => r.id);
    
    // In drizzle with SQLite, using inArray is safe.
    // Fetch rates for these routes
    const ratesList = await db
      .select()
      .from(routeBillingRates)
      .where(inArray(routeBillingRates.routeId, routeIds))
      .all();

    // Group rates by routeId
    const ratesMap = new Map();
    for (const r of ratesList) {
      if (!ratesMap.has(r.routeId)) ratesMap.set(r.routeId, []);
      ratesMap.get(r.routeId).push({
        category: r.billingCategory,
        monthlyRate: r.monthlyRate
      });
    }

    const routesWithRates = list.map((route) => ({
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
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
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
      const batchRates = rates.map((rate) => ({
        routeId,
        billingCategory: rate.category,
        monthlyRate: Math.round(rate.monthlyRate * 100) / 100,
      }));
      inserts.push(db.insert(routeBillingRates).values(batchRates));
    }

    // @ts-ignore: Drizzle batch typing with dynamic arrays causes TS to hang
    await db.batch(inserts);

    return new Response(JSON.stringify({ status: "success" as any, routeId }), { status: 201 });
  } catch (error: any) {
    console.error("Create Route Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { routeId, agentId } = await req.json() as { routeId: string, agentId: string | null };
    if (!routeId) {
      return new Response("Missing routeId.", { status: 400 });
    }

    if (agentId) {
      const validAgent = await db
        .select()
        .from(users)
        .where(and(eq(users.id, agentId), eq(users.pspId, pspId)))
        .get();
        
      if (!validAgent) {
        return new Response("Unauthorized: Agent does not belong to this PSP.", { status: 403 });
      }
    }

    await db.update(routes)
      .set({ assignedAgentId: agentId || null })
      .where(and(eq(routes.id, routeId), eq(routes.pspId, pspId)));

    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  } catch (error: any) {
    console.error("Update Route Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

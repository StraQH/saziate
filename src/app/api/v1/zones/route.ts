export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { createZoneSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { zones, zoneBillingRates, users } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { getActiveorgId, requireRole } from "@/lib/session";


export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const list = await db
      .select({
        id: zones.id,
        orgId: zones.orgId,
        name: zones.name,
        description: zones.description,
        serviceSchedule: zones.serviceSchedule,
        assignedAgentId: zones.assignedAgentId,
        assignedAgentName: users.name,
      })
      .from(zones)
      .leftJoin(users, eq(zones.assignedAgentId, users.id))
      .where(eq(zones.orgId, orgId))
      .all();

    if (list.length === 0) {
      return new Response(JSON.stringify([]), { status: 200 });
    }

    const zoneIds = list.map((r) => r.id);
    
    // In drizzle with SQLite, using inArray is safe.
    // Fetch rates for these zones
    const ratesList = await db
      .select()
      .from(zoneBillingRates)
      .where(inArray(zoneBillingRates.zoneId, zoneIds))
      .all();

    // Group rates by zoneId
    const ratesMap = new Map();
    for (const r of ratesList) {
      if (!ratesMap.has(r.zoneId)) ratesMap.set(r.zoneId, []);
      ratesMap.get(r.zoneId).push({
        category: r.billingCategory,
        monthlyRate: r.monthlyRate
      });
    }

    const zonesWithRates = list.map((zone) => ({
      ...zone,
      rates: ratesMap.get(zone.id) || []
    }));

    return new Response(JSON.stringify(zonesWithRates), { status: 200 });
  } catch (error: any) {
    console.error("GET Zones Error:", error);
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

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = createZoneSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    
    const { agentId: assignedAgentId, name, description, serviceSchedule, rates } = parsed.data;

    if (assignedAgentId) {
      const validAgent = await db
        .select()
        .from(users)
        .where(and(eq(users.id, assignedAgentId), eq(users.orgId, orgId)))
        .get();
        
      if (!validAgent) {
        return new Response("Unauthorized: The assigned agent does not belong to this Org.", { status: 403 });
      }
    }

    const zoneId = generateId();

    const inserts = [];
    inserts.push(
      db.insert(zones).values({
        id: zoneId,
        orgId: orgId,
        name,
        description,
        serviceSchedule: serviceSchedule || "Mondays & Thursdays",
        assignedAgentId,
      })
    );

    if (rates && rates.length > 0) {
      const batchRates = rates.map((rate) => ({
        zoneId,
        billingCategory: rate.category,
        monthlyRate: Math.round(rate.monthlyRate * 100) / 100,
      }));
      inserts.push(db.insert(zoneBillingRates).values(batchRates));
    }

    // @ts-ignore: Drizzle batch typing with dynamic arrays causes TS to hang
    await db.batch(inserts);

    return new Response(JSON.stringify({ status: "success" as any, zoneId }), { status: 201 });
  } catch (error: any) {
    console.error("Create Zone Error:", error);
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

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    // We can reuse createZoneSchema and make fields optional or just do a partial validation, 
    // but the implementation plan just mentioned Zod validation for POST. I'll just validate POST for now as required.
    const { zoneId, agentId, name, description, serviceSchedule, rates } = rawBody;
    if (!zoneId) {
      return new Response("Missing zoneId.", { status: 400 });
    }

    if (agentId) {
      const validAgent = await db
        .select()
        .from(users)
        .where(and(eq(users.id, agentId), eq(users.orgId, orgId)))
        .get();
        
      if (!validAgent) {
        return new Response("Unauthorized: Agent does not belong to this Org.", { status: 403 });
      }
    }

    const updates: any = {};
    if (agentId !== undefined) updates.assignedAgentId = agentId || null;
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (serviceSchedule !== undefined) updates.serviceSchedule = serviceSchedule;

    if (Object.keys(updates).length > 0) {
      await db.update(zones)
        .set(updates)
        .where(and(eq(zones.id, zoneId), eq(zones.orgId, orgId)));
    }

    if (rates && rates.length > 0) {
      await db.delete(zoneBillingRates).where(eq(zoneBillingRates.zoneId, zoneId));
      const batchRates = rates.map((rate: any) => ({
        zoneId,
        billingCategory: rate.category,
        monthlyRate: Math.round(rate.monthlyRate * 100) / 100,
      }));
      await db.insert(zoneBillingRates).values(batchRates);
    }

    return new Response(JSON.stringify({ status: "success" }), { status: 200 });
  } catch (error: any) {
    console.error("Update Zone Error:", error);
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

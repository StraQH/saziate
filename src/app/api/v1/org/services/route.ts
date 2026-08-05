export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { fieldLogs as fieldLogs, residentProfiles, zones as zones, users, zoneResidents as zoneResidents } from "@/db/schema";
import { eq, and, sql, like, inArray } from "drizzle-orm";
import { getActiveorgId as getActiveorgId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin", "field_agent"]);

    const betterAuth = auth(env.DB as any);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    if (!session || !session.user) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    const offset = (page - 1) * limit;

    if (session.user.role === "field_agent") {
      const actorId = session.user.id;
      // 1. Get zones assigned to the field agent
      const agentZones = await db
        .select({ id: zones.id, name: zones.name })
        .from(zones)
        .where(eq(zones.assignedAgentId, actorId))
        .all();

      if (agentZones.length === 0) {
        return new Response(JSON.stringify({
          data: [],
          totalCount: 0,
          totalPages: 0,
          page,
          limit
        }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      const zoneIds = agentZones.map((r) => r.id);

      // 2. Get residents assigned to these zones
      const zoneResList = await db
        .select({
          residentId: zoneResidents.residentId,
          zoneId: zoneResidents.zoneId,
          residentName: users.name,
          address: residentProfiles.address,
          zoneName: zones.name,
          billingModel: residentProfiles.billingModel,
          
          onDemandUnit1Rate: residentProfiles.onDemandUnit1Rate,
          onDemandUnit2Rate: residentProfiles.onDemandUnit2Rate,
        })
        .from(zoneResidents)
        .innerJoin(users, eq(zoneResidents.residentId, users.id))
        .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
        .innerJoin(zones, eq(zoneResidents.zoneId, zones.id))
        .where(
          and(
            inArray(zoneResidents.zoneId, zoneIds),
            search ? like(users.name, `%${search}%`) : undefined
          )
        )
        .all();

      // 3. Get services logged today on these zones
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const logsToday = await db
        .select({
          id: fieldLogs.id,
          residentId: fieldLogs.residentId,
          status: fieldLogs.status,
          loggedAt: fieldLogs.loggedAt
        })
        .from(fieldLogs)
        .where(
          and(
            inArray(fieldLogs.zoneId, zoneIds),
            sql`${fieldLogs.loggedAt} >= ${startOfToday.getTime()}`
          )
        )
        .all();

      const logsMap = new Map<string, any>(logsToday.map((l) => [l.residentId, l]));

      const formattedResults = zoneResList.map((r) => {
        const log = logsMap.get(r.residentId) as any | undefined;
        return {
          id: r.residentId,
          residentName: r.residentName,
          address: r.address,
          zone: r.zoneName,
          zoneId: r.zoneId,
          status: log ? log.status : "pending",
          loggedBy: log ? "Field Agent" : "Unassigned",
          loggedAt: log ? new Date(log.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today" : null,
          billingModel: r.billingModel,
          
          onDemandUnit1Rate: r.onDemandUnit1Rate,
          onDemandUnit2Rate: r.onDemandUnit2Rate,
        };
      });

      const totalCount = formattedResults.length;
      const paginated = formattedResults.slice(offset, offset + limit);

      return new Response(JSON.stringify({
        data: paginated,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        page,
        limit
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Default flow for org_operator (historical log listing)
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    let baseQuery = db
      .select({
        id: fieldLogs.id,
        residentName: users.name,
        address: residentProfiles.address,
        status: fieldLogs.status,
        loggedAt: fieldLogs.loggedAt,
        zoneName: zones.name
      })
      .from(fieldLogs)
      .innerJoin(users, eq(fieldLogs.residentId, users.id))
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .innerJoin(zones, eq(fieldLogs.zoneId, zones.id))
      .where(
        and(
          eq(zones.orgId, orgId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      );

    const results = await baseQuery.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(fieldLogs)
      .innerJoin(users, eq(fieldLogs.residentId, users.id))
      .innerJoin(zones, eq(fieldLogs.zoneId, zones.id))
      .where(
        and(
          eq(zones.orgId, orgId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      )
      .get();
      
    const totalCount = Number(countResult?.count || 0);

    const formattedResults = results.map((c) => ({
      id: c.id,
      residentName: c.residentName,
      address: c.address,
      zone: c.zoneName,
      status: c.status === "completed" ? "completed" : c.status === "no_service" ? "no_service" : c.status === "no_access" ? "no_access" : "pending",
      loggedBy: "Field Agent",
      loggedAt: new Date(c.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today",
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
    console.error("GET Services error:", error);
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

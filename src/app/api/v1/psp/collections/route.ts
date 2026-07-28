export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { collectionLogs, residentProfiles, routes, users, routeResidents } from "@/db/schema";
import { eq, and, sql, like, inArray } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator", "field_agent"]);

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
      // 1. Get routes assigned to the field agent
      const agentRoutes = await db
        .select({ id: routes.id, name: routes.name })
        .from(routes)
        .where(eq(routes.assignedAgentId, actorId))
        .all();

      if (agentRoutes.length === 0) {
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

      const routeIds = agentRoutes.map((r) => r.id);

      // 2. Get residents assigned to these routes
      const routeResList = await db
        .select({
          residentId: routeResidents.residentId,
          routeId: routeResidents.routeId,
          residentName: users.name,
          address: residentProfiles.address,
          routeName: routes.name,
          billingModel: residentProfiles.billingModel,
          onDemandTripRate: residentProfiles.onDemandTripRate,
          onDemandBinRate: residentProfiles.onDemandBinRate,
          onDemandDrumRate: residentProfiles.onDemandDrumRate,
        })
        .from(routeResidents)
        .innerJoin(users, eq(routeResidents.residentId, users.id))
        .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
        .innerJoin(routes, eq(routeResidents.routeId, routes.id))
        .where(
          and(
            inArray(routeResidents.routeId, routeIds),
            search ? like(users.name, `%${search}%`) : undefined
          )
        )
        .all();

      // 3. Get collections logged today on these routes
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      const logsToday = await db
        .select({
          id: collectionLogs.id,
          residentId: collectionLogs.residentId,
          status: collectionLogs.status,
          loggedAt: collectionLogs.loggedAt
        })
        .from(collectionLogs)
        .where(
          and(
            inArray(collectionLogs.routeId, routeIds),
            sql`${collectionLogs.loggedAt} >= ${startOfToday.getTime()}`
          )
        )
        .all();

      const logsMap = new Map<string, any>(logsToday.map((l) => [l.residentId, l]));

      const formattedResults = routeResList.map((r) => {
        const log = logsMap.get(r.residentId) as any | undefined;
        return {
          id: r.residentId,
          residentName: r.residentName,
          address: r.address,
          route: r.routeName,
          routeId: r.routeId,
          status: log ? log.status : "pending",
          loggedBy: log ? "Field Agent" : "Unassigned",
          loggedAt: log ? new Date(log.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today" : null,
          billingModel: r.billingModel,
          onDemandTripRate: r.onDemandTripRate,
          onDemandBinRate: r.onDemandBinRate,
          onDemandDrumRate: r.onDemandDrumRate,
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

    // Default flow for psp_operator (historical log listing)
    const pspId = await getActivePspId(req, env.DB as any);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    let baseQuery = db
      .select({
        id: collectionLogs.id,
        residentName: users.name,
        address: residentProfiles.address,
        status: collectionLogs.status,
        loggedAt: collectionLogs.loggedAt,
        routeName: routes.name
      })
      .from(collectionLogs)
      .innerJoin(users, eq(collectionLogs.residentId, users.id))
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .innerJoin(routes, eq(collectionLogs.routeId, routes.id))
      .where(
        and(
          eq(routes.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      );

    const results = await baseQuery.limit(limit).offset(offset);
    
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(collectionLogs)
      .innerJoin(users, eq(collectionLogs.residentId, users.id))
      .innerJoin(routes, eq(collectionLogs.routeId, routes.id))
      .where(
        and(
          eq(routes.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      )
      .get();
      
    const totalCount = Number(countResult?.count || 0);

    const formattedResults = results.map((c) => ({
      id: c.id,
      residentName: c.residentName,
      address: c.address,
      route: c.routeName,
      status: c.status === "collected" ? "collected" : c.status === "no_waste" ? "no_waste" : c.status === "no_access" ? "no_access" : "pending",
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
    console.error("GET Collections error:", error);
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

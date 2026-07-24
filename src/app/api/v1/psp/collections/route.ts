import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { collectionLogs, residentProfiles, routes, users } from "@/db/schema";
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

    const formattedResults = results.map((c: any) => ({
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
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

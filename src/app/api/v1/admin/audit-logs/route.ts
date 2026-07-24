export const runtime = "edge";
﻿import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { desc, eq, sql, and, like } from "drizzle-orm";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    
    const offset = (page - 1) * limit;

    let baseQuery = db
      .select({
        id: auditLogs.id,
        action: auditLogs.action,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        meta: auditLogs.meta,
        createdAt: auditLogs.createdAt,
        actorId: auditLogs.actorId,
        actorName: users.name,
        actorEmail: users.email,
        actorRole: users.role,
      })
      .from(auditLogs)
      .leftJoin(users, eq(auditLogs.actorId, users.id))
      .where(
        search ? like(auditLogs.action, `%${search}%`) : undefined
      )
      .orderBy(desc(auditLogs.createdAt));

    const results = await baseQuery.limit(limit).offset(offset);

    let countQuery = db
      .select({ count: sql`COUNT(*)` })
      .from(auditLogs)
      .where(
        search ? like(auditLogs.action, `%${search}%`) : undefined
      );

    const countResult = await countQuery.get();
    const totalCount = Number(countResult?.count || 0);

    return new Response(JSON.stringify({
      data: results,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (err: any) {
    if (err.message === "Unauthorized.") {
      return new Response("Unauthorized", { status: 401 });
    }
    console.error("Failed to fetch audit logs:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}


import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    // Only platform admins can view the global audit log
    await requireRole(req, env.DB, ["admin"]);

    const results = await db
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
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return Response.json(results);
  } catch (err: any) {
    if (err.message === "Unauthorized.") {
      return new Response("Unauthorized", { status: 401 });
    }
    console.error("Failed to fetch audit logs:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
}

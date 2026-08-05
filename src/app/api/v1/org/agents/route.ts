export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
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

    const agents = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        phone: users.phone,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(
        and(
          eq(users.orgId, orgId),
          eq(users.role, "field_agent")
        )
      )
      .all();

    return new Response(JSON.stringify(agents), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Agents error:", error);
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

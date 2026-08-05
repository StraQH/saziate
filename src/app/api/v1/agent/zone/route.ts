export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { zones } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["field_agent", "org_admin"]);

    const betterAuth = auth(env.DB as any);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const agentZones = await db
      .select({ name: zones.name, serviceSchedule: zones.serviceSchedule })
      .from(zones)
      .where(eq(zones.assignedAgentId, session.user.id))
      .all();

    if (agentZones.length === 0) {
      return new Response(JSON.stringify({ zone: "Unassigned", schedule: "-" }), { status: 200 });
    }

    const zone = agentZones.map((r) => r.name).join(", ");
    const schedule = agentZones.map((r) => r.serviceSchedule).join(", ");

    return new Response(JSON.stringify({ zone, schedule }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if ((error as Error).message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    if ((error as Error).message === "Forbidden") {
      return new Response("Forbidden", { status: 403 });
    }
    console.error("GET Agent Zone details error:", error);
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

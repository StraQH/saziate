import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { routes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["field_agent", "psp_operator"]);

    const betterAuth = auth(env.DB);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    if (!session?.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const agentRoutes = await db
      .select({ name: routes.name, collectionSchedule: routes.collectionSchedule })
      .from(routes)
      .where(eq(routes.assignedAgentId, session.user.id))
      .all();

    if (agentRoutes.length === 0) {
      return new Response(JSON.stringify({ zone: "Unassigned", schedule: "-" }), { status: 200 });
    }

    const zone = agentRoutes.map((r: any) => r.name).join(", ");
    const schedule = agentRoutes.map((r: any) => r.collectionSchedule).join(", ");

    return new Response(JSON.stringify({ zone, schedule }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if (error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response("Forbidden", { status: 403 });
    }
    console.error("GET Agent Route details error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

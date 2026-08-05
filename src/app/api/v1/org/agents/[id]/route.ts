export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole, getActiveorgId } from "@/lib/session";
import { getDb } from "@/db";
import { users, zones } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const { id: agentId } = await context.params;

    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);

    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    if (!agentId) {
      return new Response("Agent ID is required.", { status: 400 });
    }

    // Verify agent belongs to this Org
    const agent = await db
      .select()
      .from(users)
      .where(and(eq(users.id, agentId), eq(users.orgId, orgId), eq(users.role, "field_agent")))
      .get();

    if (!agent) {
      return new Response("Agent not found or unauthorized.", { status: 404 });
    }

    await db.batch([
      // 1. Strip the agent of their orgId (Deactivate them)
      db.update(users)
        .set({ orgId: null, updatedAt: new Date() })
        .where(eq(users.id, agentId)),
      // 2. Unassign them from any zones they were managing
      db.update(zones)
        .set({ assignedAgentId: null })
        .where(and(eq(zones.assignedAgentId, agentId), eq(zones.orgId, orgId))),
    ]);

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Agent successfully deactivated and unassigned from zones.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Deactivate Agent Error:", error);
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

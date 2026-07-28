import { getAppEnv } from "@/lib/env";
import { requireRole, getActivePspId } from "@/lib/session";
import { getDb } from "@/db";
import { users, routes } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(req: Request, context: { params: Promise<{ id: string }> }) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const { id: agentId } = await context.params;

    await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    if (!agentId) {
      return new Response("Agent ID is required.", { status: 400 });
    }

    // Verify agent belongs to this PSP
    const agent = await db
      .select()
      .from(users)
      .where(and(eq(users.id, agentId), eq(users.pspId, pspId), eq(users.role, "field_agent")))
      .get();

    if (!agent) {
      return new Response("Agent not found or unauthorized.", { status: 404 });
    }

    await db.batch([
      // 1. Strip the agent of their pspId (Deactivate them)
      db.update(users)
        .set({ pspId: null, updatedAt: new Date() })
        .where(eq(users.id, agentId)),
      // 2. Unassign them from any routes they were managing
      db.update(routes)
        .set({ assignedAgentId: null })
        .where(and(eq(routes.assignedAgentId, agentId), eq(routes.pspId, pspId))),
    ]);

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Agent successfully deactivated and unassigned from routes.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Deactivate Agent Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

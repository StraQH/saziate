import { MOCK_AGENT_ID } from "@/lib/mockdata";
import { requireRole } from "@/lib/session";
import { collectionLogSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { collectionLogs, users, routes } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { config } from "@/lib/config";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["field_agent"]);
    let actorId = "";
    if (config.isMockMode) {
      actorId = MOCK_AGENT_ID;
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      actorId = session.user.id;
    }

    const rawBody = await req.json();
    const parsed = collectionLogSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { routeId, residentId, status, notes, imageUrl, loggedAt } = body;

    if (!routeId || !residentId || !status) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Ensure the route is assigned to the current field agent
    const route = await db
      .select()
      .from(routes)
      .where(eq(routes.id, routeId))
      .get();

    if (!route) {
      return new Response("Route not found.", { status: 404 });
    }

    if (route.assignedAgentId !== actorId) {
      return new Response("Unauthorized to log collections for this route.", { status: 403 });
    }

    const logId = generateId();
    await db.insert(collectionLogs).values({
      id: logId,
      routeId,
      residentId,
      loggedById: actorId,
      status,
      notes: notes || null,
      imageUrl: imageUrl || null,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Collection log stored successfully.",
        logId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

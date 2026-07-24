import { getAppEnv } from "@/lib/env";
import { createRouteSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { routes, routeBillingRates, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";

export const runtime = "edge";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const list = await db
      .select()
      .from(routes)
      .where(eq(routes.pspId, pspId));

    return new Response(JSON.stringify(list), { status: 200 });
  } catch (error: any) {
    console.error("GET Routes Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = createRouteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, description, collectionSchedule, agentId: assignedAgentId, rates } = body;

    if (!name) {
      return new Response("Missing route name.", { status: 400 });
    }

    if (assignedAgentId) {
      const validAgent = await db
        .select()
        .from(users)
        .where(and(eq(users.id, assignedAgentId), eq(users.pspId, pspId)))
        .get();
        
      if (!validAgent) {
        return new Response("Unauthorized: The assigned agent does not belong to this PSP.", { status: 403 });
      }
    }

    const routeId = generateId();

    // Wrap Route + default rates insertion in a database transaction block
    await db.transaction(async (tx: any) => {
      await tx.insert(routes).values({
        id: routeId,
        pspId: pspId,
        name,
        description,
        collectionSchedule: collectionSchedule || "Mondays & Thursdays",
        assignedAgentId,
      });

      if (rates && rates.length > 0) {
        const batchRates = rates.map(rate => ({
          routeId,
          billingCategory: rate.category,
          monthlyRate: Math.round(rate.monthlyRate * 100) / 100,
        }));
        
        await tx.insert(routeBillingRates).values(batchRates);
      }
    });

    return new Response(JSON.stringify({ status: "success", routeId }), { status: 201 });
  } catch (error: any) {
    console.error("Create Route Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

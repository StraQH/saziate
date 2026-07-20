import { createRouteSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { routes, routeBillingRates } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";

export const runtime = "edge";

export async function GET(req: Request) {
  const env = process.env as any;
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = process.env as any;
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

    const routeId = generateId();

    // SQL transactional write creating Route + Default rates
    await db.insert(routes).values({
      id: routeId,
      pspId: pspId,
      name,
      description,
      collectionSchedule: collectionSchedule || "Mondays & Thursdays",
      assignedAgentId,
    });

    if (rates && rates.length > 0) {
      for (const rate of rates) {
        await db.insert(routeBillingRates).values({
          routeId,
          billingCategory: rate.category,
          monthlyRate: rate.monthlyRate,
        });
      }
    }

    return new Response(JSON.stringify({ status: "success", routeId }), { status: 201 });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

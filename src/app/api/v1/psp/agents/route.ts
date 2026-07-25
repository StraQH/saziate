import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
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
          eq(users.pspId, pspId),
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
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { collectionLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
    }

    if (config.isMockMode) {
      // Mock collection logs for Babajide Sanwo r1
      return new Response(
        JSON.stringify([
          {
            id: "col-001",
            status: "collected",
            notes: "Collected on schedule",
            loggedAt: "18 Jul 2026, 08:30 AM",
            loggedBy: "Field Agent Johnson",
          },
          {
            id: "col-002",
            status: "no_access",
            notes: "Gate locked",
            loggedAt: "15 Jul 2026, 09:12 AM",
            loggedBy: "Field Agent Johnson",
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Query collectionLogs from D1
    const results = await db
      .select()
      .from(collectionLogs)
      .where(eq(collectionLogs.residentId, residentId))
      .orderBy(collectionLogs.loggedAt)
      .all();

    const formatted = results.map((col: any) => ({
      id: col.id,
      status: col.status,
      notes: col.notes || "None",
      loggedAt: new Date(col.loggedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) + ", " + new Date(col.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      loggedBy: "Field Agent",
    }));

    return new Response(JSON.stringify(formatted), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { getDb } from "@/db";
import { notificationLogs } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";



export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    // Calculate beginning of the current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch logs for the current month
    const logs = await db
      .select()
      .from(notificationLogs)
      .where(
        and(
          eq(notificationLogs.pspId, pspId),
          gte(notificationLogs.createdAt, startOfMonth)
        )
      )
      .all();

    // Aggregate costs
    const totalCost = logs.reduce((sum: number, log: any) => sum + (log.costNgn || 0), 0);
    const smsCount = logs.filter((log: any) => log.channel === "sms" && log.status === "sent").length;
    const whatsappCount = logs.filter((log: any) => log.channel === "whatsapp" && log.status === "sent").length;
    const failedCount = logs.filter((log: any) => log.status === "failed").length;

    return new Response(
      JSON.stringify({
        totalCost,
        smsCount,
        whatsappCount,
        failedCount,
        logs: logs.slice(0, 100), // Return last 100 logs
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

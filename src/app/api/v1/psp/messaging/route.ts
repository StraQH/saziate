import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { inArray } from "drizzle-orm";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { config } from "@/lib/config";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { residentIds, messageText } = await req.json() as { residentIds: string[], messageText: string };
    
    if (!residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
      return new Response(JSON.stringify({ error: "No residents selected." }), { status: 400 });
    }
    
    if (!messageText || messageText.trim() === "") {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), { status: 400 });
    }

    // In mock mode, just log it
    if (config.isMockMode || !env.TERMII_API_KEY) {
      console.log(`[MOCK SMS] Sending to ${residentIds.length} residents: ${messageText}`);
      // Simulate slight delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      return new Response(JSON.stringify({ status: "success", queued: residentIds.length }), { status: 200 });
    }

    // Fetch resident phones
    const residents = await db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .where(inArray(users.id, residentIds));

    let queuedCount = 0;

    // Send notifications
    for (const resident of residents) {
      if (!resident.phone) continue;

      await sendNotificationWithFallback({
        dbBinding: env.DB,
        termiiApiKey: env.TERMII_API_KEY,
        pspId: pspId,
        residentId: resident.id,
        phone: resident.phone,
        messageText: messageText,
        messageType: "on_demand_alert",
        channel: "sms",
      });
      queuedCount++;
    }

    return new Response(JSON.stringify({ status: "success", queued: queuedCount }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

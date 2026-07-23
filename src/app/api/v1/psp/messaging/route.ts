import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { config } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";



export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { residentIds, messageText, channel = "email" } = await req.json() as { residentIds: string[], messageText: string, channel: "email" | "sms" | "whatsapp" };
    
    if (!residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
      return new Response(JSON.stringify({ error: "No residents selected." }), { status: 400 });
    }
    
    if (!messageText || messageText.trim() === "") {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), { status: 400 });
    }

    // In mock mode, just log it
    if (config.isMockMode) {
      console.log(`[MOCK ${channel.toUpperCase()}] Sending to ${residentIds.length} residents: ${messageText}`);
      // Simulate slight delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      return new Response(JSON.stringify({ status: "success", queued: residentIds.length }), { status: 200 });
    }

    // Fetch resident contacts
    const residents = await db
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(and(inArray(users.id, residentIds), eq(users.pspId, pspId)));

    let queuedCount = 0;

    if (channel === "sms" || channel === "whatsapp") {
      if (!env.TERMII_API_KEY) {
        return new Response(JSON.stringify({ error: "Messaging provider not configured." }), { status: 500 });
      }
      for (const resident of residents) {
        if (!resident.phone) continue;
        await sendNotificationWithFallback({
          dbBinding: env.DB,
          termiiApiKey: env.TERMII_API_KEY,
          pspId: pspId,
          residentId: resident.id,
          phone: resident.phone,
          messageText: messageText,
          messageType: "on_demand_alert", // Billed cost to PSP operator
          channel: channel as "sms" | "whatsapp",
        });
        queuedCount++;
      }
    } else {
      // Send notifications via Email
      for (const resident of residents) {
        if (!resident.email) continue;

        await sendEmail({
          to: resident.email,
          subject: "Message from your PSP Operator",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <p>${messageText.replace(/\n/g, '<br/>')}</p>
              <br/>
              <p style="font-size: 12px; color: #6b7280;">This message was sent by your PSP operator via Saziate.</p>
            </div>
          `,
        });
        queuedCount++;
      }
    }

    return new Response(JSON.stringify({ status: "success", queued: queuedCount }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

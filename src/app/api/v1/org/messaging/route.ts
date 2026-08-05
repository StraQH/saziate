export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole, getOrgAvailableBalance } from "@/lib/session";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { inArray, eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { config } from "@/lib/config";
import { checkRateLimit } from "@/lib/rate-limit";



export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const isAllowed = await checkRateLimit(ip, env.DB as any, "org-msg", { max: 20 });
    if (!isAllowed) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const sessionResponse = await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = (sessionResponse.user as any).orgId;

    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { residentIds, messageText, channel = "email" } = await req.json() as any as { residentIds: string[], messageText: string, channel: "email" | "sms" };
    
    if (!residentIds || !Array.isArray(residentIds) || residentIds.length === 0) {
      return new Response(JSON.stringify({ error: "No residents selected." }), { status: 400 });
    }
    
    if (!messageText || messageText.trim() === "") {
      return new Response(JSON.stringify({ error: "Message cannot be empty." }), { status: 400 });
    }

    // Verify operator balance if channel is SMS
    if (channel === "sms" && !config.isMockMode) {
      const estimatedCost = residentIds.length * 6.00;
      const currentBalance = await getOrgAvailableBalance(db, orgId);
      if (currentBalance < estimatedCost) {
        return new Response(
          JSON.stringify({
            error: `Insufficient balance for custom SMS broadcast. Required: \${config.locality.symbol}\${estimatedCost.toFixed(2)}, Available: \${config.locality.symbol}\${currentBalance.toFixed(2)}.`
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // In mock mode, just log it
    if (config.isMockMode) {
      console.log(`[MOCK ${channel.toUpperCase()}] Sending to ${residentIds.length} residents: ${messageText}`);
      // Simulate slight delay
      await new Promise((resolve) => setTimeout(resolve, 800));
      return new Response(JSON.stringify({ status: "success" as any, queued: residentIds.length }), { status: 200 });
    }

    // Fetch resident contacts
    const residents = await db
      .select({ id: users.id, email: users.email, phone: users.phone })
      .from(users)
      .where(and(inArray(users.id, residentIds), eq(users.orgId, orgId)));

    let queuedCount = 0;

    if (channel === "sms") {
      if (!env.TERMII_API_KEY) {
        return new Response(JSON.stringify({ error: "Messaging provider not configured." }), { status: 500 });
      }
      for (const resident of residents) {
        if (!resident.phone) continue;
        await sendNotificationWithFallback({
          dbBinding: env.DB as any,
          termiiApiKey: env.TERMII_API_KEY,
          orgId: orgId,
          residentId: resident.id,
          phone: resident.phone,
          messageText: messageText,
          messageType: "on_demand_alert", // Billed cost to Org operator
          channel: "sms",
        });
        queuedCount++;
      }
    } else {
      // Send notifications via Email
      for (const resident of residents) {
        if (!resident.email) continue;

        await sendEmail({
          to: resident.email,
          subject: "Message from your Org Operator",
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
              <p>${messageText.replace(/\n/g, '<br/>')}</p>
              <br/>
              <p style="font-size: 12px; color: #6b7280;">This message was sent by your Org operator via Saziate.</p>
            </div>
          `,
        });
        queuedCount++;
      }
    }

    return new Response(JSON.stringify({ status: "success" as any, queued: queuedCount }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: (error as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

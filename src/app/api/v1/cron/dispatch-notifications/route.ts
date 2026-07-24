import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { pendingNotifications, notificationLogs } from "@/db/schema";
import { eq, inArray, lt } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { config } from "@/lib/config";
import { generateId } from "@/lib/utils";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  
  // Basic security: require a CRON_SECRET token
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB);
  
  try {
    // 1. Fetch up to 100 pending notifications that haven't failed more than 3 times
    const queue = await db
      .select()
      .from(pendingNotifications)
      .where(lt(pendingNotifications.attempts, 3))
      .limit(100);

    if (queue.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "Queue is empty." }), { status: 200 });
    }

    let successCount = 0;
    let failCount = 0;
    
    const logsToInsert: any[] = [];
    const idsToDelete: string[] = [];
    
    // 2. Dispatch notifications concurrently
    // Limit concurrency to 25 to prevent Termii/Resend rate limits and Cloudflare resource limits
    const BATCH_SIZE = 25;
    for (let i = 0; i < queue.length; i += BATCH_SIZE) {
      const batch = queue.slice(i, i + BATCH_SIZE);
      
      await Promise.allSettled(batch.map(async (notification) => {
        try {
          if (notification.channel === "email") {
            const { subject, html } = JSON.parse(notification.messageText);
            await sendEmail({
              to: notification.recipientPhone, // we stored email here
              subject,
              html,
            });
            
            logsToInsert.push({
              id: generateId(),
              pspId: notification.pspId,
              residentId: notification.residentId,
              channel: "email",
              messageType: notification.messageType,
              costNgn: 0,
              status: "sent",
              createdAt: new Date(),
            });
            
          } else {
            // SMS / WhatsApp fallback
            await sendNotificationWithFallback({
              dbBinding: env.DB,
              termiiApiKey: env.TERMII_API_KEY || "",
              pspId: notification.pspId,
              residentId: notification.residentId || "",
              phone: notification.recipientPhone,
              messageText: notification.messageText,
              messageType: notification.messageType,
              channel: notification.channel as "sms" | "whatsapp",
            });
          }
          
          idsToDelete.push(notification.id);
          successCount++;
        } catch (error: any) {
          // Increment attempts on failure
          await db.update(pendingNotifications)
            .set({ 
              attempts: notification.attempts + 1, 
              lastAttemptAt: new Date(),
              error: error.message || "Unknown error"
            })
            .where(eq(pendingNotifications.id, notification.id));
            
          failCount++;
        }
      }));
    }
    
    // 3. Clean up queue and write logs
    if (idsToDelete.length > 0) {
      await db.delete(pendingNotifications).where(inArray(pendingNotifications.id, idsToDelete));
    }
    
    if (logsToInsert.length > 0) {
      await db.insert(notificationLogs).values(logsToInsert);
    }
    
    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Dispatched ${successCount} successfully. Failed: ${failCount}.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Dispatch Cron Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

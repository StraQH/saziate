import { TermiiClient } from "./termii";
import { getDb } from "@/db";
import { notificationLogs, pendingNotifications } from "@/db/schema";
import { generateId } from "./utils";
import { eq, and } from "drizzle-orm";

export interface NotificationParams {
  dbBinding: any;
  termiiApiKey: string;
  pspId: string;
  residentId: string | null;
  phone: string;
  messageText: string;
  messageType: string;
  channel: "sms" | "whatsapp";
}

/**
 * Attempts to send message via Termii. Registers failed dispatches to the D1 retry queue automatically.
 */
export async function sendNotificationWithFallback(params: NotificationParams) {
  const db = getDb(params.dbBinding);
  const logId = generateId();
  
  const costNgn = params.channel === "whatsapp" ? 12.00 : 4.00;
  const cleanedPhone = params.phone.replace("+", "");

  try {
    const termii = new TermiiClient(params.termiiApiKey);
    let result;
    if (params.channel === "whatsapp") {
      result = await termii.sendWhatsApp({ to: cleanedPhone, sms: params.messageText });
    } else {
      result = await termii.sendSMS({ to: cleanedPhone, sms: params.messageText });
    }

    // Success log
    await db.insert(notificationLogs).values({
      id: logId,
      pspId: params.pspId,
      residentId: params.residentId,
      channel: params.channel,
      messageType: params.messageType,
      costNgn: costNgn,
      termiiMessageId: result.message_id || null,
      status: "sent",
    });

    return { status: "sent", messageId: result.message_id };
  } catch (err: any) {
    console.error("Notification dispatch failed, adding to retry queue:", err);

    // Write failed log
    await db.insert(notificationLogs).values({
      id: logId,
      pspId: params.pspId,
      residentId: params.residentId,
      channel: params.channel,
      messageType: params.messageType,
      costNgn: 0.00,
      termiiMessageId: null,
      status: "failed",
    });

    // Write to pending notifications retry queue
    const pendingId = generateId();
    await db.insert(pendingNotifications).values({
      id: pendingId,
      pspId: params.pspId,
      residentId: params.residentId,
      channel: params.channel,
      messageType: params.messageType,
      recipientPhone: cleanedPhone,
      messageText: params.messageText,
      attempts: 1,
      lastAttemptAt: new Date(),
      error: err.message || "Unknown gateway error",
    });

    return { status: "queued", error: err.message };
  }
}

/**
 * Cron trigger function to process all pending retries from D1
 */
export async function processPendingRetries(dbBinding: any, termiiApiKey: string) {
  const db = getDb(dbBinding);

  // Retrieve pending queue items where attempts < 5
  const pending = await db
    .select()
    .from(pendingNotifications)
    .all();

  const termii = new TermiiClient(termiiApiKey);

  for (const item of pending) {
    if (item.attempts >= 5) {
      // Exceeded max retry count, remove or log warning
      await db.delete(pendingNotifications).where(eq(pendingNotifications.id, item.id));
      continue;
    }

    try {
      let result;
      if (item.channel === "whatsapp") {
        result = await termii.sendWhatsApp({ to: item.recipientPhone, sms: item.messageText });
      } else {
        result = await termii.sendSMS({ to: item.recipientPhone, sms: item.messageText });
      }

      // Re-log success to notification logs
      const logId = generateId();
      const costNgn = item.channel === "whatsapp" ? 12.00 : 4.00;
      await db.insert(notificationLogs).values({
        id: logId,
        pspId: item.pspId,
        residentId: item.residentId,
        channel: item.channel,
        messageType: item.messageType,
        costNgn: costNgn,
        termiiMessageId: result.message_id || null,
        status: "sent",
      });

      // Clear from queue
      await db.delete(pendingNotifications).where(eq(pendingNotifications.id, item.id));
    } catch (err: any) {
      // Increment attempts
      await db
        .update(pendingNotifications)
        .set({
          attempts: item.attempts + 1,
          lastAttemptAt: new Date(),
          error: err.message || "Unknown gateway error",
        })
        .where(eq(pendingNotifications.id, item.id));
    }
  }
}

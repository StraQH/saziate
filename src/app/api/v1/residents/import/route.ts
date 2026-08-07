export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, accounts, zoneResidents, zones, auditLogs } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateId, generateSecurePassword, normalizePhoneNumber } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { getActiveorgId, requireRole } from "@/lib/session";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { smsTemplates } from "@/lib/sms-templates";
import { z } from "zod";
import { config } from "@/lib/config";

const importResidentsSchema = z.object({
  residents: z.array(
    z.object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
      phone: z.string().optional(),
      address: z.string().optional(),
      ward: z.string().optional(),
      lga: z.string().optional(),
      billingCategory: z.enum(["commercial", "residential", "industrial", "health"]).optional(),
      baseRate: z.number().optional(),
      zone: z.string().optional(),
    }).refine((data) => data.email || data.phone, {
      message: "Either email or phone number is required for each resident",
    })
  ),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);

    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = importResidentsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residents } = parsed.data;

    // Verify Zone Ownership for all imported residents
    const zoneIds = [...new Set(residents.map((r) => r.zone).filter(Boolean))] as string[];
    const zoneMap = new Map<string, any>();

    if (zoneIds.length > 0) {
      const validZones = await db
        .select()
        .from(zones)
        .where(inArray(zones.id, zoneIds));
      
      for (const zone of validZones) {
        zoneMap.set(zone.id, zone);
      }
      
      for (const zoneId of zoneIds) {
        const zone = zoneMap.get(zoneId);
        if (!zone || zone.orgId !== orgId) {
          return new Response(`Invalid zone ID (${zoneId}) or unauthorized to assign to this zone.`, { status: 403 });
        }
      }
    }

    // Optimization: Bulk query max sequence orders to avoid loop queries
    const maxSeqMap = new Map<string, number>();
    if (zoneIds.length > 0) {
      const maxSeqs = await db
        .select({
          zoneId: zoneResidents.zoneId,
          maxSeq: sql<number>`MAX(${zoneResidents.sequenceOrder})`,
        })
        .from(zoneResidents)
        .where(inArray(zoneResidents.zoneId, zoneIds))
        .groupBy(zoneResidents.zoneId);

      for (const s of maxSeqs) {
        maxSeqMap.set(s.zoneId, Number(s.maxSeq || 0));
      }
    }

    const notificationQueue: any[] = [];

    for (const res of residents) {
      const userId = generateId();
      const tempPassword = generateSecurePassword(8);
      const normalizedPhone = res.phone ? normalizePhoneNumber(res.phone) : null;
      const finalEmail = res.email || (normalizedPhone ? `${normalizedPhone}@saziate.com` : null);

      if (!finalEmail && !normalizedPhone) continue;

      const name = `${res.firstName || ""} ${res.lastName || ""}`.trim() || (finalEmail ? finalEmail.split("@")[0] : normalizedPhone!);

      await db.transaction(async (tx) => {
        await tx.insert(users).values({
          id: userId,
          orgId,
          name,
          firstName: res.firstName || null,
          lastName: res.lastName || null,
          email: finalEmail!,
          phone: normalizedPhone,
          role: "resident",
          mustChangePassword: true,
        });

        await tx.insert(residentProfiles).values({
          userId,
          address: res.address || "",
          ward: res.ward || null,
          lga: res.lga || null,
          state: null,
          billingCategory: res.billingCategory || "residential",
          customMonthlyRate: res.baseRate || null,
        });

        if (res.zone && zoneMap.has(res.zone)) {
          const currentSeq = (maxSeqMap.get(res.zone) || 0) + 1;
          maxSeqMap.set(res.zone, currentSeq);

          await tx.insert(zoneResidents).values({
            zoneId: res.zone,
            residentId: userId,
            sequenceOrder: currentSeq,
          });
        }
      });

      // Notification dispatch logic (Email priority, SMS fallback if only phone provided)
      if (res.email) {
        notificationQueue.push(
          sendEmail({
            to: res.email,
            subject: "Welcome to Saziate",
            html: emailTemplates.welcomeResident(res.firstName || "Resident", tempPassword),
          })
        );
      } else if (normalizedPhone) {
        notificationQueue.push(
          sendNotificationWithFallback({
            dbBinding: env.DB as any,
            termiiApiKey: env.TERMII_API_KEY || "",
            orgId,
            residentId: userId,
            phone: normalizedPhone,
            messageText: smsTemplates.welcomeResident(res.firstName || "Resident", tempPassword),
            messageType: "onboarding",
            channel: "sms",
          })
        );
      }
    }

    // Process notifications asynchronously in background
    Promise.allSettled(notificationQueue).catch((err) => console.error("Error dispatching import notifications:", err));

    return new Response(
      JSON.stringify({
        status: "success",
        count: residents.length,
        message: `Successfully imported ${residents.length} residents.`,
      }),
      { status: 200 }
    );
  } catch (error: any) {
    console.error("CSV Import Error:", error);
    return new Response(`Import failed: ${error.message}`, { status: 500 });
  }
}

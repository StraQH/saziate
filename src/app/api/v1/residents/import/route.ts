import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, accounts, routeResidents, routes, auditLogs } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateId, generateSecurePassword, normalizePhoneNumber } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { z } from "zod";

export const runtime = "edge";

const importResidentsSchema = z.object({
  residents: z.array(z.object({
    name: z.string().min(1),
    email: z.string().optional(),
    phone: z.string().min(1),
    address: z.string().min(1),
    billingCategory: z.enum(["commercial", "residential", "industrial", "health"]),
    baseRate: z.number().positive(),
    route: z.string().optional(),
  })),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = importResidentsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residents } = parsed.data;

    // Verify Route Ownership for all imported residents
    const routeIds = [...new Set(residents.map((r: any) => r.route).filter(Boolean))] as string[];
    const routeMap = new Map<string, any>();

    if (routeIds.length > 0) {
      const validRoutes = await db
        .select()
        .from(routes)
        .where(inArray(routes.id, routeIds));
      
      for (const route of validRoutes) {
        routeMap.set(route.id, route);
      }
      
      for (const routeId of routeIds) {
        const route = routeMap.get(routeId);
        if (!route || route.pspId !== pspId) {
          return new Response(`Invalid route ID (${routeId}) or unauthorized to assign to this route.`, { status: 403 });
        }
      }
    }

    // Optimization: Bulk query max sequence orders to avoid loop queries
    const maxSeqMap = new Map<string, number>();
    if (routeIds.length > 0) {
      const maxSeqs = await db
        .select({
          routeId: routeResidents.routeId,
          maxSeq: sql<number>`MAX(${routeResidents.sequenceOrder})`,
        })
        .from(routeResidents)
        .where(inArray(routeResidents.routeId, routeIds))
        .groupBy(routeResidents.routeId);

      for (const s of maxSeqs) {
        maxSeqMap.set(s.routeId, Number(s.maxSeq || 0));
      }
    }

    const insertedCount = [];
    const batchOps: any[] = [];
    const notificationQueue: any[] = [];

    // Dynamically load password hashing
    const betterAuthCrypto = await import("better-auth/crypto");

    for (const res of residents) {
      const userId = generateId();
      const tempPassword = generateSecurePassword(8);
      const normalizedPhone = normalizePhoneNumber(res.phone);
      const finalEmail = res.email || `${normalizedPhone}@saziate.com`;

      const nameParts = res.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Group all inserts into batch array
      batchOps.push(db.insert(users).values({
        id: userId,
        name: res.name,
        firstName,
        lastName,
        phone: normalizedPhone || null,
        email: finalEmail,
        role: "resident",
        pspId: pspId,
      }));

      batchOps.push(db.insert(residentProfiles).values({
        userId,
        address: res.address,
        ward: "Ward A",
        lga: "Eti-Osa",
        billingCategory: res.billingCategory || "residential",
        customMonthlyRate: res.baseRate || null,
        advancePaymentBalance: 0,
      }));

      const hashedPassword = await betterAuthCrypto.hashPassword(tempPassword);
      batchOps.push(db.insert(accounts).values({
        id: generateId(),
        accountId: userId,
        providerId: "credential",
        userId: userId,
        password: hashedPassword,
      }));

      if (res.route) {
        let currentSeq = maxSeqMap.get(res.route) || 0;
        currentSeq++;
        maxSeqMap.set(res.route, currentSeq);

        batchOps.push(db.insert(routeResidents).values({
          routeId: res.route,
          residentId: userId,
          sequenceOrder: currentSeq,
        }));
      }

      insertedCount.push({
        id: userId,
        name: res.name,
        email: finalEmail,
        phone: normalizedPhone || "",
        address: res.address,
        route: res.route || null,
        billingCategory: res.billingCategory || "residential",
        baseRate: res.baseRate || 6000,
        isOverride: false,
        status: "active",
      });

      notificationQueue.push({
        name: res.name,
        email: res.email,
        phone: normalizedPhone,
        userId,
        tempPassword,
      });
    }

    // Write audit log
    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    batchOps.push(db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || pspId,
      action: "residents.imported",
      entityType: "resident_profiles",
      entityId: "bulk",
      meta: JSON.stringify({ count: insertedCount.length }),
    }));

    // Execute database statements in batch chunks of 90 to prevent D1 size limit exceptions
    if (batchOps.length > 0) {
      const CHUNK_SIZE = 90;
      for (let i = 0; i < batchOps.length; i += CHUNK_SIZE) {
        await db.batch(batchOps.slice(i, i + CHUNK_SIZE) as any);
      }
    }

    // Process notification dispatch in parallel (outside the transaction to avoid connection locking)
    const notificationPromises: Promise<any>[] = [];
    for (const notif of notificationQueue) {
      if (notif.phone) {
        const msgText = `Hello ${notif.name}, welcome to Saziate! Your account has been created. Login at the Resident Portal with your phone number and temporary password: ${notif.tempPassword}. Please update your email on login.`;
        notificationPromises.push(
          sendNotificationWithFallback({
            dbBinding: env.DB,
            termiiApiKey: env.TERMII_API_KEY || "",
            pspId,
            residentId: notif.userId,
            phone: notif.phone,
            messageText: msgText,
            messageType: "setup",
            channel: "sms",
          }).catch(err => console.error(`WhatsApp/SMS onboarding failed for ${notif.phone}:`, err))
        );
      }

      const hasRealEmail = notif.email && notif.email.includes("@") && !notif.email.endsWith("@saziate.com");
      if (hasRealEmail) {
        notificationPromises.push(
          sendEmail({
            to: notif.email,
            subject: "Welcome to Saziate!",
            html: emailTemplates.welcomeResident(notif.name.split(" ")[0], notif.tempPassword),
          }).catch(err => console.error(`Welcome email onboarding failed for ${notif.email}:`, err))
        );
      }
    }

    if (notificationPromises.length > 0) {
      const limit = 25;
      for (let i = 0; i < notificationPromises.length; i += limit) {
        await Promise.allSettled(notificationPromises.slice(i, i + limit));
      }
    }

    return new Response(JSON.stringify({ status: "success", count: insertedCount.length, residents: insertedCount }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Import Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

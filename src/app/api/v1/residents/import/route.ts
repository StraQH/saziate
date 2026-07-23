import { importResidentsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, routeResidents, routes } from "@/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateId, generateSecurePassword, normalizePhoneNumber } from "@/lib/utils";
import { SaziateLogger } from "@/lib/logger";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { MOCK_PSP_ID, MOCK_ROUTE_NAME, MOCK_WARD } from "@/lib/mockdata";



export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);
  const logger = new SaziateLogger(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB) || MOCK_PSP_ID;

    const { residents } = await req.json() as {
      residents: {
        name: string;
        email: string;
        phone: string;
        address: string;
        billingCategory: "commercial" | "residential" | "industrial" | "health";
        baseRate: number;
        route: string;
      }[];
    };

    if (!residents || !Array.isArray(residents)) {
      return new Response("Missing or invalid residents array.", { status: 400 });
    }

    // Verify Route Ownership for all imported residents
    const routeIds = [...new Set(residents.map((r: any) => r.route).filter(Boolean))] as string[];
    if (routeIds.length > 0) {
      const validRoutes = await db
        .select()
        .from(routes)
        .where(inArray(routes.id, routeIds));
      
      const validRouteMap = new Map<string, any>(validRoutes.map((r: any) => [r.id, r]));
      
      for (const routeId of routeIds) {
        const route = validRouteMap.get(routeId);
        if (!route || route.pspId !== pspId) {
          return new Response(`Invalid route ID (${routeId}) or unauthorized to assign to this route.`, { status: 403 });
        }
      }
    }

    const insertedCount = [];

    // Process all profiles in D1
    for (const res of residents) {
      const userId = generateId();
      const tempPassword = generateSecurePassword(8);
      const normalizedPhone = normalizePhoneNumber(res.phone);
      const finalEmail = res.email || `${normalizedPhone}@saziate.com`;

      const nameParts = res.name.trim().split(/\s+/);
      const firstName = nameParts[0] || "Unknown";
      const lastName = nameParts.slice(1).join(" ") || "";

      // Create User
      await db.insert(users).values({
        id: userId,
        name: res.name,
        firstName,
        lastName,
        phone: normalizedPhone || null,
        email: finalEmail,
        role: "resident",
        pspId: pspId,
      });

      // Create Resident Profile
      await db.insert(residentProfiles).values({
        userId,
        address: res.address,
        ward: MOCK_WARD,
        lga: "Eti-Osa",
        billingCategory: res.billingCategory || "residential",
        customMonthlyRate: res.baseRate || null,
      });


      // Create credentials account link
      const hashedPassword = await import("bcryptjs").then(bcrypt => bcrypt.hashSync(tempPassword, 10));
      await db.insert(accounts).values({
        id: generateId(),
        accountId: userId,
        providerId: "credential",
        userId: userId,
        password: hashedPassword,
      });

      if (res.route) {
        const maxSeqRecord = await db
          .select({ maxSeq: sql`MAX(sequence_order)` })
          .from(routeResidents)
          .where(eq(routeResidents.routeId, res.route))
          .get();
        const nextSequence = maxSeqRecord?.maxSeq ? (maxSeqRecord.maxSeq as number) + 1 : 1;

        await db.insert(routeResidents).values({
          routeId: res.route,
          residentId: userId,
          sequenceOrder: nextSequence,
        });
      }

      insertedCount.push({
        id: userId,
        name: res.name,
        email: finalEmail,
        phone: normalizedPhone || "",
        address: res.address,
        route: res.route,
        billingCategory: res.billingCategory || "residential",
        baseRate: res.baseRate || 6000,
        isOverride: false,
        status: "active",
      });

      // Dispatch WhatsApp/SMS setup notification via Termii (free onboarding cost)
      if (res.phone) {
        const msgText = `Hello ${res.name}, welcome to Saziate! Your account has been created. Login at the Resident Portal with your phone number and temporary password: ${tempPassword}. Please update your email on login.`;
        await sendNotificationWithFallback({
          dbBinding: env.DB,
          termiiApiKey: env.TERMII_API_KEY || "",
          pspId,
          residentId: userId,
          phone: normalizedPhone,
          messageText: msgText,
          messageType: "setup",
          channel: "sms",
        });
      }

      // Send Welcome Email if real email exists
      const hasRealEmail = res.email && res.email.includes("@") && !res.email.endsWith("@saziate.com");
      if (hasRealEmail) {
        await sendEmail({
          to: res.email,
          subject: "Welcome to Saziate!",
          html: emailTemplates.welcomeResident(res.name.split(" ")[0], tempPassword),
        });
      }
    }

    await logger.logAudit({
      actorId: MOCK_PSP_ID,
      action: "residents.imported",
      entityType: "resident_profiles",
      entityId: "bulk",
      meta: JSON.stringify({ count: insertedCount.length }),
    });

    return new Response(JSON.stringify({ status: "success", count: insertedCount.length, residents: insertedCount }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

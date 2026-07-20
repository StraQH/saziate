import { importResidentsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, routeResidents } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateId, generateResidentReference } from "@/lib/utils";
import { SaziateLogger } from "@/lib/logger";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { MOCK_PSP_ID, MOCK_ROUTE_NAME, MOCK_WARD } from "@/lib/mockdata";

export const runtime = "edge";

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

    const insertedCount = [];

    // Process all profiles in D1
    for (const res of residents) {
      const userId = generateId();
      const refCode = generateResidentReference("LEK", Math.floor(Math.random() * 900) + 100);

      // Create User
      await db.insert(users).values({
        id: userId,
        name: res.name,
        phone: res.phone || null,
        email: res.email,
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
        referenceCode: refCode,
        customMonthlyRate: res.baseRate || null,
      });

      const tempPassword = `SZ-${Math.floor(100000 + Math.random() * 900000)}`;

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
        email: res.email,
        phone: res.phone || "",
        address: res.address,
        route: res.route,
        billingCategory: res.billingCategory || "residential",
        baseRate: res.baseRate || 6000,
        isOverride: false,
        referenceCode: refCode,
        status: "active",
      });

      // Dispatch WhatsApp/SMS setup notification via Termii with fallback queue integration
      if (res.phone) {
        const msgText = `Hello ${res.name}, welcome to Saziate! Your account has been created. Login at the Resident Portal with your phone number and temporary password: ${tempPassword}. Your unique payment reference code is ${refCode}.`;
        await sendNotificationWithFallback({
          dbBinding: env.DB,
          termiiApiKey: env.TERMII_API_KEY || "dummy_key",
          pspId,
          residentId: userId,
          phone: res.phone,
          messageText: msgText,
          messageType: "setup",
          channel: "whatsapp",
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

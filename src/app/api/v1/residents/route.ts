import { createResidentSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, routeResidents } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateId, generateResidentReference } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { auditLogs } from "@/db/schema";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export const runtime = "edge";

export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const profiles = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        address: residentProfiles.address,
        billingCategory: residentProfiles.billingCategory,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        referenceCode: residentProfiles.referenceCode,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .where(eq(users.pspId, pspId));

    return new Response(JSON.stringify(profiles), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = createResidentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { firstName, lastName, email, phone, address, billingCategory, baseRate, isOverride, route } = body;

    if (!firstName || !lastName || !email || !phone || !address || !route) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const name = `${firstName} ${lastName}`;

    // Duplicate phone validation
    const existing = await db
      .select()
      .from(users)
      .where(eq(users.phone, phone))
      .get();

    if (existing) {
      return new Response("A resident with this phone number already exists.", { status: 400 });
    }

    const userId = generateId();
    const referenceCode = generateResidentReference("LEK", Math.floor(Math.random() * 900) + 100);

    const tempPassword = `SZ-${Math.floor(100000 + Math.random() * 900000)}`;

    await db.insert(users).values({
      id: userId,
      name,
      firstName,
      lastName,
      phone,
      email,
      role: "resident",
      pspId: pspId,
    });

    await db.insert(residentProfiles).values({
      userId,
      address,
      ward: "Lekki Ward A",
      lga: "Eti-Osa",
      billingCategory,
      referenceCode,
      customMonthlyRate: isOverride ? (typeof baseRate === "number" ? baseRate : parseFloat(baseRate)) : null,
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

    // Find the max sequence order for this route and append the new resident
    const maxSeqRecord = await db
      .select({ maxSeq: sql`MAX(sequence_order)` })
      .from(routeResidents)
      .where(eq(routeResidents.routeId, route))
      .get();
    const nextSequence = maxSeqRecord?.maxSeq ? (maxSeqRecord.maxSeq as number) + 1 : 1;

    await db.insert(routeResidents).values({
      routeId: route,
      residentId: userId,
      sequenceOrder: nextSequence,
    });

    // Dispatch WhatsApp/SMS setup notification via Termii with fallback queue integration
    if (phone) {
      const termiiKey = env.TERMII_API_KEY;
      if (!termiiKey) {
        throw new Error("TERMII_API_KEY is required for notifications.");
      }
      const msgText = `Hello ${firstName}, welcome to Saziate! Your account has been created. Login at the Resident Portal with your phone number and temporary password: ${tempPassword}. Your unique payment reference code is ${referenceCode}.`;
      await sendNotificationWithFallback({
        dbBinding: env.DB,
        termiiApiKey: termiiKey,
        pspId,
        residentId: userId,
        phone,
        messageText: msgText,
        messageType: "setup",
        channel: "whatsapp",
      });
    }

    // Send Welcome Email
    if (email) {
      await sendEmail({
        to: email,
        subject: "Welcome to Saziate!",
        html: emailTemplates.welcomeResident(firstName, tempPassword, referenceCode),
      });
    }

    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || pspId,
      action: "resident.created",
      entityType: "user",
      entityId: userId,
      meta: JSON.stringify({ isOverride, customMonthlyRate: isOverride ? baseRate : null }),
    });

    return new Response(
      JSON.stringify({
        status: "success",
        resident: {
          id: userId,
          firstName,
          lastName,
          name,
          email,
          phone,
          address,
          route,
          billingCategory,
          baseRate: typeof baseRate === "number" ? baseRate : parseFloat(baseRate),
          isOverride,
          referenceCode,
          status: "active",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { userId } = await req.json() as { userId: string };
    if (!userId) {
      return new Response("Missing userId parameter.", { status: 400 });
    }

    // Verify user belongs to this PSP operator before deletion
    const existing = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.pspId, pspId)))
      .get();

    if (!existing) {
      return new Response("Resident not found under this PSP operator.", { status: 404 });
    }

    // Perform soft-delete (anonymize fields, keep relational invoices intact)
    await db
      .update(users)
      .set({
        name: "Anonymized Resident",
        phone: null,
        email: `${userId}-deleted@saziate.com`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const session = await auth(env.DB).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || pspId,
      action: "resident.deleted",
      entityType: "user",
      entityId: userId,
      meta: JSON.stringify({ pspId }),
    });

    return new Response(JSON.stringify({ status: "success", userId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

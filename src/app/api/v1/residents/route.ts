import { getAppEnv } from "@/lib/env";
import { createResidentSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, routeResidents, routes } from "@/db/schema";
import { eq, and, sql, like } from "drizzle-orm";
import { generateSecureReference, generateSecurePassword, generateId, calculateResidentBill, normalizePhoneNumber } from "@/lib/utils";
import { getActivePspId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { auditLogs } from "@/db/schema";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    
    const offset = (page - 1) * limit;

    let baseQuery = db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        address: residentProfiles.address,
        billingCategory: residentProfiles.billingCategory,
        customMonthlyRate: residentProfiles.customMonthlyRate,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .where(
        and(
          eq(users.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      );

    const profiles = await baseQuery.limit(limit).offset(offset);
    
    // We also need total count for pagination UI
    const countResult = await db
      .select({ count: sql`COUNT(*)` })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .where(
        and(
          eq(users.pspId, pspId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      )
      .get();
      
    const totalCount = Number(countResult?.count || 0);

    return new Response(JSON.stringify({
      data: profiles,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

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
    const parsed = createResidentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { firstName, lastName, email, address, billingCategory, baseRate, isOverride, route } = body;
    const phone = normalizePhoneNumber(body.phone);

    if (!firstName || !lastName || !phone || !address || !route) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const name = `${firstName} ${lastName}`;
    const finalEmail = email || `${phone}@saziate.com`;

    // Verify Route Ownership
    const routeRecord = await db
      .select()
      .from(routes)
      .where(eq(routes.id, route))
      .get();
      
    if (!routeRecord || routeRecord.pspId !== pspId) {
      return new Response("Invalid route or unauthorized to assign to this route.", { status: 403 });
    }

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
    const tempPassword = generateSecurePassword(10);

    await db.insert(users).values({
      id: userId,
      name,
      firstName,
      lastName,
      email: finalEmail,
      phone,
      role: "resident",
      pspId: pspId,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(residentProfiles).values({
      userId,
      address,
      ward: "",
      lga: "",
      billingCategory,
      customMonthlyRate: isOverride ? (typeof baseRate === "number" ? baseRate : parseFloat(baseRate)) : null,
    });

    // Create credentials account link
    const hashedPassword = await import("better-auth/crypto").then(c => c.hashPassword(tempPassword));
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

    // Dispatch WhatsApp/SMS setup notification via Termii (free onboarding cost)
    if (phone) {
      const termiiKey = env.TERMII_API_KEY;
      if (!termiiKey) {
        throw new Error("TERMII_API_KEY is required for notifications.");
      }
      const msgText = `Hello ${firstName}, welcome to Saziate! Your account has been created. Login at the Resident Portal with your phone number and temporary password: ${tempPassword}. Please update your email on login.`;
      await sendNotificationWithFallback({
        dbBinding: env.DB,
        termiiApiKey: termiiKey,
        pspId,
        residentId: userId,
        phone,
        messageText: msgText,
        messageType: "setup",
        channel: "sms",
      });
    }

    // Send Welcome Email if real email exists
    const hasRealEmail = email && email.includes("@") && !email.endsWith("@saziate.com");
    if (hasRealEmail) {
      await sendEmail({
        to: email,
        subject: "Welcome to Saziate!",
        html: emailTemplates.welcomeResident(firstName, tempPassword),
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
          email: finalEmail,
          phone,
          address,
          route,
          billingCategory,
          baseRate: typeof baseRate === "number" ? baseRate : parseFloat(baseRate),
          isOverride,
          status: "active",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const env = getAppEnv() as any;
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
        firstName: null,
        lastName: null,
        phone: null,
        email: `${userId}-deleted@saziate.com`,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    // Delete resident profile to halt cron billing engine
    await db
      .delete(residentProfiles)
      .where(eq(residentProfiles.userId, userId));

    // Remove from route to stop showing up on field agent schedules
    await db
      .delete(routeResidents)
      .where(eq(routeResidents.residentId, userId));

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
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

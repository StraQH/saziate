import { getAppEnv } from "@/lib/env";
import { createResidentSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, routeResidents, routes, invoices } from "@/db/schema";
import { eq, and, sql, like, inArray } from "drizzle-orm";
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
    await requireRole(req, env.DB, ["psp_operator", "field_agent"]);
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
        billingModel: residentProfiles.billingModel,
        onDemandTripRate: residentProfiles.onDemandTripRate,
        onDemandBinRate: residentProfiles.onDemandBinRate,
        onDemandDrumRate: residentProfiles.onDemandDrumRate,
        route: routes.name,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .leftJoin(routeResidents, eq(routeResidents.residentId, users.id))
      .leftJoin(routes, eq(routes.id, routeResidents.routeId))
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

    // Fetch invoice aggregates to calculate payment details
    const residentIds = profiles.map((p: any) => p.id);
    let invoicesList: any[] = [];
    if (residentIds.length > 0) {
      invoicesList = await db
        .select()
        .from(invoices)
        .where(inArray(invoices.residentId, residentIds))
        .all();
    }

    const invoicesMap = new Map<string, any[]>();
    for (const inv of invoicesList) {
      if (!invoicesMap.has(inv.residentId)) {
        invoicesMap.set(inv.residentId, []);
      }
      invoicesMap.get(inv.residentId)!.push(inv);
    }

    const mappedData = profiles.map((p: any) => {
      const pInvoices = invoicesMap.get(p.id) || [];
      const pendingOrOverdue = pInvoices.filter((i) => ["pending", "overdue"].includes(i.status));
      const outstandingBalance = pendingOrOverdue.reduce((sum: number, i: any) => sum + i.totalAmount, 0);
      
      let status = "paid";
      let activeInvoiceId = null;
      
      const activeInvoice = pendingOrOverdue.sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      if (activeInvoice) {
        activeInvoiceId = activeInvoice.id;
        status = activeInvoice.status === "overdue" ? "overdue" : "unpaid";
      }

      const paidInvoices = pInvoices
        .filter((i) => i.status === "paid")
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const lastPaymentAmount = paidInvoices[0]?.totalAmount || 0;
      const lastPaymentDate = paidInvoices[0] ? new Date(paidInvoices[0].createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;

      return {
        ...p,
        outstandingBalance,
        status,
        lastPaymentAmount,
        lastPaymentDate,
        activeInvoiceId,
      };
    });

    return new Response(JSON.stringify({
      data: mappedData,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("GET Residents error:", error);
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
    const { firstName, lastName, email, address, billingCategory, baseRate, isOverride, route, billingModel, onDemandTripRate, onDemandBinRate, onDemandDrumRate } = body;
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
      mustChangePassword: true,
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
      billingModel: billingModel || "subscription",
      onDemandTripRate: onDemandTripRate || 0,
      onDemandBinRate: onDemandBinRate || 0,
      onDemandDrumRate: onDemandDrumRate || 0,
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

    // Send Welcome Email if real email exists; otherwise, fallback to SMS onboarding notification
    try {
      const hasRealEmail = email && email.includes("@") && !email.endsWith("@saziate.com");
      if (hasRealEmail) {
        await sendEmail({
          to: email,
          subject: "Welcome to Saziate!",
          html: emailTemplates.welcomeResident(firstName, tempPassword),
        });
      } else if (phone) {
        const termiiKey = env.TERMII_API_KEY;
        if (termiiKey) {
          const msgText = `Hello ${firstName}, welcome to Saziate! Your account has been created. Log in at saziate.com with your phone number and temporary password: ${tempPassword}. Please update your email on login.`;
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
        } else {
          console.warn("Termii API key is not configured. Skipping welcome SMS onboarding notification.");
        }
      }
    } catch (notifErr) {
      console.error("Non-blocking notification warning: Onboarding notification failed:", notifErr);
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
          route: routeRecord.name,
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

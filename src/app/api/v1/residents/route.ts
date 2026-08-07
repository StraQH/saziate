export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { createResidentSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, residentProfiles, notificationLogs, accounts, zoneResidents, zones, invoices, zoneBillingRates } from "@/db/schema";
import { eq, and, sql, like, inArray } from "drizzle-orm";
import { generateSecureReference, generateSecurePassword, generateId, calculateResidentBill, normalizePhoneNumber } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { getActiveorgId, requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";
import { auditLogs } from "@/db/schema";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { smsTemplates } from "@/lib/sms-templates";



export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin", "field_agent"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
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
        propertyType: residentProfiles.propertyType,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        billingModel: residentProfiles.billingModel,
        
        onDemandUnit1Rate: residentProfiles.onDemandUnit1Rate,
        onDemandUnit2Rate: residentProfiles.onDemandUnit2Rate,
        zone: zones.name,
        zoneMonthlyRate: zoneBillingRates.monthlyRate,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .leftJoin(zoneResidents, eq(zoneResidents.residentId, users.id))
      .leftJoin(zones, eq(zones.id, zoneResidents.zoneId))
      .leftJoin(
        zoneBillingRates,
        and(
          eq(zoneBillingRates.zoneId, zones.id),
          eq(zoneBillingRates.billingCategory, residentProfiles.billingCategory)
        )
      )
      .where(
        and(
          eq(users.orgId, orgId),
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
          eq(users.orgId, orgId),
          search ? like(users.name, `%${search}%`) : undefined
        )
      )
      .get();
      
    const totalCount = Number(countResult?.count || 0);

    // Fetch invoice aggregates to calculate payment details
    const residentIds = profiles.map((p) => p.id);
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
      if (!invoicesMap.has((inv as any).residentId)) {
        invoicesMap.set((inv as any).residentId, []);
      }
      invoicesMap.get((inv as any).residentId)!.push(inv);
    }

    const mappedData = profiles.map((p) => {
      const pInvoices = invoicesMap.get(p.id) || [];
      const pendingOrOverdue = pInvoices.filter((i) => ["pending", "overdue"].includes(i.status));
      const outstandingBalance = pendingOrOverdue.reduce((sum: number, i) => sum + i.totalAmount, 0);
      
      let paymentStatus = "paid";
      let activeInvoiceId = null;
      
      const activeInvoice = pendingOrOverdue.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
      if (activeInvoice) {
        activeInvoiceId = activeInvoice.id;
        paymentStatus = activeInvoice.status === "overdue" ? "overdue" : "unpaid";
      }

      const paidInvoices = pInvoices
        .filter((i) => i.status === "paid")
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      
      const lastPaymentAmount = paidInvoices[0]?.totalAmount || 0;
      const lastPaymentDate = paidInvoices[0] ? new Date(paidInvoices[0].createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : null;

      return {
        ...p,
        baseRate: p.customMonthlyRate !== null ? p.customMonthlyRate : (p.zoneMonthlyRate || 0),
        isOverride: p.customMonthlyRate !== null,
        outstandingBalance,
        status: "active",
        paymentStatus,
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
    console.error("[API Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

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
    const parsed = createResidentSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { firstName, lastName, email, address, billingCategory, propertyType, baseRate, isOverride, zone, billingModel, onDemandUnit1Rate, onDemandUnit2Rate } = body;
    const phone = body.phone ? normalizePhoneNumber(body.phone) : "";

    if (!zone) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const name = `${firstName} ${lastName}`;
    const finalEmail = email || `${phone}@saziate.com`;

    // Verify Route Ownership
    const zoneRecord = await db
      .select()
      .from(zones)
      .where(eq(zones.id, zone))
      .get();
      
    if (!zoneRecord || zoneRecord.orgId !== orgId) {
      return new Response("Invalid zone or unauthorized to assign to this zone.", { status: 403 });
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
      orgId: orgId,
      emailVerified: true,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(residentProfiles).values({
      userId,
      address: address || "",
      ward: "",
      lga: "",
      state: "",
      billingCategory,
      propertyType: propertyType || null,
      customMonthlyRate: isOverride ? (typeof baseRate === "number" ? baseRate : parseFloat(baseRate)) : null,
      billingModel: billingModel || "subscription",
      onDemandUnit1Rate: onDemandUnit1Rate || 0,
      onDemandUnit2Rate: onDemandUnit2Rate || 0,
    });

    // Create credentials account link
    const hashedPassword = await hashPassword(tempPassword);
    await db.insert(accounts).values({
      id: generateId(),
      accountId: userId,
      providerId: "credential",
      userId: userId,
      password: hashedPassword,
    });

    // Find the max sequence order for this zone and append the new resident
    const maxSeqRecord = await db
      .select({ maxSeq: sql`MAX(sequence_order)` })
      .from(zoneResidents)
      .where(eq(zoneResidents.zoneId, zone))
      .get();
    const nextSequence = maxSeqRecord?.maxSeq ? (maxSeqRecord.maxSeq as number) + 1 : 1;

    await db.insert(zoneResidents).values({
      zoneId: zone,
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
          html: emailTemplates.welcomeResident(firstName || "Resident", tempPassword),
        });
      } else if (phone) {
        const termiiKey = env.TERMII_API_KEY;
        if (termiiKey) {
          const msgText = smsTemplates.welcomeResident(firstName || "Resident", tempPassword);
          await sendNotificationWithFallback({
            dbBinding: env.DB as any,
            termiiApiKey: termiiKey,
            orgId,
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

    const session = await auth(env.DB as any).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || orgId,
      action: "resident.created",
      entityType: "user",
      entityId: userId,
      meta: JSON.stringify({ isOverride, customMonthlyRate: isOverride ? baseRate : null }),
    });

    return new Response(
      JSON.stringify({
        status: "success" as any,
        resident: {
          id: userId,
          firstName,
          lastName,
          name,
          email: finalEmail,
          phone,
          address,
          zone: zoneRecord.name,
          billingCategory,
          propertyType: propertyType || null,
          baseRate: isOverride ? (typeof baseRate === "number" ? baseRate : parseFloat(baseRate)) : 0,
          isOverride,
          status: "active",
        },
      }),
      { status: 201, headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[API Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { userId } = await req.json() as any as { userId: string };
    if (!userId) {
      return new Response("Missing userId parameter.", { status: 400 });
    }

    // Verify user belongs to this PSP operator before deletion
    const existing = await db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), eq(users.orgId, orgId)))
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

    // Remove from zone to stop showing up on field agent schedules
    await db
      .delete(zoneResidents)
      .where(eq(zoneResidents.residentId, userId));

    const session = await auth(env.DB as any).api.getSession({ headers: req.headers });
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: session?.user?.id || orgId,
      action: "resident.deleted",
      entityType: "user",
      entityId: userId,
      meta: JSON.stringify({ orgId }),
    });

    return new Response(JSON.stringify({ status: "success" as any, userId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("[API Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

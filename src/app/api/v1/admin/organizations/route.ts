export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { registerorganizationschema, approveorganizationschema } from "@/lib/validators";
import { getDb } from "@/db";
import { organizations, users, accounts, transactions } from "@/db/schema";
import { eq, sql, and, notLike } from "drizzle-orm";
import { generateId, generateSecurePassword } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["admin"]);
    const list = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        rcNumber: organizations.rcNumber,
        address: organizations.address,
        contactPhone: organizations.contactPhone,
        contactEmail: organizations.contactEmail,
        settlementAccountNumber: organizations.settlementAccountNumber,
        settlementBankCode: organizations.settlementBankCode,
      })
      .from(organizations)
      .all();
      
    // Fetch settlement volume for each Org
    const volumes = await db
      .select({
        orgId: users.orgId,
        total: sql<number>`SUM(${transactions.amount})`
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.residentId, users.id))
      .where(and(
        eq(transactions.paymentMethod, "bank_transfer"),
        eq(transactions.status, "success"),
        notLike(transactions.reference, "PAYOUT-%")
      ))
      .groupBy(users.orgId)
      .all();
      
    const volumeMap = new Map(volumes.map((v) => [v.orgId, v.total || 0]));

    const result = list.map((org) => ({
      ...org,
      totalSettlementVolume: volumeMap.get(org.id) || 0,
      status: org.settlementAccountNumber ? "verified" : "pending_verification"
    }));

    return new Response(JSON.stringify(result), {
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

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["admin"]);
    const rawBody = await req.json() as any;
    const parsed = registerorganizationschema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, rcNumber, address, contactPhone, contactEmail } = body;

    if (!name || !address || !contactPhone || !contactEmail) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const orgId = generateId();

    // 1. Insert Org record
    await db.insert(organizations).values({
      id: orgId,
      name,
      rcNumber: rcNumber || null,
      address,
      contactPhone,
      contactEmail,
    });

    // 2. Create User account for Org Operator
    const userId = generateId();
    const tempPassword = generateSecurePassword(10);

    await db.insert(users).values({
      id: userId,
      name,
      email: contactEmail,
      phone: contactPhone || null,
      role: "org_admin",
      orgId: orgId,
      emailVerified: true,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 3. Create credentials account link
    const hashedPassword = await hashPassword(tempPassword);
    await db.insert(accounts).values({
      id: generateId(),
      accountId: userId,
      providerId: "credential",
      userId: userId,
      password: hashedPassword,
    });

    // 4. Dispatch welcome onboarding email
    await sendEmail({
      to: contactEmail,
      subject: "Welcome to Saziate! (Operator Account Created)",
      html: emailTemplates.welcomeOrg(name, tempPassword),
    });

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Org registered and operator account created successfully.",
        orgId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Org Registration error:", error);
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

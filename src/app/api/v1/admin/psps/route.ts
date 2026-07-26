import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { registerPspSchema, approvePspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps, users, accounts, transactions } from "@/db/schema";
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
        id: psps.id,
        name: psps.name,
        rcNumber: psps.rcNumber,
        address: psps.address,
        contactPhone: psps.contactPhone,
        contactEmail: psps.contactEmail,
        dvaAccountNumber: psps.dvaAccountNumber,
        settlementAccountNumber: psps.settlementAccountNumber,
        settlementBankCode: psps.settlementBankCode,
      })
      .from(psps)
      .all();
      
    // Fetch settlement volume for each PSP
    const volumes = await db
      .select({
        pspId: users.pspId,
        total: sql<number>`SUM(${transactions.amount})`
      })
      .from(transactions)
      .innerJoin(users, eq(transactions.residentId, users.id))
      .where(and(
        eq(transactions.paymentMethod, "bank_transfer"),
        eq(transactions.status, "success"),
        notLike(transactions.reference, "PAYOUT-%")
      ))
      .groupBy(users.pspId)
      .all();
      
    const volumeMap = new Map(volumes.map((v) => [v.pspId, v.total || 0]));

    const result = list.map((psp) => ({
      ...psp,
      totalSettlementVolume: volumeMap.get(psp.id) || 0
    }));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["admin"]);
    const rawBody = await req.json() as any;
    const parsed = registerPspSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, rcNumber, address, contactPhone, contactEmail } = body;

    if (!name || !address || !contactPhone || !contactEmail) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const pspId = generateId();

    // 1. Insert PSP record
    await db.insert(psps).values({
      id: pspId,
      name,
      rcNumber: rcNumber || null,
      address,
      contactPhone,
      contactEmail,
    });

    // 2. Create User account for PSP Operator
    const userId = generateId();
    const tempPassword = generateSecurePassword(10);

    await db.insert(users).values({
      id: userId,
      name,
      email: contactEmail,
      phone: contactPhone || null,
      role: "psp_operator",
      pspId: pspId,
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
      html: emailTemplates.welcomePspOperator(name, tempPassword),
    });

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "PSP registered and operator account created successfully.",
        pspId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("PSP Registration error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

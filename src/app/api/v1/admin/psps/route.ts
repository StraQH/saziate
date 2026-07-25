import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { registerPspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps, users, accounts } from "@/db/schema";
import { generateId, generateSecurePassword } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);
    const list = await db
      .select()
      .from(psps)
      .all();

    return new Response(JSON.stringify(list), {
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
    await requireRole(req, env.DB, ["admin"]);
    const rawBody = await req.json();
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
    const hashedPassword = await import("better-auth/crypto").then((c) => c.hashPassword(tempPassword));
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
        status: "success",
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

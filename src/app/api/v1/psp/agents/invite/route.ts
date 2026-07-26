import { getAppEnv } from "@/lib/env";
import { requireRole, getActivePspId } from "@/lib/session";
import { getDb } from "@/db";
import { users, accounts, psps } from "@/db/schema";
import { generateId, generateSecurePassword } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1, "Name is required"),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const isAllowed = await checkRateLimit(ip, env.DB as any, "psp-agents", { max: 10 });
    if (!isAllowed) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const sessionResponse = await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { email, name } = parsed.data;

    const psp = await db.select().from(psps).where(eq(psps.id, pspId)).get();
    if (!psp) {
      return new Response("PSP not found.", { status: 404 });
    }

    // 1. Create agent account directly
    const userId = generateId();
    const tempPassword = generateSecurePassword(10);
    const hashedPassword = await hashPassword(tempPassword);

    await db.insert(users).values({
      id: userId,
      name,
      email: email.toLowerCase().trim(),
      role: "field_agent",
      pspId: pspId,
      emailVerified: true,
      mustChangePassword: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(accounts).values({
      id: generateId(),
      accountId: userId,
      providerId: "credential",
      userId: userId,
      password: hashedPassword,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 2. Dispatch onboarding email to agent
    try {
      await sendEmail({
        to: email,
        subject: `Welcome to Saziate! (Field Agent Account Onboarded)`,
        html: emailTemplates.welcomeAgent(name, psp.name, tempPassword),
        apiKey: env.RESEND_API_KEY,
      });
    } catch (emailErr) {
      console.error("Failed to send agent welcome email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Field agent onboarded successfully and credentials email sent.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Onboard Agent Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

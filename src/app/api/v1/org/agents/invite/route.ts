export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole, getActiveorgId } from "@/lib/session";
import { getDb } from "@/db";
import { users, accounts, organizations } from "@/db/schema";
import { generateId, generateSecurePassword } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { eq, and } from "drizzle-orm";
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
    const isAllowed = await checkRateLimit(ip, env.DB as any, "org-agents", { max: 10 });
    if (!isAllowed) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const sessionResponse = await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = (sessionResponse.user as any).orgId;

    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { email, name } = parsed.data;

    const org = await db.select().from(organizations).where(eq(organizations.id, orgId)).get();
    if (!org) {
      return new Response("Org not found.", { status: 404 });
    }

    // 1. Check if user already exists
    let existingUser = await db.select().from(users).where(eq(users.email, email.toLowerCase().trim())).get();
    
    let userId = "";
    const tempPassword = generateSecurePassword(10);
    const hashedPassword = await hashPassword(tempPassword);

    if (existingUser) {
      if (existingUser.role !== "field_agent") {
        return new Response("Email is already registered as a non-agent user.", { status: 400 });
      }
      // Reassign to the new Org
      userId = existingUser.id;
      await db.update(users).set({ orgId: orgId, updatedAt: new Date() }).where(eq(users.id, userId)).run();
      // Update their password
      await db.update(accounts).set({ password: hashedPassword, updatedAt: new Date() }).where(and(eq(accounts.userId, userId), eq(accounts.providerId, "credential"))).run();
    } else {
      userId = generateId();
      await db.insert(users).values({
        id: userId,
        name,
        email: email.toLowerCase().trim(),
        role: "field_agent",
        orgId: orgId,
        emailVerified: true,
        mustChangePassword: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run();

      await db.insert(accounts).values({
        id: generateId(),
        accountId: userId,
        providerId: "credential",
        userId: userId,
        password: hashedPassword,
        createdAt: new Date(),
        updatedAt: new Date(),
      }).run();
    }

    // 2. Dispatch onboarding email to agent
    try {
      await sendEmail({
        to: email,
        subject: `Welcome to Saziate! (Field Agent Account Onboarded)`,
        html: emailTemplates.welcomeAgent(name, org.name, tempPassword),
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

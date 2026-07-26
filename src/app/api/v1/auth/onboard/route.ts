import { getAppEnv } from "@/lib/env";
import { onboardSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users, psps, agentInvitations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId, normalizePhoneNumber } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { SaziateLogger } from "@/lib/logger";
import { auth } from "@/lib/auth";

import { checkRateLimit } from "@/lib/rate-limit";



export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);
  const logger = new SaziateLogger(env.DB as any);

  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  const isAllowed = await checkRateLimit(ip, env.DB as any, "onboard", { max: 10 });
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: { "Content-Type": "application/json" } });
  }

  try {
    const rawBody = await req.json() as any;
    const parsed = onboardSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { userId, phone, role, pspName, rcNumber, address, inviteToken, firstName, lastName } = body;

    if (!userId || !role) {
      return new Response("Missing required onboarding parameters.", { status: 400 });
    }

    const betterAuth = auth(env.DB as any);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    if (!session || !session.user || session.user.id !== userId) {
      return new Response("Unauthorized to onboard this user.", { status: 401 });
    }

    // Verify user exists
    const userRecord = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();

    if (!userRecord) {
      return new Response("User not found.", { status: 404 });
    }

    // Prevent Privilege Escalation & Re-Onboarding
    if (userRecord.pspId || ["psp_operator", "field_agent", "admin"].includes(userRecord.role)) {
      return new Response("User has already been onboarded or possesses an immutable role.", { status: 403 });
    }

    let pspId: string | null = null;

    if (role === "psp_operator") {
      if (!pspName || !address) {
        return new Response("Missing PSP details.", { status: 400 });
      }

      pspId = generateId();

      await db.insert(psps).values({
        id: pspId,
        name: pspName,
        rcNumber: rcNumber || null,
        address,
        contactPhone: phone ? normalizePhoneNumber(phone) : "",
        contactEmail: userRecord.email,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Send Welcome Email
      if (userRecord.email) {
        try {
          await sendEmail({
            to: userRecord.email,
            subject: "Welcome to Saziate! (Action Required)",
            html: emailTemplates.welcomePSP(pspName),
          });
        } catch (emailErr) {
          console.error("Non-blocking email warning: Failed to dispatch onboarding welcome email:", emailErr);
        }
      }
    } else if (role === "field_agent") {
      if (!inviteToken) {
        return new Response("Missing invite token for field agent registration.", { status: 400 });
      }

      const invite = await db
        .select()
        .from(agentInvitations)
        .where(eq(agentInvitations.token, inviteToken))
        .get();

      if (!invite) {
        return new Response("Invalid or expired invitation token.", { status: 400 });
      }

      if (invite.email.toLowerCase() !== userRecord.email.toLowerCase()) {
        return new Response("Invitation email does not match registered email.", { status: 403 });
      }

      if (invite.expiresAt < new Date()) {
        return new Response("Invitation token has expired.", { status: 400 });
      }

      pspId = invite.pspId;

      // Delete the token so it can't be used again
      await db
        .delete(agentInvitations)
        .where(eq(agentInvitations.token, inviteToken));
    }

    let splitFirstName: string | null = null;
    let splitLastName: string | null = null;
    if (userRecord.name) {
      const parts = userRecord.name.trim().split(/\s+/);
      splitFirstName = parts[0] || "Unknown";
      splitLastName = parts.slice(1).join(" ") || "";
    }

    // Update user profile fields with role, associated pspId, and names
    await db
      .update(users)
      .set({
        role,
        firstName: firstName || splitFirstName,
        lastName: lastName || splitLastName,
        phone: phone || null,
        pspId,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    await logger.logAudit({
      actorId: userId,
      action: "user.onboarded",
      entityType: "users",
      entityId: userId,
      meta: JSON.stringify({ role, pspId }),
    });

    return new Response(JSON.stringify({ status: "success" as any, userId, pspId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

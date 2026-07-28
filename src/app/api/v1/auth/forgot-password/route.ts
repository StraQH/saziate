export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, passwordResetTokens, accounts } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { generateSecurePassword, normalizePhoneNumber } from "@/lib/utils";
import { hashPassword } from "@/lib/hash";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const requestSchema = z.object({
  identifier: z.string().min(1, "Email or phone number is required"),
});

const resetSchema = z.object({
  identifier: z.string(),
  token: z.string(),
  newPassword: z.string().min(8),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);
  
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const isAllowed = await checkRateLimit(ip, env.DB as any, "forgot-password", { max: 5, windowMs: 60000 * 5 });
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), { status: 429 });
  }

  try {
    const rawBody = await req.json() as any;
    const parsed = requestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request data" }), { status: 400 });
    }

    const { identifier } = parsed.data;
    const isEmail = identifier.includes("@");
    let user;

    if (isEmail) {
      user = await db.select().from(users).where(eq(users.email, identifier.toLowerCase())).get();
    } else {
      const phone = normalizePhoneNumber(identifier);
      user = await db.select().from(users).where(eq(users.phone, phone)).get();
    }

    if (!user) {
      // Don't reveal user existence
      return new Response(JSON.stringify({ success: true }));
    }

    // Generate 6 digit OTP
    const token = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    await db.insert(passwordResetTokens).values({
      token,
      userId: user.id,
      expiresAt,
    });

    if (isEmail || user.email) {
      // Email
      await sendEmail({
        to: user.email!,
        subject: "Password Reset Request",
        html: emailTemplates.passwordReset(token)
      });
    } else if (user.phone) {
      // SMS for residents/agents ONLY if no email is provided
      const message = `Your Saziate password reset code is: ${token}. Valid for 10 minutes.`;
      await sendNotificationWithFallback({
        dbBinding: env.DB as any,
        termiiApiKey: (env.TERMII_API_KEY as any) as string,
        pspId: user.pspId || "system",
        residentId: user.role === "resident" ? user.id : null,
        phone: user.phone,
        messageText: message,
        messageType: "setup",
        channel: "sms"
      });
    }

    return new Response(JSON.stringify({ success: true }));

  } catch (error: any) {
    console.error("[FORGOT_PASSWORD_POST_ERROR]", error);
    return new Response(JSON.stringify({ error: "An error occurred" }), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);
  
  const ip = req.headers.get("x-forwarded-for") || "unknown";
  const isAllowed = await checkRateLimit(ip, env.DB as any, "reset-password", { max: 10, windowMs: 60000 * 5 });
  if (!isAllowed) {
    return new Response(JSON.stringify({ error: "Too many attempts. Please try again later." }), { status: 429 });
  }

  try {
    const rawBody = await req.json() as any;
    const parsed = resetSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid data" }), { status: 400 });
    }

    const { identifier, token, newPassword } = parsed.data;

    // Verify token
    const tokenRecord = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token)).get();
    
    if (!tokenRecord || new Date() > tokenRecord.expiresAt) {
      return new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 400 });
    }

    const user = await db.select().from(users).where(eq(users.id, tokenRecord.userId)).get();
    if (!user) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 400 });
    }

    // Verify identifier matches
    const isEmail = identifier.includes("@");
    if (isEmail && user.email !== identifier.toLowerCase()) {
      return new Response(JSON.stringify({ error: "Invalid token for this identifier" }), { status: 400 });
    } else if (!isEmail && user.phone !== normalizePhoneNumber(identifier)) {
      return new Response(JSON.stringify({ error: "Invalid token for this identifier" }), { status: 400 });
    }

    // Update password
    const hashedPassword = await hashPassword(newPassword);
    await db.update(accounts)
      .set({ password: hashedPassword })
      .where(eq(accounts.userId, user.id));

    // Clear token
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.token, token));

    return new Response(JSON.stringify({ success: true }));

  } catch (error: any) {
    console.error("[FORGOT_PASSWORD_PATCH_ERROR]", error);
    return new Response(JSON.stringify({ error: "An error occurred" }), { status: 500 });
  }
}

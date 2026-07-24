import { getAppEnv } from "@/lib/env";
import { requireRole, getActivePspId } from "@/lib/session";
import { getDb } from "@/db";
import { agentInvitations, psps } from "@/db/schema";
import { generateId } from "@/lib/utils";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { checkRateLimit } from "@/lib/rate-limit";
import { z } from "zod";

export const runtime = "edge";

const inviteSchema = z.object({
  email: z.string().email(),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(ip)) {
      return new Response("Too Many Requests", { status: 429 });
    }

    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = inviteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { email } = parsed.data;

    const psp = await db.select().from(psps).where(eq(psps.id, pspId)).get();
    if (!psp) {
      return new Response("PSP not found.", { status: 404 });
    }

    const token = generateId() + generateId(); // Long token
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.insert(agentInvitations).values({
      token,
      email: email.toLowerCase().trim(),
      pspId,
      expiresAt,
      createdAt: new Date(),
    });

    const inviteLink = `https://saziate.com/signup?invite=${token}&email=${encodeURIComponent(email)}&role=field_agent`;

    try {
      await sendEmail({
        to: email,
        subject: `You have been invited to join ${psp.name} on Saziate!`,
        html: emailTemplates.inviteAgent(psp.name, inviteLink),
      });
    } catch (emailErr) {
      console.error("Failed to send agent invitation email:", emailErr);
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Agent invitation sent successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Invite Agent Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

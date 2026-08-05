export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { MOCK_AGENT_ID } from "@/lib/mockdata";
import { requireRole } from "@/lib/session";
import { logCashSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { transactions, invoices, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";


export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["field_agent", "org_admin"]);
    let actorId = "";
    if (config.isMockMode) {
      actorId = MOCK_AGENT_ID;
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      actorId = session.user.id;
    }

    const rawBody = await req.json() as any;
    const parsed = logCashSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { invoiceId, residentId, amount: rawAmount } = body;

    if (!invoiceId || !residentId || !rawAmount) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const amount = Math.round((typeof rawAmount === "number" ? rawAmount : parseFloat(rawAmount)) * 100) / 100;

    // Verify invoice status
    const inv = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .get();

    if (!inv) {
      return new Response("Invoice not found.", { status: 404 });
    }

    // Fetch actor's Org ID to ensure cross-tenant safety
    const actorUser = await db
      .select()
      .from(users)
      .where(eq(users.id, actorId))
      .get();
      
    if (!actorUser || !actorUser.orgId) {
      return new Response("Actor does not belong to a Org.", { status: 403 });
    }
    
    if ((inv as any).orgId !== actorUser.orgId) {
      return new Response("Unauthorized to log cash for this invoice.", { status: 403 });
    }

    const txId = generateId();
    const cashRef = `CASH-REC-${Date.now()}`;

    // Insert cash transaction
    await db.insert(transactions).values({
      id: txId,
      invoiceId,
      residentId,
      reference: cashRef,
      amount,
      status: "success" as any,
      paymentMethod: "cash",
      cashStatus: "pending_cash_verification",
      loggedById: actorId,
      paidAt: new Date(),
    });

    // Dispatch instant notification of logged cash (non-blocking)
    try {
      const residentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, residentId))
        .get();

      if (residentUser) {
        const firstName = residentUser.firstName || residentUser.name.split(" ")[0];
        const hasRealEmail = residentUser.email && residentUser.email.includes("@") && !residentUser.email.endsWith("@saziate.com");
        const agentName = actorUser ? actorUser.name : "Field Agent";

        if (hasRealEmail) {
          await sendEmail({
            to: residentUser.email,
            subject: "Cash Payment Logged (Pending Verification)",
            html: `
              <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.5;">
                <h3 style="color: #2563eb;">Saziate Cash Payment Logged</h3>
                <p>Hello ${firstName},</p>
                <p>A cash payment of <strong>₦${amount.toLocaleString(config.locality.locale)}</strong> has been logged at your address by field agent <strong>${agentName}</strong>.</p>
                <p>It is currently awaiting office verification by your operator. Reference: <strong>${cashRef}</strong></p>
                <br/>
                <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #eee; padding-top: 1rem;">This is an automated transaction acknowledgement from Saziate.</p>
              </div>
            `,
          });
        } else if (residentUser.phone) {
          const termiiKey = env.TERMII_API_KEY;
          if (termiiKey) {
            const msgText = `Hello ${firstName}, a cash payment of \${config.locality.symbol}\${amount} has been logged by agent ${agentName}. It is awaiting verification. Ref: ${cashRef}`;
            await sendNotificationWithFallback({
              dbBinding: env.DB as any,
              termiiApiKey: termiiKey,
              orgId: actorUser?.orgId || "system",
              residentId: residentId,
              phone: residentUser.phone,
              messageText: msgText,
              messageType: "payment_receipt",
              channel: "sms",
            });
          }
        }
      }
    } catch (notifErr) {
      console.error("Non-blocking cash logged notification warning:", notifErr);
    }

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Cash payment logged successfully.",
        transactionId: txId,
        reference: cashRef,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Log Cash Error:", error);
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

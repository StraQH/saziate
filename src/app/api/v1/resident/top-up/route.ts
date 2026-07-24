import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { generateId, generateSecureReference } from "@/lib/utils";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

export const runtime = "edge";

const topUpSchema = z.object({
  residentId: z.string().min(1),
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  try {
    const json = await req.json();
    const parsed = topUpSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residentId, amount } = parsed.data;

    // Authenticate resident session
    await requireRole(req, env.DB, ["resident"]);
    const betterAuth = auth(env.DB);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    
    if (!session || !session.user || session.user.id !== residentId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    if (config.isMockMode) {
      const db = getDb(env.DB);

      const resident = await db.select().from(users).where(eq(users.id, residentId)).get();
      if (!resident) {
        return new Response("Invalid resident ID.", { status: 400 });
      }

      const profile = await db.select().from(residentProfiles).where(eq(residentProfiles.userId, residentId)).get();
      if (!profile) {
        return new Response("Resident profile not found.", { status: 404 });
      }

      const txId = generateId();

      // Wrap mutations in db.transaction
      await db.transaction(async (tx: any) => {
        // Update balance directly (simulating successful webhook) with atomic Drizzle update
        await tx.update(residentProfiles)
          .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amount}` })
          .where(eq(residentProfiles.userId, residentId));

        await tx.insert(transactions).values({
          id: txId,
          residentId,
          reference: `PAYSTACK-TOPUP-${generateSecureReference(10)}`,
          amount,
          status: "success",
          paymentMethod: "bank_transfer",
          cashStatus: "settled",
          paidAt: new Date(),
        });

        await tx.insert(auditLogs).values({
          id: generateId(),
          actorId: residentId,
          action: "resident_topup",
          entityType: "resident",
          entityId: residentId,
          meta: JSON.stringify({ amount, provider: "paystack" }),
        });
      });

      if (resident.email) {
        const firstName = resident.firstName || resident.name.split(" ")[0];
        try {
          await sendEmail({
            to: resident.email,
            subject: "Advance Payment Received!",
            html: emailTemplates.advancePaymentReceipt(firstName, amount),
          });
        } catch (emailErr) {
          console.error("Failed to send email receipt:", emailErr);
        }
      }

      return new Response(JSON.stringify({ 
        status: "success", 
        message: "Digital top-up simulated successfully.",
        mockCheckoutUrl: "https://checkout.paystack.com/mock-url-12345" 
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    } else {
      // Live Paystack Integration placeholder
      return new Response(JSON.stringify({ 
        status: "error", 
        error: "Live Paystack integration for Resident Top-Up is not yet implemented."
      }), { status: 501, headers: { "Content-Type": "application/json" } });
    }

  } catch (error: any) {
    console.error("Top-Up Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

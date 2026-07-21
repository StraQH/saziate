import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateId, generateSecureReference } from "@/lib/utils";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { requireRole } from "@/lib/session";
import { auth } from "@/lib/auth";

const topUpSchema = z.object({
  residentId: z.string().min(1),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = topUpSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residentId, amount } = parsed.data;

    // Use environment DB
    const env = process.env as any;
    
    // Authenticate resident session
    await requireRole(req, env.DB, ["resident"]);
    const betterAuth = auth(env.DB);
    const session = await betterAuth.api.getSession({ headers: req.headers });
    
    if (!session || !session.user || session.user.id !== residentId) {
      return new Response("Unauthorized.", { status: 401 });
    }
    
    // In production, this route would initiate a Paystack transaction and return an authorization_url.
    // The actual balance update would happen in the webhook (e.g. /api/v1/psp/webhook/paystack).
    // For this Mock/Demo environment, we will simulate a successful digital payment instantly.

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

      // Update balance directly (simulating successful webhook)
      await db.update(residentProfiles)
        .set({ advancePaymentBalance: (profile.advancePaymentBalance || 0) + amount })
        .where(eq(residentProfiles.userId, residentId));

      const txId = generateId();
      await db.insert(transactions).values({
        id: txId,
        residentId,
        reference: `PAYSTACK-TOPUP-${generateSecureReference(10)}`,
        amount,
        paymentMethod: "bank_transfer",
        cashStatus: "settled",
      });

      await db.insert(auditLogs).values({
        id: generateId(),
        actorId: residentId,
        action: "resident_topup",
        entityType: "resident",
        entityId: residentId,
        meta: JSON.stringify({ amount, provider: "paystack" }),
      });

      if (resident.email) {
        const firstName = resident.firstName || resident.name.split(" ")[0];
        await sendEmail({
          to: resident.email,
          subject: "Advance Payment Received!",
          html: emailTemplates.advancePaymentReceipt(firstName, amount),
        });
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
    return new Response("Internal Server Error", { status: 500 });
  }
}

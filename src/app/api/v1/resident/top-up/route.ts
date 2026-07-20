import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateId } from "@/lib/utils";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

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
    
    // In production, this route would initiate a Paystack transaction and return an authorization_url.
    // The actual balance update would happen in the webhook (e.g. /api/v1/psp/webhook/paystack).
    // For this Mock/Demo environment, we will simulate a successful digital payment instantly.

    if (config.isMockMode) {
      const env = process.env as any;
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
        reference: `PAYSTACK-TOPUP-${Math.floor(Math.random() * 900000) + 100000}`,
        amount,
        paymentMethod: "transfer",
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
        status: "success", 
        message: "Paystack initialization would happen here."
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

  } catch (error: any) {
    console.error("Top-Up Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

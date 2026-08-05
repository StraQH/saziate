export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { users, residentProfiles, transactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { z } from "zod";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";

const topUpSchema = z.object({
  amount: z.number().positive("Amount must be greater than 0"),
  callbackUrl: z.string().optional(),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const session = await requireRole(req, env.DB as any, ["resident"]);
    const residentId = session.user.id;

    const rawBody = await req.json() as any;
    const parsed = topUpSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { amount, callbackUrl } = parsed.data;

    // Fetch resident user record
    const resident = await db
      .select()
      .from(users)
      .where(eq(users.id, residentId))
      .get();

    if (!resident) {
      return new Response("Resident not found.", { status: 404 });
    }

    if (config.isMockMode) {
      await db
        .update(residentProfiles)
        .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amount}` })
        .where(eq(residentProfiles.userId, residentId));

      const txId = generateId();
      const reference = generateSecureReference(8, "SZ");
      await db.insert(transactions).values({
        id: txId,
        residentId,
        reference,
        amount,
        status: "success" as any,
        paymentMethod: "bank_transfer" as any,
        paidAt: new Date(),
      });

      if (resident.email) {
        const firstName = resident.firstName || resident.name.split(" ")[0] || "Resident";
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
        mockCheckoutUrl: "https://checkout.paystack.com/mock-url-12345",
        reference,
      }), { status: 200, headers: { "Content-Type": "application/json" } });

    } else {
      const reference = generateSecureReference(8, "SZ");

      // 1. Try Paystack Checkout Initialization
      if (env.PAYSTACK_SECRET_KEY && resident.email) {
        try {
          const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
          const paystackData = await paystack.initializeTransaction({
            amount,
            email: resident.email,
            reference,
            callbackUrl: callbackUrl || `${req.headers.get("origin") || ""}/resident/wallet`,
            metadata: { narration: reference, residentId },
          });

          await db.insert(transactions).values({
            id: generateId(),
            residentId,
            reference,
            amount,
            status: "initiated" as any,
            paymentMethod: "bank_transfer" as any,
            paidAt: new Date(),
          });

          return new Response(JSON.stringify({
            status: "success",
            checkoutUrl: paystackData.authorization_url,
            reference,
          }), { status: 200, headers: { "Content-Type": "application/json" } });
        } catch (paystackErr: any) {
          console.error("Paystack initialize failed:", paystackErr);
          return new Response(JSON.stringify({ error: "Payment provider initialization failed." }), { status: 502 });
        }
      }

      return new Response(JSON.stringify({ error: "Payment provider not configured." }), { status: 500 });
    }
  } catch (error: any) {
    console.error("Top-Up Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Failed to process top-up" }), { status: 500 });
  }
}

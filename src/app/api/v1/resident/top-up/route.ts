export const dynamic = "force-dynamic";
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
import { MonnifyClient } from "@/lib/monnify";


const topUpSchema = z.object({
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
  callbackUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  try {
    const json = await req.json() as any;
    const parsed = topUpSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { amount, callbackUrl } = parsed.data;

    // Authenticate resident session
    await requireRole(req, env.DB as any, ["resident"]);
    const betterAuth = auth(env.DB as any);
    const session = await betterAuth.api.getSession({ headers: req.headers });

    if (!session || !session.user) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const residentId = session.user.id;
    const db = getDb(env.DB as any);

    const resident = await db.select().from(users).where(eq(users.id, residentId)).get();
    if (!resident || resident.role !== "resident") {
      return new Response("Invalid resident account.", { status: 400 });
    }

    const profile = await db.select().from(residentProfiles).where(eq(residentProfiles.userId, residentId)).get();
    if (!profile) {
      return new Response("Resident profile not found.", { status: 404 });
    }

    if (config.isMockMode) {
      // ─── Mock Mode: simulate immediate top-up ───────────────────────────
      const txId = generateId();

      await db.transaction(async (tx) => {
        await tx.update(residentProfiles)
          .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amount}` })
          .where(eq(residentProfiles.userId, residentId));

        await tx.insert(transactions).values({
          id: txId,
          residentId,
          reference: `MONNIFY-TOPUP-${generateSecureReference(10)}`,
          amount,
          status: "success" as any,
          paymentMethod: "bank_transfer" as any,
          cashStatus: "settled" as any,
          paidAt: new Date(),
        });

        await tx.insert(auditLogs).values({
          id: generateId(),
          actorId: residentId,
          action: "resident_topup",
          entityType: "resident",
          entityId: residentId,
          meta: JSON.stringify({ amount, provider: "monnify", mode: "mock" }),
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
        status: "success" as any,
        message: "Digital top-up simulated successfully.",
        mockCheckoutUrl: "https://sandbox.monnify.com/checkout/mock-url-12345"
      }), { status: 200, headers: { "Content-Type": "application/json" } });

    } else {
      // ─── Live Mode: create Monnify payment link ────────────────────────
      if (!env.MONNIFY_API_KEY || !env.MONNIFY_SECRET_KEY || !env.MONNIFY_CONTRACT_CODE) {
        return new Response(JSON.stringify({ error: "Payment provider not configured." }), { status: 500 });
      }

      const reference = `TOPUP-${generateSecureReference(16)}`;
      const monnify = new MonnifyClient(env.MONNIFY_API_KEY, env.MONNIFY_SECRET_KEY, env.MONNIFY_CONTRACT_CODE);

      try {
        const monnifyData = await monnify.initializeTransaction({
          amount,
          customerName: resident.firstName || resident.name.split(" ")[0] || "Resident",
          customerEmail: resident.email,
          paymentReference: reference,
          paymentDescription: "Saziate Wallet Top-Up",
          redirectUrl: callbackUrl || `${req.headers.get("origin") || ""}/resident/wallet`,
          paymentMethods: ["CARD", "ACCOUNT_TRANSFER"],
        });

        // Pre-log an initiated transaction so we can track it via webhook
        await db.insert(transactions).values({
          id: generateId(),
          residentId,
          reference,
          amount,
          status: "initiated",
          paymentMethod: "bank_transfer" as any,
          paidAt: new Date(),
        });

        return new Response(JSON.stringify({
          status: "success" as any,
          checkoutUrl: monnifyData.checkoutUrl,
          reference,
        }), { status: 200, headers: { "Content-Type": "application/json" } });
      } catch (monnifyErr: any) {
        console.error("Monnify initialize failed:", monnifyErr);
        return new Response(JSON.stringify({ error: "Failed to initialize payment." }), { status: 502 });
      }
    }

  } catch (error: any) {
    console.error("Top-Up Error:", error);
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

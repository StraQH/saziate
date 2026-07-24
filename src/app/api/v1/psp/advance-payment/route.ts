import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { getActivePspId, requireRole } from "@/lib/session";


const advancePaymentSchema = z.object({
  residentId: z.string().min(1),
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
});

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  try {
    const json = await req.json();
    const parsed = advancePaymentSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residentId, amount } = parsed.data;

    // Use environment DB
    const db = getDb(env.DB);
    
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const resident = await db.select().from(users).where(eq(users.id, residentId)).get();
    if (!resident || resident.role !== "resident") {
      return new Response("Invalid resident ID.", { status: 400 });
    }

    if (resident.pspId !== pspId) {
      return new Response("Resident does not belong to this PSP.", { status: 403 });
    }

    const profile = await db.select().from(residentProfiles).where(eq(residentProfiles.userId, residentId)).get();
    if (!profile) {
      return new Response("Resident profile not found.", { status: 404 });
    }

    const txId = generateId();

    // Use db.transaction to group mutations
    await db.transaction(async (tx: any) => {
      // 1. Update Advance Balance (Atomic SQL addition)
      await tx.update(residentProfiles)
        .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amount}` })
        .where(eq(residentProfiles.userId, residentId));

      // 2. Log Transaction
      await tx.insert(transactions).values({
        id: txId,
        residentId,
        reference: `ADV-CASH-${generateSecureReference(10)}`,
        amount,
        paymentMethod: "cash",
        cashStatus: "settled",
        paidAt: new Date(),
      });

      // 3. Log Audit
      const betterAuth = (await import("@/lib/auth")).auth(env.DB);
      const session = await betterAuth.api.getSession({ headers: req.headers });
      const actorId = session?.user?.id || "unknown";

      await tx.insert(auditLogs).values({
        id: generateId(),
        actorId,
        action: "advance_payment.log",
        entityType: "resident",
        entityId: residentId,
        meta: JSON.stringify({ amount }),
      });
    });

    // 4. Send Email Receipt (non-blocking)
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

    return new Response(JSON.stringify({ status: "success", transactionId: txId }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    console.error("Advance Payment Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

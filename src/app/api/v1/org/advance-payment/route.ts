export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { generateId, generateSecureReference } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { getActiveorgId, requireRole } from "@/lib/session";

const advancePaymentSchema = z.object({
  residentId: z.string().min(1),
  amount: z.number().positive().transform(val => Math.round(val * 100) / 100),
  idemKey: z.string().min(1),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  try {
    const json = await req.json() as any;
    const parsed = advancePaymentSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residentId, amount, idemKey } = parsed.data;

    // Use environment DB
    const db = getDb(env.DB as any);
    
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);

    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const resident = await db.select().from(users).where(eq(users.id, residentId)).get();
    if (!resident || resident.role !== "resident") {
      return new Response("Invalid resident ID.", { status: 400 });
    }

    if (resident.orgId !== orgId) {
      return new Response("Resident does not belong to this Org.", { status: 403 });
    }

    const profile = await db.select().from(residentProfiles).where(eq(residentProfiles.userId, residentId)).get();
    if (!profile) {
      return new Response("Resident profile not found.", { status: 404 });
    }

    const txId = generateId();

    // Use db.transaction to group mutations
    await db.transaction(async (tx) => {
      // 1. Update Advance Balance (Atomic SQL addition)
      await tx.update(residentProfiles)
        .set({ advancePaymentBalance: sql`${residentProfiles.advancePaymentBalance} + ${amount}` })
        .where(eq(residentProfiles.userId, residentId));

      // 2. Log Transaction
      await tx.insert(transactions).values({
        id: txId,
        residentId,
        orgId, // Link transaction to the org explicitly
        reference: idemKey, // Prevents duplicate submissions at DB level
        amount,
        paymentMethod: "cash",
        cashStatus: "settled" as any,
        paidAt: new Date(),
      });

      // 3. Log Audit
      const betterAuth = (await import("@/lib/auth")).auth(env.DB as any);
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

    return new Response(JSON.stringify({ status: "success" as any, transactionId: txId }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    console.error("Advance Payment Error:", error);
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

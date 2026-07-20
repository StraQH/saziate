import { getDb } from "@/db";
import { users, residentProfiles, transactions, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { generateId } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

const advancePaymentSchema = z.object({
  residentId: z.string().min(1),
  amount: z.number().positive(),
});

export async function POST(req: Request) {
  try {
    const json = await req.json();
    const parsed = advancePaymentSchema.safeParse(json);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { residentId, amount } = parsed.data;

    // Use environment DB
    const env = process.env as any;
    const db = getDb(env.DB);

    const resident = await db.select().from(users).where(eq(users.id, residentId)).get();
    if (!resident || resident.role !== "resident") {
      return new Response("Invalid resident ID.", { status: 400 });
    }

    const profile = await db.select().from(residentProfiles).where(eq(residentProfiles.userId, residentId)).get();
    if (!profile) {
      return new Response("Resident profile not found.", { status: 404 });
    }

    // 1. Update Advance Balance
    await db.update(residentProfiles)
      .set({ advancePaymentBalance: (profile.advancePaymentBalance || 0) + amount })
      .where(eq(residentProfiles.userId, residentId));

    // 2. Log Transaction
    const txId = generateId();
    await db.insert(transactions).values({
      id: txId,
      residentId,
      reference: `ADV-CASH-${Math.floor(Math.random() * 900000) + 100000}`,
      amount,
      paymentMethod: "cash",
      cashStatus: "settled",
    });

    // 3. Log Audit
    await db.insert(auditLogs).values({
      id: generateId(),
      actorId: "psp_operator", // In reality, fetch from auth session
      action: "advance_payment.log",
      entityType: "resident",
      entityId: residentId,
      meta: JSON.stringify({ amount }),
    });

    // 4. Send Email Receipt
    if (resident.email) {
      const firstName = resident.firstName || resident.name.split(" ")[0];
      await sendEmail({
        to: resident.email,
        subject: "Advance Payment Received!",
        html: emailTemplates.advancePaymentReceipt(firstName, amount),
      });
    }

    return new Response(JSON.stringify({ status: "success", transactionId: txId }), { 
      status: 200, 
      headers: { "Content-Type": "application/json" } 
    });
  } catch (error: any) {
    console.error("Advance Payment Error:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}

import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = (sessionResponse.user as any).pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const { amount } = await req.json() as { amount: number };
    if (!amount || amount <= 0) {
      return new Response("Invalid payout amount.", { status: 400 });
    }

    // Get PSP details to verify settlement account
    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp || !psp.settlementBankCode || !psp.settlementAccountNumber) {
      return new Response("Settlement account details not configured.", { status: 400 });
    }

    // In a real app, we would verify the PSP's available balance here from Paystack or internal ledger
    // For now, we simulate a successful transfer request to Paystack

    if (env.PAYSTACK_SECRET_KEY && process.env.NODE_ENV !== "development") {
      // Create transfer recipient
      const recipientRes = await fetch("https://api.paystack.co/transferrecipient", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: "nuban",
          name: psp.settlementAccountName || psp.name,
          account_number: psp.settlementAccountNumber,
          bank_code: psp.settlementBankCode,
          currency: "NGN",
        }),
      });

      if (!recipientRes.ok) {
        throw new Error("Failed to create transfer recipient on Paystack.");
      }

      const recipientData = await recipientRes.json() as any;
      const recipientCode = recipientData.data.recipient_code;

      // Initiate transfer
      const transferRes = await fetch("https://api.paystack.co/transfer", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          source: "balance",
          amount: Math.round(amount * 100), // kobo
          recipient: recipientCode,
          reason: "Saziate Settlement Payout",
        }),
      });

      if (!transferRes.ok) {
        throw new Error("Failed to initiate transfer on Paystack.");
      }
    }

    // Send Confirmation Email to Operator
    if (psp.contactEmail) {
      const accountMask = psp.settlementAccountNumber.slice(-4);
      await sendEmail({
        to: psp.contactEmail,
        subject: "Saziate Payout Initiated",
        html: emailTemplates.payoutConfirmation(psp.name, amount, accountMask),
      });
    }

    return new Response(JSON.stringify({ status: "success", message: "Payout initiated successfully." }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

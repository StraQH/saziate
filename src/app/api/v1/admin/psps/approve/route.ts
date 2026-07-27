import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { approvePspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { PaystackClient } from "@/lib/paystack";

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["admin"]);
    const { pspId } = await req.json() as any as { pspId: string };
    if (!pspId) {
      return new Response("Missing PSP ID.", { status: 400 });
    }

    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp) {
      return new Response("PSP record not found.", { status: 404 });
    }

    if (psp.dvaAccountNumber) {
      return new Response("PSP is already approved and has an active Dedicated Virtual Account.", { status: 400 });
    }

    // Provision Dedicated Virtual Account (DVA)
    let dvaBankName = "";
    let dvaAccountNumber = "";
    let dvaAccountName = "";
    let dvaCustomerCode = "";

    if (config.isMockMode) {
      dvaBankName = "Wema Bank";
      const array = new Uint8Array(4);
      crypto.getRandomValues(array);
      const digits = (array[0] * 16777216 + array[1] * 65536 + array[2] * 256 + array[3]).toString().padStart(7, '0').slice(0, 7);
      dvaAccountNumber = `992${digits}`;
      dvaAccountName = `Saziate / ${psp.name}`;
      dvaCustomerCode = "CUST_99014";
    } else if (env.PAYSTACK_SECRET_KEY) {
      // In live production, calls Paystack APIs to create customer + dva dedicated account
      try {
        const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);

        // 1. Create customer
        const customer = await paystack.createCustomer({
          email: psp.contactEmail,
          first_name: psp.name,
          last_name: "Operator",
          phone: psp.contactPhone || undefined,
        });

        // 2. Validate customer identification if not in test mode
        // Paystack DVAs in production require customer validation
        if (psp.settlementAccountNumber && psp.settlementBankCode) {
          await paystack.validateCustomer(customer.customer_code, {
            first_name: psp.name.split(" ")[0] || psp.name,
            last_name: psp.name.split(" ").slice(1).join(" ") || "Operator",
            type: "bank_account",
            value: psp.settlementAccountNumber,
            country: "NG",
            bank_code: psp.settlementBankCode,
            account_number: psp.settlementAccountNumber,
          });
        } else {
          return new Response("PSP operator has not set up their settlement bank details. Please ask the operator to add payout details in settings first.", { status: 400 });
        }

        // 3. Create dedicated account
        const isTestMode = env.PAYSTACK_SECRET_KEY.startsWith("sk_test_");
        const dva = await paystack.createDedicatedAccount({
          customer: customer.customer_code,
          preferred_bank: isTestMode ? "test-bank" : "wema-bank",
        });

        dvaBankName = dva.bank.name;
        dvaAccountNumber = dva.account_number;
        dvaAccountName = dva.account_name;
        dvaCustomerCode = customer.customer_code;
      } catch (paystackErr: any) {
        console.error("Failed to provision Paystack DVA:", paystackErr);
        return new Response(`Paystack DVA provisioning failed: ${(paystackErr as any).message || paystackErr}`, { status: 500 });
      }
    } else {
      return new Response("Paystack configuration missing.", { status: 500 });
    }

    // Save provisioned parameters to D1
    await db
      .update(psps)
      .set({
        dvaBankName,
        dvaAccountNumber,
        dvaAccountName,
        dvaCustomerCode,
      })
      .where(eq(psps.id, pspId));

    // Send Approval Email to Operator
    if (psp.contactEmail) {
      try {
        await sendEmail({
          to: psp.contactEmail,
          subject: "Saziate Account Approved!",
          html: emailTemplates.approvePSP(psp.name, dvaBankName, dvaAccountNumber),
          apiKey: env.RESEND_API_KEY
        });
      } catch (emailErr) {
        console.error("Failed to dispatch Approval email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "PSP operator approved and virtual bank account provisioned successfully.",
        dva: { bank: dvaBankName, accountNumber: dvaAccountNumber },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

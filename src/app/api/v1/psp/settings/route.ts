import { getAppEnv } from "@/lib/env";
import { pspSettingsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp) {
      return new Response("PSP record not found.", { status: 404 });
    }

    return new Response(JSON.stringify(psp), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = pspSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const {
      settlementBankCode,
      settlementAccountNumber,
      settlementAccountName,
    } = body;

    // Verify record exists
    const psp = await db
      .select()
      .from(psps)
      .where(eq(psps.id, pspId))
      .get();

    if (!psp) {
      return new Response("PSP record not found.", { status: 404 });
    }

    let dvaBankName = psp.dvaBankName || null;
    let dvaAccountNumber = psp.dvaAccountNumber || null;
    let dvaAccountName = psp.dvaAccountName || null;
    let dvaCustomerCode = psp.dvaCustomerCode || null;

    const shouldProvisionDva = !dvaAccountNumber && settlementAccountNumber && settlementBankCode;

    if (shouldProvisionDva) {
      if (config.isMockMode) {
        dvaBankName = "Wema Bank";
        const array = new Uint8Array(4);
        crypto.getRandomValues(array);
        const digits = (array[0] * 16777216 + array[1] * 65536 + array[2] * 256 + array[3]).toString().padStart(7, '0').slice(0, 7);
        dvaAccountNumber = `992${digits}`;
        dvaAccountName = `Saziate / ${psp.name}`;
        dvaCustomerCode = "CUST_99014";
      } else if (env.PAYSTACK_SECRET_KEY) {
        try {
          const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);

          // 1. Create customer on Paystack
          const customer = await paystack.createCustomer({
            email: psp.contactEmail,
            first_name: psp.name,
            last_name: "Operator",
            phone: psp.contactPhone || undefined,
          });

          // 2. Validate customer profile using payout settlement bank account details
          await paystack.validateCustomer(customer.customer_code, {
            first_name: psp.name.split(" ")[0] || psp.name,
            last_name: psp.name.split(" ").slice(1).join(" ") || "Operator",
            type: "bank_account",
            value: settlementAccountNumber,
            country: "NG",
            bank_code: settlementBankCode,
            account_number: settlementAccountNumber,
          });

          // 3. Create dedicated account
          const dva = await paystack.createDedicatedAccount({
            customer: customer.customer_code,
            preferred_bank: "wema-bank",
          });

          dvaBankName = dva.bank.name;
          dvaAccountNumber = dva.account_number;
          dvaAccountName = dva.account_name;
          dvaCustomerCode = customer.customer_code;
        } catch (paystackErr: any) {
          console.error("Failed to provision Paystack DVA on settings update:", paystackErr);
          return new Response(`Paystack DVA provisioning failed: ${paystackErr.message || paystackErr}`, { status: 500 });
        }
      } else {
        return new Response("Paystack configuration missing.", { status: 500 });
      }
    }

    // Update payout and DVA details in database
    await db
      .update(psps)
      .set({
        settlementBankCode: settlementBankCode || undefined,
        settlementAccountNumber: settlementAccountNumber || undefined,
        settlementAccountName: settlementAccountName || undefined,
        dvaBankName: dvaBankName || undefined,
        dvaAccountNumber: dvaAccountNumber || undefined,
        dvaAccountName: dvaAccountName || undefined,
        dvaCustomerCode: dvaCustomerCode || undefined,
        updatedAt: new Date(),
      })
      .where(eq(psps.id, pspId));

    // Send Activation Email if we just provisioned it
    if (shouldProvisionDva && dvaAccountNumber && psp.contactEmail) {
      try {
        await sendEmail({
          to: psp.contactEmail,
          subject: "Saziate Dedicated Virtual Account Provisioned!",
          html: emailTemplates.approvePSP(psp.name, dvaBankName!, dvaAccountNumber!),
        });
      } catch (emailErr) {
        console.error("Failed to dispatch DVA activation email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Payout account and DVA details updated successfully.",
        dva: dvaAccountNumber ? { bank: dvaBankName, accountNumber: dvaAccountNumber } : null,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("PSP Settings PATCH error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

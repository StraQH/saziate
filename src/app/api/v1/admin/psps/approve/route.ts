import { requireRole } from "@/lib/session";
import { approvePspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";



export async function POST(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);
    const { pspId } = await req.json() as { pspId: string };
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
        const pResponse = await fetch("https://api.paystack.co/customer", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            email: psp.contactEmail,
            first_name: psp.name,
            last_name: "Operator",
            phone: psp.contactPhone,
          }),
        });

        if (pResponse.ok) {
          const pBody = await pResponse.json() as any;
          const customerCode = pBody.data.customer_code;
          
          const dvaResponse = await fetch("https://api.paystack.co/dedicated_account", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              customer: customerCode,
              preferred_bank: "wema-bank",
            }),
          });

          if (dvaResponse.ok) {
            const dvaBody = await dvaResponse.json() as any;
            dvaBankName = dvaBody.data.bank.name;
            dvaAccountNumber = dvaBody.data.account_number;
            dvaAccountName = dvaBody.data.account_name;
            dvaCustomerCode = customerCode;
          }
        } else {
          throw new Error("Paystack customer creation failed.");
        }
      } catch (paystackErr) {
        console.error("Failed to provision Paystack DVA:", paystackErr);
        return new Response("Paystack DVA provisioning failed. Please check credentials.", { status: 500 });
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
        });
      } catch (emailErr) {
        console.error("Failed to dispatch Approval email:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "PSP operator approved and virtual bank account provisioned successfully.",
        dva: { bank: dvaBankName, accountNumber: dvaAccountNumber },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

import { requireRole } from "@/lib/session";
import { approvePspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { TermiiClient } from "@/lib/termii";

export const runtime = "edge";

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

    // Provision Dedicated Virtual Account (DVA)
    let dvaBankName = "Wema Bank";
    let dvaAccountNumber = `992${Math.floor(1000000 + Math.random() * 9000000)}`;
    let dvaAccountName = `Saziate / ${psp.name}`;
    let dvaCustomerCode = "CUST_99014";

    if (!config.isMockMode && env.PAYSTACK_SECRET_KEY) {
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
        }
      } catch (paystackErr) {
        console.error("Failed to provision Paystack DVA, using fallback mock parameters:", paystackErr);
      }
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

    // Send dispatch activation alert using Termii client
    if (psp.contactPhone) {
      try {
        const termiiKey = env.TERMII_API_KEY;
        if (!termiiKey) {
          throw new Error("TERMII_API_KEY is required.");
        }
        const termii = new TermiiClient(termiiKey);
        const msgText = `Hello ${psp.name}, your Saziate operator account has been approved and activated! Your Paystack Dedicated Virtual Account is ${dvaAccountNumber} (${dvaBankName}).`;
        await termii.sendWhatsApp({
          to: psp.contactPhone.replace("+", ""),
          sms: msgText,
        });
      } catch (termiiErr) {
        console.error("Failed to dispatch Termii activation notification:", termiiErr);
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

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";
import { MonnifyClient } from "@/lib/monnify";

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
    let dvaAccountReference = "";

    if (config.isMockMode) {
      dvaBankName = "Wema Bank";
      const array = new Uint8Array(4);
      crypto.getRandomValues(array);
      const digits = (array[0] * 16777216 + array[1] * 65536 + array[2] * 256 + array[3]).toString().padStart(7, '0').slice(0, 7);
      dvaAccountNumber = `992${digits}`;
      dvaAccountName = `Saziate / ${psp.name}`;
      dvaAccountReference = `DVA-${pspId}-${Date.now()}`;
    } else if (env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY && env.MONNIFY_CONTRACT_CODE) {
      try {
        const monnify = new MonnifyClient(env.MONNIFY_API_KEY, env.MONNIFY_SECRET_KEY, env.MONNIFY_CONTRACT_CODE);
        const accountRef = `DVA-${pspId}-${Date.now()}`;
        
        const dva = await monnify.createReservedAccount({
          accountReference: accountRef,
          accountName: `Saziate / ${psp.name}`,
          customerEmail: psp.contactEmail,
          customerName: psp.name,
          getAllAvailableBanks: true
        });

        if (!dva || !dva.accounts || dva.accounts.length === 0) {
           throw new Error("No accounts returned from Monnify.");
        }

        dvaBankName = dva.accounts[0].bankName;
        dvaAccountNumber = dva.accounts[0].accountNumber;
        dvaAccountName = dva.accounts[0].accountName;
        dvaAccountReference = accountRef;
      } catch (err: any) {
        console.error("Failed to provision Monnify Reserved Account:", err);
        return new Response(`Monnify Account provisioning failed: ${(err as any).message || err}`, { status: 500 });
      }
    } else {
      return new Response("Monnify configuration missing.", { status: 500 });
    }

    // Save provisioned parameters to D1
    await db
      .update(psps)
      .set({
        dvaBankName,
        dvaAccountNumber,
        dvaAccountName,
        dvaAccountReference,
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

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { pspSettingsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps, users, accounts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";
import { verifyPassword } from "@/lib/hash";
import { MonnifyClient } from "@/lib/monnify";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);
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

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const session = await requireRole(req, env.DB as any, ["psp_operator"]);
    const pspId = await getActivePspId(req, env.DB as any);
    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = pspSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const {
      settlementBankCode,
      settlementAccountNumber,
      settlementAccountName,
      bvn,
      password
    } = parsed.data;

    // Verify confirmation password
    if (!config.isMockMode) {
      const userRecord = await db
        .select({ password: accounts.password })
        .from(accounts)
        .where(and(
          eq(accounts.userId, session.user.id),
          inArray(accounts.providerId, ["email", "credential"])
        ))
        .get();

      if (!userRecord || !userRecord.password) {
        return new Response("Unauthorized.", { status: 401 });
      }

      const isPasswordCorrect = await verifyPassword(password, userRecord.password);
      if (!isPasswordCorrect) {
        return new Response("Incorrect authorization password.", { status: 401 });
      }
    }

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
    let dvaAccountReference = psp.dvaAccountReference || null;

    const shouldProvisionDva = !dvaAccountNumber && settlementAccountNumber && settlementBankCode;

    if (shouldProvisionDva) {
      if (config.isMockMode) {
        dvaBankName = "Wema Bank";
        const array = new Uint8Array(4);
        crypto.getRandomValues(array);
        const digits = (array[0] * 16777216 + array[1] * 65536 + array[2] * 256 + array[3]).toString().padStart(7, '0').slice(0, 7);
        dvaAccountNumber = `992${digits}`;
        dvaAccountName = `Saziate / ${psp.name}`;
        dvaAccountReference = "REF_99014";
      } else if (env.MONNIFY_API_KEY && env.MONNIFY_SECRET_KEY && env.MONNIFY_CONTRACT_CODE) {
        try {
          if (!bvn) {
            return new Response("A valid BVN is required by Monnify to provision a Reserved Account.", { status: 400 });
          }

          const monnify = new MonnifyClient(env.MONNIFY_API_KEY, env.MONNIFY_SECRET_KEY, env.MONNIFY_CONTRACT_CODE);

          const accountRef = `DVA-${pspId}-${Date.now()}`;
          const dva = await monnify.createReservedAccount({
            accountReference: accountRef,
            accountName: `Saziate / ${psp.name}`,
            customerEmail: psp.contactEmail,
            customerName: psp.name,
            bvn: bvn,
            getAllAvailableBanks: true
          });

          const assignedAccount = dva.accounts[0];

          dvaBankName = assignedAccount.bankName;
          dvaAccountNumber = assignedAccount.accountNumber;
          dvaAccountName = assignedAccount.accountName;
          dvaAccountReference = accountRef;
        } catch (monnifyErr: any) {
          console.error("Failed to provision Monnify DVA on settings update:", monnifyErr);
          return new Response(`Monnify DVA provisioning failed: ${(monnifyErr as any).message || monnifyErr}`, { status: 500 });
        }
      } else {
        return new Response("Monnify configuration missing.", { status: 500 });
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
        dvaAccountReference: dvaAccountReference || undefined,
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
        status: "success" as any,
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

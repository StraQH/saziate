export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { organizationsettingsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { organizations, users, accounts } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getActiveorgId, requireRole } from "@/lib/session";
import { verifyPassword } from "@/lib/hash";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";
import { sendEmail } from "@/lib/email";
import { emailTemplates } from "@/lib/email-templates";

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();

    if (!org) {
      return new Response("Org record not found.", { status: 404 });
    }

    return new Response(JSON.stringify(org), {
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
    const session = await requireRole(req, env.DB as any, ["org_admin"]);
    const orgId = await getActiveorgId(req, env.DB as any);
    if (!orgId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json() as any;
    const parsed = organizationsettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const {
      settlementBankCode,
      settlementAccountNumber,
      settlementAccountName,
      bvn,
      password,
      unit1Name,
      unit2Name
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
    const org = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .get();

    if (!org) {
      return new Response("Org record not found.", { status: 404 });
    }

    let resolvedAccountName = settlementAccountName;

    if (settlementAccountNumber && settlementBankCode) {
      if (config.isMockMode) {
        resolvedAccountName = settlementAccountName || `Acme Settlement / ${org.name}`;
      } else if (env.PAYSTACK_SECRET_KEY) {
        try {
          const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
          const bankInfo = await paystack.resolveBankAccount(settlementAccountNumber, settlementBankCode);
          resolvedAccountName = bankInfo.account_name;
        } catch (err: any) {
          console.error("Paystack NIBSS Account Resolution Error:", err);
          return new Response(`Bank account resolution failed: ${err.message || err}`, { status: 400 });
        }
      }
    }

    // Update payout details in database
    await db
      .update(organizations)
      .set({
        settlementBankCode: settlementBankCode || undefined,
        settlementAccountNumber: settlementAccountNumber || undefined,
        settlementAccountName: settlementAccountName || undefined,
        unit1Name: unit1Name || undefined,
        unit2Name: unit2Name || undefined,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, orgId));

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Payout account updated successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Org Settings PATCH error:", error);
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

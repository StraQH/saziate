import { getAppEnv } from "@/lib/env";
import { pspSettingsSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getActivePspId, requireRole } from "@/lib/session";



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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
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

    // Update in database
    await db
      .update(psps)
      .set({
        settlementBankCode: settlementBankCode || undefined,
        settlementAccountNumber: settlementAccountNumber || undefined,
        settlementAccountName: settlementAccountName || undefined,
        updatedAt: new Date(),
      })
      .where(eq(psps.id, pspId));

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Settlement account details updated successfully.",
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

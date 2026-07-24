import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { registerPspSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { psps } from "@/db/schema";
import { generateId } from "@/lib/utils";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);
    const list = await db
      .select()
      .from(psps)
      .all();

    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["admin"]);
    const rawBody = await req.json();
    const parsed = registerPspSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, rcNumber, address, contactPhone, contactEmail } = body;

    if (!name || !address || !contactPhone || !contactEmail) {
      return new Response("Missing required fields.", { status: 400 });
    }

    const pspId = generateId();

    await db.insert(psps).values({
      id: pspId,
      name,
      rcNumber: rcNumber || null,
      address,
      contactPhone,
      contactEmail,
    });

    return new Response(
      JSON.stringify({
        status: "success",
        message: "PSP registered successfully.",
        pspId,
      }),
      {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

import { signupSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateId } from "@/lib/utils";
import { SaziateLogger } from "@/lib/logger";

import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "edge";

export async function POST(req: Request) {
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests. Please try again later." }), { status: 429, headers: { "Content-Type": "application/json" } });
  }

  const env = process.env as any;
  const db = getDb(env.DB);
  const logger = new SaziateLogger(env.DB);

  try {
    const rawBody = await req.json();
    const parsed = signupSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const body = parsed.data;
    const { name, email, phone, role, password, pspName, rcNumber, address } = body;

    if (!name || !email || !role) {
      return new Response("Missing required fields.", { status: 400 });
    }

    // Check if email or phone is already taken
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .get();

    if (existingUser) {
      return new Response("Email already registered.", { status: 400 });
    }

    const userId = generateId();

    // Create Operator/Agent user record in transaction
    await db.insert(users).values({
      id: userId,
      name,
      email,
      phone: phone || null,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await logger.logAudit({
      actorId: userId,
      action: "user.signup",
      entityType: "users",
      entityId: userId,
      meta: JSON.stringify({ role, email }),
    });

    return new Response(JSON.stringify({ status: "success", userId }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

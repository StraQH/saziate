export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "@/lib/hash";

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const betterAuth = auth(env.DB as any);
    const session = await betterAuth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const userId = session.user.id;
    const { newPassword } = await req.json() as any as { newPassword?: string };

    if (!newPassword || newPassword.length < 6) {
      return new Response("Password must be at least 6 characters.", { status: 400 });
    }

    const hashedPassword = await hashPassword(newPassword);

    // 1. Update password in accounts table
    await db
      .update(accounts)
      .set({
        password: hashedPassword,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(accounts.userId, userId),
          eq(accounts.providerId, "credential")
        )
      );

    // 2. Clear mustChangePassword flag
    await db
      .update(users)
      .set({
        mustChangePassword: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Password updated successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Change password error:", error);
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

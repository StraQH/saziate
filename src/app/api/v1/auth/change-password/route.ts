import { getAppEnv } from "@/lib/env";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const betterAuth = auth(env.DB);
    const session = await betterAuth.api.getSession({
      headers: req.headers,
    });

    if (!session?.user) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const userId = session.user.id;
    const { newPassword } = await req.json() as { newPassword?: string };

    if (!newPassword || newPassword.length < 6) {
      return new Response("Password must be at least 6 characters.", { status: 400 });
    }

    const { hashPassword } = await import("better-auth/crypto");
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
        status: "success",
        message: "Password updated successfully.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Change password error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

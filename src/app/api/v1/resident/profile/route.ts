import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { updateProfileSchema } from "@/lib/validators";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { config } from "@/lib/config";

import { psps, routes, routeResidents } from "@/db/schema";



export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      residentId = session.user.id;
    }

    let residentName = "Babajide Sanwo";
    let residentEmail = "resident@example.com";

    if (!config.isMockMode) {
      const residentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, residentId))
        .get();

      if (!residentUser) {
        return new Response("User not found.", { status: 404 });
      }
      residentName = residentUser.name || "";
      residentEmail = residentUser.email || "";
    }

    let pspName = "";
    let pspPhone = "";
    let pspEmail = "";
    let routeName = "";

    if (!config.isMockMode) {
      const residentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, residentId))
        .get();

      if (residentUser && residentUser.pspId) {
        const psp = await db
          .select()
          .from(psps)
          .where(eq(psps.id, residentUser.pspId))
          .get();
        if (psp) {
          pspName = psp.name;
          pspEmail = psp.contactEmail;
          pspPhone = psp.contactPhone || "";
        }
      }

      const routeRes = await db
        .select({ name: routes.name })
        .from(routeResidents)
        .innerJoin(routes, eq(routeResidents.routeId, routes.id))
        .where(eq(routeResidents.residentId, residentId))
        .get();

      if (routeRes) {
        routeName = routeRes.name;
      }
    }

    return new Response(
      JSON.stringify({
        name: residentName,
        email: residentEmail,
        psp: { name: pspName, phone: pspPhone, email: pspEmail },
        route: { name: routeName },
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

export async function PATCH(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    await requireRole(req, env.DB, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
    }

    const rawBody = await req.json();
    const parsed = updateProfileSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const { name, email, newPassword } = parsed.data;

    if (config.isMockMode) {
      return new Response(JSON.stringify({ status: "success", message: "Mock profile updated successfully." }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    let firstName: string | undefined = undefined;
    let lastName: string | undefined = undefined;
    if (name) {
      const parts = name.trim().split(/\s+/);
      firstName = parts[0] || "Unknown";
      lastName = parts.slice(1).join(" ") || "";
    }

    // Update user details
    await db
      .update(users)
      .set({
        name: name || undefined,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        email: email || undefined,
        updatedAt: new Date(),
      })
      .where(eq(users.id, residentId));

    // Handle password update if provided
    if (newPassword) {
      const { hashPassword } = await import("better-auth/crypto");
      const hashedPassword = await hashPassword(newPassword);
      
      await db
        .update(accounts)
        .set({
          password: hashedPassword,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(accounts.userId, residentId),
            eq(accounts.providerId, "credential")
          )
        );
    }

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Profile updated successfully.",
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

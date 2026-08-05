export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { updateProfileSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/hash";
import { auth } from "@/lib/auth";
import { getDb } from "@/db";
import { users, accounts } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { config } from "@/lib/config";

import { organizations, zones, zoneResidents, residentProfiles } from "@/db/schema";



export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }
      residentId = session.user.id;
    }

    let residentName = "John Doe";
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

    let orgName = "";
    let orgPhone = "";
    let orgEmail = "";
    let zoneName = "";
    let propertyType = "";

    if (!config.isMockMode) {
      const residentUser = await db
        .select()
        .from(users)
        .where(eq(users.id, residentId))
        .get();

      if (residentUser && residentUser.orgId) {
        const org = await db
          .select()
          .from(organizations)
          .where(eq(organizations.id, residentUser.orgId))
          .get();
        if (org) {
          orgName = org.name;
          orgEmail = org.contactEmail;
          orgPhone = org.contactPhone || "";
        }
      }

      const zoneRes = await db
        .select({ name: zones.name })
        .from(zoneResidents)
        .innerJoin(zones, eq(zoneResidents.zoneId, zones.id))
        .where(eq(zoneResidents.residentId, residentId))
        .get();

      if (zoneRes) {
        zoneName = zoneRes.name;
      }
      
      const profileRes = await db
        .select({ propertyType: residentProfiles.propertyType })
        .from(residentProfiles)
        .where(eq(residentProfiles.userId, residentId))
        .get();
        
      if (profileRes && profileRes.propertyType) {
        propertyType = profileRes.propertyType;
      }
    }

    return new Response(
      JSON.stringify({
        name: residentName,
        email: residentEmail,
        propertyType,
        org: { name: orgName, phone: orgPhone, email: orgEmail },
        zone: { name: zoneName },
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

export async function PATCH(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    await requireRole(req, env.DB as any, ["resident"]);
    let residentId = "";
    if (config.isMockMode) {
      residentId = "r1";
    } else {
      const betterAuth = auth(env.DB as any);
      const session = await betterAuth.api.getSession({
        headers: req.headers,
      });

      if (!session?.user) {
        return new Response("Unauthorized.", { status: 401 });
      }

      residentId = session.user.id;
    }

    const rawBody = await req.json() as any;
    const parsed = updateProfileSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const { name, email, newPassword } = parsed.data;

    if (config.isMockMode) {
      return new Response(JSON.stringify({ status: "success" as any, message: "Mock profile updated successfully." }), {
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
        status: "success" as any,
        message: "Profile updated successfully.",
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

import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { createComplaintSchema, updateComplaintSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { complaints, users } from "@/db/schema";
import { eq, and, sql, like } from "drizzle-orm";
import { generateId } from "@/lib/utils";

export async function GET(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["resident", "psp_operator"]);
    const sessionUser = sessionResponse.user as any;
    const userRole = sessionUser.role;
    const userId = sessionUser.id;

    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const search = url.searchParams.get("search") || "";
    
    const offset = (page - 1) * limit;

    let baseQuery;
    let countQuery;

    if (userRole === "resident") {
      baseQuery = db
        .select()
        .from(complaints)
        .where(
          and(
            eq(complaints.residentId, userId),
            search ? like(complaints.description, `%${search}%`) : undefined
          )
        );
      countQuery = db
        .select({ count: sql`COUNT(*)` })
        .from(complaints)
        .where(
          and(
            eq(complaints.residentId, userId),
            search ? like(complaints.description, `%${search}%`) : undefined
          )
        );
    } else {
      const pspId = sessionUser.pspId;
      if (!pspId) {
        return new Response("Unauthorized.", { status: 401 });
      }
      baseQuery = db
        .select()
        .from(complaints)
        .where(
          and(
            eq(complaints.pspId, pspId),
            search ? like(complaints.description, `%${search}%`) : undefined
          )
        );
      countQuery = db
        .select({ count: sql`COUNT(*)` })
        .from(complaints)
        .where(
          and(
            eq(complaints.pspId, pspId),
            search ? like(complaints.description, `%${search}%`) : undefined
          )
        );
    }

    const list = await baseQuery.limit(limit).offset(offset);
    const countResult = await countQuery.get();
    const totalCount = Number(countResult?.count || 0);

    return new Response(JSON.stringify({
      data: list,
      totalCount,
      totalPages: Math.ceil(totalCount / limit),
      page,
      limit
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["resident"]);
    const sessionUser = sessionResponse.user as any;
    const userId = sessionUser.id;
    const pspId = sessionUser.pspId;

    if (!pspId) {
      return new Response("Resident not assigned to a PSP.", { status: 400 });
    }

    const rawBody = await req.json();
    const parsed = createComplaintSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const { description } = parsed.data;

    const complaintId = generateId();

    await db.insert(complaints).values({
      id: complaintId,
      residentId: userId,
      pspId: pspId,
      description,
      status: "submitted",
    });

    return new Response(JSON.stringify({ status: "success", complaintId }), { status: 201, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const env = getAppEnv() as any;
  const db = getDb(env.DB);

  try {
    const sessionResponse = await requireRole(req, env.DB, ["psp_operator"]);
    const sessionUser = sessionResponse.user as any;
    const pspId = sessionUser.pspId;

    if (!pspId) {
      return new Response("Unauthorized.", { status: 401 });
    }

    const rawBody = await req.json();
    const parsed = updateComplaintSchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }
    const { complaintId, status } = parsed.data;

    const existing = await db
      .select()
      .from(complaints)
      .where(and(eq(complaints.id, complaintId), eq(complaints.pspId, pspId)))
      .get();

    if (!existing) {
      return new Response("Complaint not found.", { status: 404 });
    }

    await db
      .update(complaints)
      .set({ status, updatedAt: new Date() })
      .where(eq(complaints.id, complaintId));

    return new Response(JSON.stringify({ status: "success" }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}


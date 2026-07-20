import { requireRole } from "@/lib/session";
import { createComplaintSchema, updateComplaintSchema } from "@/lib/validators";
import { getDb } from "@/db";
import { complaints, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId } from "@/lib/utils";

export const runtime = "edge";

export async function GET(req: Request) {
  const env = process.env as any;
  const db = getDb(env.DB);

  try {
    // Both residents and PSPs can view complaints
    const sessionResponse = await requireRole(req, env.DB, ["resident", "psp_operator"]);
    const sessionUser = sessionResponse.user as any;
    const userRole = sessionUser.role;
    const userId = sessionUser.id;

    let list;
    if (userRole === "resident") {
      list = await db
        .select()
        .from(complaints)
        .where(eq(complaints.residentId, userId));
    } else {
      const pspId = sessionUser.pspId;
      if (!pspId) {
        return new Response("Unauthorized.", { status: 401 });
      }
      list = await db
        .select()
        .from(complaints)
        .where(eq(complaints.pspId, pspId));
    }

    return new Response(JSON.stringify(list), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function POST(req: Request) {
  const env = process.env as any;
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const env = process.env as any;
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { requireRole } from "@/lib/session";
import { getDb } from "@/db";
import { invoices, users } from "@/db/schema";
import { eq, inArray, and } from "drizzle-orm";
import { z } from "zod";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";
import { generateSecureReference } from "@/lib/utils";

const paySchema = z.object({
  invoiceIds: z.array(z.string()).min(1, "At least one invoice must be selected"),
});

export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;
  const db = getDb(env.DB as any);

  try {
    const session = await requireRole(req, env.DB as any, ["resident"]);
    const residentId = session.user.id;

    const rawBody = await req.json() as any;
    const parsed = paySchema.safeParse(rawBody);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), { status: 400 });
    }

    const { invoiceIds } = parsed.data;

    // Fetch resident user record for email
    const resident = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, residentId))
      .get();

    if (!resident) {
      return new Response("Resident not found.", { status: 404 });
    }

    // Fetch the invoices to ensure they belong to the resident and are unpaid
    const targetInvoices = await db
      .select({
        id: invoices.id,
        totalAmount: invoices.totalAmount,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.residentId, residentId),
          inArray(invoices.id, invoiceIds),
          inArray(invoices.status, ["pending", "overdue"])
        )
      )
      .all();

    if (targetInvoices.length === 0) {
      return new Response("No valid unpaid invoices found.", { status: 400 });
    }

    // Calculate total amount
    const totalAmountToPay = targetInvoices.reduce((sum, inv) => sum + (inv.totalAmount || 0), 0);
    const validInvoiceIds = targetInvoices.map(inv => inv.id);

    if (config.isMockMode) {
      return new Response(JSON.stringify({
        status: "success",
        checkoutUrl: "https://checkout.paystack.com/mock-url-12345",
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    if (!env.PAYSTACK_SECRET_KEY || !resident.email) {
      return new Response("Payment gateway not configured properly.", { status: 500 });
    }

    const reference = generateSecureReference(12, "SZINV");
    const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
    
    // Create comma-separated list of invoice IDs for metadata
    const invoiceIdsString = validInvoiceIds.join(",");
    
    const paystackData = await paystack.initializeTransaction({
      amount: totalAmountToPay,
      email: resident.email,
      reference,
      callbackUrl: `${req.headers.get("origin") || ""}/resident/invoices`,
      metadata: { 
        narration: `Payment for ${validInvoiceIds.length} invoice(s)`, 
        residentId,
        invoiceIds: invoiceIdsString
      },
    });

    return new Response(JSON.stringify({
      status: "success",
      checkoutUrl: paystackData.authorization_url,
      reference,
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("[Invoice Pay Error]", error);
    if (error.message === "Unauthorized") {
      return new Response("Unauthorized", { status: 401 });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
}

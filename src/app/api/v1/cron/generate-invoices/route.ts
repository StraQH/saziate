import { getDb } from "@/db";
import { users, residentProfiles, invoices, psps, transactions } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId, generateSecureReference, calculateResidentBill } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";



// Secure this endpoint in production (e.g. using a secret cron token)
export async function GET(req: Request) {
  const env = process.env as any;
  
  // Basic security: require a CRON_SECRET token
  const authHeader = req.headers.get("Authorization");
  if (!config.isMockMode) {
    if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  const db = getDb(env.DB);
  
  try {
    // 1. Fetch all active residents
    const activeResidents = await db
      .select({
        userId: users.id,
        name: users.name,
        firstName: users.firstName,
        email: users.email,
        phone: users.phone,
        pspId: users.pspId,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        billingCategory: residentProfiles.billingCategory,
        advancePaymentBalance: residentProfiles.advancePaymentBalance,
      })
      .from(users)
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .where(eq(users.role, "resident"));

    if (activeResidents.length === 0) {
      return new Response(JSON.stringify({ status: "success", message: "No active residents found." }), { status: 200 });
    }

    const currentMonthStart = new Date();
    currentMonthStart.setDate(1);
    currentMonthStart.setHours(0, 0, 0, 0);

    const dueDate = new Date();
    dueDate.setDate(7); // Bills due on the 7th of the month
    
    // 1.5 Fetch existing invoices for this month to prevent duplication
    const existingInvoices = await db
      .select({ residentId: invoices.residentId })
      .from(invoices)
      .where(eq(invoices.billingPeriodStart, new Date(currentMonthStart)));
    
    const billedResidentIds = new Set(existingInvoices.map((inv: { residentId: string }) => inv.residentId));

    let generatedCount = 0;
    let emailCount = 0;

    // 2. Generate Invoices
    for (const resident of activeResidents) {
      if (!resident.pspId) continue;
      
      // Prevent double billing
      if (billedResidentIds.has(resident.userId)) {
        continue;
      }
      
      const baseRate = resident.customMonthlyRate || 6000; // Default fallback
      const { baseAmount, platformFee, totalAmount } = calculateResidentBill(baseRate);

      const invoiceId = generateId();
      const paymentReference = generateSecureReference(10);
      
      const advanceBalance = resident.advancePaymentBalance || 0;
      let finalAmount = totalAmount;
      let invoiceStatus = "pending";
      let isFullySettled = false;
      let isPartiallySettled = false;
      let amountSettledFromAdvance = 0;

      if (advanceBalance >= totalAmount) {
        // Full Settlement
        finalAmount = totalAmount;
        invoiceStatus = "paid";
        isFullySettled = true;
        amountSettledFromAdvance = totalAmount;
        
        await db.update(residentProfiles)
          .set({ advancePaymentBalance: advanceBalance - totalAmount })
          .where(eq(residentProfiles.userId, resident.userId));
      } else if (advanceBalance > 0) {
        // Partial Settlement
        finalAmount = totalAmount - advanceBalance;
        invoiceStatus = "pending";
        isPartiallySettled = true;
        amountSettledFromAdvance = advanceBalance;

        await db.update(residentProfiles)
          .set({ advancePaymentBalance: 0 })
          .where(eq(residentProfiles.userId, resident.userId));
      }
      
      await db.insert(invoices).values({
        id: invoiceId,
        pspId: resident.pspId,
        residentId: resident.userId,
        paymentReference,
        baseAmount,
        platformFee,
        totalAmount: finalAmount, // Updated to reflect any partial reduction
        status: invoiceStatus,
        dueDate: dueDate,
        billingPeriodStart: currentMonthStart,
        billingPeriodEnd: dueDate,
      });

      if (isFullySettled || isPartiallySettled) {
        // Log transaction for the amount settled from advance
        await db.insert(transactions).values({
          id: generateId(),
          invoiceId,
          residentId: resident.userId,
          reference: `ADV-SETTLE-${Date.now()}`,
          amount: amountSettledFromAdvance,
          paymentMethod: "advance_balance",
          cashStatus: "settled",
        });
      }

      generatedCount++;

      // 3. Dispatch Emails or SMS fallback
      const hasRealEmail = resident.email && resident.email.includes("@") && !resident.email.endsWith("@saziate.com");
      const firstName = resident.firstName || resident.name.split(" ")[0];

      if (hasRealEmail) {
        if (isFullySettled) {
          await sendEmail({
            to: resident.email!,
            subject: "Your Monthly Bill is Settled!",
            html: emailTemplates.advanceBillSettled(firstName, totalAmount, advanceBalance - totalAmount),
          });
        } else if (isPartiallySettled) {
          await sendEmail({
            to: resident.email!,
            subject: "Partial Advance Payment Applied",
            html: emailTemplates.partialAdvanceSettled(firstName, amountSettledFromAdvance, finalAmount),
          });
        } else {
          await sendEmail({
            to: resident.email!,
            subject: "Your Monthly Waste Bill is Ready",
            html: emailTemplates.monthlyBill(
              firstName, 
              paymentReference, 
              totalAmount, 
              dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
            ),
          });
        }
        emailCount++;
      } else if (resident.phone) {
        let msg = "";
        if (isFullySettled) {
          msg = `Hello ${firstName}, your monthly bill of ₦${totalAmount} has been fully settled from your advance balance!`;
        } else if (isPartiallySettled) {
          msg = `Hello ${firstName}, partial payment applied. Outstanding: ₦${finalAmount}. Reference: ${paymentReference}.`;
        } else {
          msg = `Hello ${firstName}, your monthly bill of ₦${totalAmount} is due on ${dueDate.toLocaleDateString("en-GB")}. Reference: ${paymentReference}.`;
        }

        await sendNotificationWithFallback({
          dbBinding: env.DB,
          termiiApiKey: env.TERMII_API_KEY || "",
          pspId: resident.pspId,
          residentId: resident.userId,
          phone: resident.phone,
          messageText: msg,
          messageType: "due_invoice", // free system notification
          channel: "sms",
        });
      }
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Generated ${generatedCount} invoices and dispatched ${emailCount} emails.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Cron Error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

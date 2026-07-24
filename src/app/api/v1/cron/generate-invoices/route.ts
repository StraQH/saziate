import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, invoices, psps, transactions, pendingNotifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId, generateSecureReference, calculateResidentBill } from "@/lib/utils";
import { sendEmail } from "@/lib/email";
import { sendNotificationWithFallback } from "@/lib/notifications";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";

// Secure this endpoint in production (e.g. using a secret cron token)
export async function GET(req: Request) {
  const env = getAppEnv() as any;
  
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

    const newInvoices: any[] = [];
    const newTransactions: any[] = [];
    const pendingNotificationsQueue: any[] = [];

    // Arrays to hold profile updates (using sequential execution later or batched queries if available)
    const profileUpdates: { userId: string; advancePaymentBalance: number }[] = [];

    // 2. Prepare Invoices & Transactions in memory
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
        profileUpdates.push({ userId: resident.userId, advancePaymentBalance: advanceBalance - totalAmount });
      } else if (advanceBalance > 0) {
        // Partial Settlement
        finalAmount = totalAmount - advanceBalance;
        invoiceStatus = "pending";
        isPartiallySettled = true;
        amountSettledFromAdvance = advanceBalance;
        profileUpdates.push({ userId: resident.userId, advancePaymentBalance: 0 });
      }
      
      newInvoices.push({
        id: invoiceId,
        pspId: resident.pspId,
        residentId: resident.userId,
        paymentReference,
        baseAmount,
        platformFee,
        totalAmount: finalAmount,
        status: invoiceStatus,
        dueDate: dueDate,
        billingPeriodStart: currentMonthStart,
        billingPeriodEnd: dueDate,
      });

      if (isFullySettled || isPartiallySettled) {
        newTransactions.push({
          id: generateId(),
          invoiceId,
          residentId: resident.userId,
          reference: `ADV-SETTLE-${Date.now()}-${generateId().substring(0,4)}`,
          amount: amountSettledFromAdvance,
          paymentMethod: "advance_balance",
          cashStatus: "settled",
        });
      }

      generatedCount++;

      // 3. Prepare Dispatch Promises (Emails or SMS fallback)
      const hasRealEmail = resident.email && resident.email.includes("@") && !resident.email.endsWith("@saziate.com");
      const firstName = resident.firstName || resident.name.split(" ")[0];

      if (hasRealEmail) {
        let subject = "";
        let html = "";
        if (isFullySettled) {
          subject = "Your Monthly Bill is Settled!";
          html = emailTemplates.advanceBillSettled(firstName, totalAmount, advanceBalance - totalAmount);
        } else if (isPartiallySettled) {
          subject = "Partial Advance Payment Applied";
          html = emailTemplates.partialAdvanceSettled(firstName, amountSettledFromAdvance, finalAmount);
        } else {
          subject = "Your Monthly Waste Bill is Ready";
          html = emailTemplates.monthlyBill(
            firstName, 
            paymentReference, 
            totalAmount, 
            dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
          );
        }
        
        pendingNotificationsQueue.push({
          id: generateId(),
          pspId: resident.pspId,
          residentId: resident.userId,
          channel: "email",
          messageType: "due_invoice",
          recipientPhone: resident.email!, // Store email here for email channel
          messageText: JSON.stringify({ subject, html }),
        });
        
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

        pendingNotificationsQueue.push({
          id: generateId(),
          pspId: resident.pspId,
          residentId: resident.userId,
          channel: "sms",
          messageType: "due_invoice",
          recipientPhone: resident.phone,
          messageText: msg,
        });
      }
    }

    // 4. Execute Batched Database Inserts (Chunked)
    const chunkSize = 500;
    
    // Chunked Invoices
    for (let i = 0; i < newInvoices.length; i += chunkSize) {
      const chunk = newInvoices.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        await db.insert(invoices).values(chunk);
      }
    }

    // Chunked Transactions
    for (let i = 0; i < newTransactions.length; i += chunkSize) {
      const chunk = newTransactions.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        await db.insert(transactions).values(chunk);
      }
    }

    // Process profile updates (Advance balance deduction) using db.batch
    const batchUpdateQueries = profileUpdates.map(update => 
      db.update(residentProfiles)
        .set({ advancePaymentBalance: update.advancePaymentBalance })
        .where(eq(residentProfiles.userId, update.userId))
    );
    for (let i = 0; i < batchUpdateQueries.length; i += 100) {
      await db.batch(batchUpdateQueries.slice(i, i + 100) as any);
    }

    // Insert pending SMS notifications into database queue (Chunked)
    for (let i = 0; i < pendingNotificationsQueue.length; i += chunkSize) {
      const chunk = pendingNotificationsQueue.slice(i, i + chunkSize);
      if (chunk.length > 0) {
        await db.insert(pendingNotifications).values(chunk);
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

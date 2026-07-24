import { getAppEnv } from "@/lib/env";
import { getDb } from "@/db";
import { users, residentProfiles, invoices, transactions, pendingNotifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { generateId, generateSecureReference, calculateResidentBill } from "@/lib/utils";
import { emailTemplates } from "@/lib/email-templates";
import { config } from "@/lib/config";


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

    // Force strict UTC timezone boundaries
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth(); // 0-indexed

    const currentMonthStart = new Date(Date.UTC(year, month, 1));
    const currentMonthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
    const dueDate = new Date(Date.UTC(year, month, 7, 23, 59, 59, 999));
    
    // Fetch existing invoices for this month to prevent duplication
    const existingInvoices = await db
      .select({ residentId: invoices.residentId })
      .from(invoices)
      .where(eq(invoices.billingPeriodStart, currentMonthStart));
    
    const billedResidentIds = new Set(existingInvoices.map((inv: { residentId: string }) => inv.residentId));

    let generatedCount = 0;
    let emailCount = 0;

    const newInvoices: any[] = [];
    const newTransactions: any[] = [];
    const pendingNotificationsQueue: any[] = [];
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
      
      const advanceBalance = Math.round((resident.advancePaymentBalance || 0) * 100) / 100;
      let finalAmount = totalAmount;
      let invoiceStatus = "pending";
      let isFullySettled = false;
      let isPartiallySettled = false;
      let amountSettledFromAdvance = 0;

      if (advanceBalance >= totalAmount) {
        // Full Settlement
        finalAmount = 0;
        invoiceStatus = "paid";
        isFullySettled = true;
        amountSettledFromAdvance = totalAmount;
        profileUpdates.push({ userId: resident.userId, advancePaymentBalance: Math.round((advanceBalance - totalAmount) * 100) / 100 });
      } else if (advanceBalance > 0) {
        // Partial Settlement
        finalAmount = Math.round((totalAmount - advanceBalance) * 100) / 100;
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
        billingPeriodEnd: currentMonthEnd,
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
          status: "success",
          paidAt: new Date(),
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
          subject = "Your Monthly Waste Bill is Settled!";
          html = emailTemplates.advanceBillSettled(firstName, totalAmount, Math.round((advanceBalance - totalAmount) * 100) / 100);
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
          recipientPhone: resident.email!,
          messageText: JSON.stringify({ subject, html }),
        });
        
        emailCount++;
      } else if (resident.phone) {
        let msg = "";
        if (isFullySettled) {
          msg = `Hello ${firstName}, your monthly waste bill of ₦${totalAmount} has been fully settled from your advance balance!`;
        } else if (isPartiallySettled) {
          msg = `Hello ${firstName}, partial payment of ₦${amountSettledFromAdvance} applied. Outstanding: ₦${finalAmount}. Reference: ${paymentReference}.`;
        } else {
          msg = `Hello ${firstName}, your monthly waste bill of ₦${totalAmount} is due on ${dueDate.toLocaleDateString("en-GB")}. Reference: ${paymentReference}.`;
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

    // 4. Optimization: Group all database mutations into D1 batch chunks to eliminate N+1 loops
    const batchOps: any[] = [];

    // Chunk Invoices
    for (const inv of newInvoices) {
      batchOps.push(db.insert(invoices).values(inv));
    }

    // Chunk Transactions
    for (const tx of newTransactions) {
      batchOps.push(db.insert(transactions).values(tx));
    }

    // Profile updates
    for (const update of profileUpdates) {
      batchOps.push(
        db.update(residentProfiles)
          .set({ advancePaymentBalance: update.advancePaymentBalance })
          .where(eq(residentProfiles.userId, update.userId))
      );
    }

    // Pending Notifications
    for (const notif of pendingNotificationsQueue) {
      batchOps.push(db.insert(pendingNotifications).values(notif));
    }

    // Execute in batch blocks of 90 to prevent D1 size limit exceptions
    if (batchOps.length > 0) {
      const CHUNK_SIZE = 90;
      for (let i = 0; i < batchOps.length; i += CHUNK_SIZE) {
        await db.batch(batchOps.slice(i, i + CHUNK_SIZE) as any);
      }
    }

    return new Response(JSON.stringify({ 
      status: "success", 
      message: `Generated ${generatedCount} invoices and queued ${pendingNotificationsQueue.length} notifications.` 
    }), { status: 200, headers: { "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Cron Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

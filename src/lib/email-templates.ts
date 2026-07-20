/**
 * Centralized Email Templates for Saziate
 */

export const emailTemplates = {
  /**
   * Welcome Email template for newly onboarded residents
   */
  welcomeResident: (name: string, tempPassword: string, referenceCode: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Welcome to Saziate, ${name}!</h2>
      <p>Your waste management account has been created successfully.</p>
      <p>You can log in to the Resident Portal using your phone number and this temporary password:</p>
      <div style="padding: 12px; background: #f3f4f6; border-radius: 6px; font-size: 18px; margin: 16px 0;">
        <strong>${tempPassword}</strong>
      </div>
      <p>Your unique account reference is: <strong>${referenceCode}</strong></p>
      <p>Please log in and change your password as soon as possible to secure your account.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Monthly Invoice/Bill template
   */
  monthlyBill: (name: string, paymentReference: string, totalAmount: number, dueDate: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #3b82f6;">Your Monthly Waste Bill is Ready</h2>
      <p>Dear ${name},</p>
      <p>Your waste collection bill for this month has been generated.</p>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 16px 0;">
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="margin-bottom: 8px;"><strong>Invoice Reference:</strong> <span style="font-family: monospace;">${paymentReference}</span></li>
          <li style="margin-bottom: 8px;"><strong>Total Amount Due:</strong> ₦${totalAmount.toLocaleString("en-NG")}</li>
          <li><strong>Due Date:</strong> <span style="color: #ef4444; font-weight: bold;">${dueDate}</span></li>
        </ul>
      </div>
      <p>Please log in to your Resident Portal to make a secure payment online using your Invoice Reference.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Payment Receipt template
   */
  paymentReceipt: (name: string, amount: number) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Payment Received!</h2>
      <p>Dear ${name},</p>
      <p>We have successfully received and verified your payment of <strong>₦${amount.toLocaleString("en-NG")}</strong>.</p>
      <p>Your invoice has been marked as PAID. Thank you for your prompt payment!</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Operator Payout Confirmation template
   */
  payoutConfirmation: (operatorName: string, amount: number, accountMask: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #3b82f6;">Payout Processed Successfully</h2>
      <p>Hello ${operatorName},</p>
      <p>A payout of <strong>₦${amount.toLocaleString("en-NG")}</strong> has been processed to your settlement account ending in <strong>${accountMask}</strong>.</p>
      <p>Funds should reflect in your bank account shortly.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Finance Team</strong></p>
    </div>
  `,

  /**
   * Advance Bill Fully Settled
   */
  advanceBillSettled: (name: string, billAmount: number, remainingBalance: number) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Your Monthly Bill is Settled!</h2>
      <p>Dear ${name},</p>
      <p>Your monthly waste bill of <strong>₦${billAmount.toLocaleString("en-NG")}</strong> has been successfully settled using your advance payment balance.</p>
      <p>You have <strong>₦${remainingBalance.toLocaleString("en-NG")}</strong> remaining in your upfront balance.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Partial Advance Settled
   */
  partialAdvanceSettled: (name: string, advanceApplied: number, remainingDue: number) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #f59e0b;">Partial Payment Applied</h2>
      <p>Dear ${name},</p>
      <p>Your entire advance payment balance of <strong>₦${advanceApplied.toLocaleString("en-NG")}</strong> was applied to your latest monthly bill.</p>
      <p>You have a remaining balance due of <strong style="color: #ef4444;">₦${remainingDue.toLocaleString("en-NG")}</strong> for this month.</p>
      <p>Please log in to your Resident Portal to settle the remaining balance.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Advance Payment Receipt
   */
  advancePaymentReceipt: (name: string, amount: number) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Advance Payment Received!</h2>
      <p>Dear ${name},</p>
      <p>We have successfully received your upfront advance payment of <strong>₦${amount.toLocaleString("en-NG")}</strong>.</p>
      <p>This balance will be automatically used to settle your future monthly invoices.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `
};

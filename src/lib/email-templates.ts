/**
 * Centralized Email Templates for Saziate
 */

export const emailTemplates = {
  /**
   * Welcome Email template for newly onboarded residents
   */
  welcomeResident: (name: string, tempPassword: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Welcome to Saziate, ${name}!</h2>
      <p>Your waste management account has been created successfully.</p>
      <p>You can log in to the Resident Portal using your phone number and this temporary password:</p>
      <div style="padding: 12px; background: #f3f4f6; border-radius: 6px; font-size: 18px; margin: 16px 0;">
        <strong>${tempPassword}</strong>
      </div>
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
      <p>We have successfully received your upfront advance payment of <strong>,${amount.toLocaleString("en-NG")}</strong>.</p>
      <p>This balance will be automatically used to settle your future monthly invoices.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * PSP Registration Welcome (Pending Approval)
   */
  welcomePSP: (name: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #3b82f6;">Welcome to Saziate, ${name}!</h2>
      <p>Thank you for registering your company on the Saziate Waste Management Platform.</p>
      <p>Your account is currently <strong>Pending Admin Approval</strong>.</p>
      <p>Once approved, we will provision your Dedicated Virtual Account so you can begin collecting waste payments seamlessly.</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Onboarding Team</strong></p>
    </div>
  `,

  /**
   * PSP Approved (DVA Provisioned)
   */
  approvePSP: (name: string, bankName: string, accountNumber: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Congratulations, ${name}! Your Account is Approved!</h2>
      <p>Your Saziate operator account has been fully approved and activated.</p>
      <p>We have provisioned a Dedicated Virtual Account for your company to receive payments from residents:</p>
      <div style="padding: 16px; border: 1px solid #e5e7eb; border-radius: 6px; margin: 16px 0;">
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="margin-bottom: 8px;"><strong>Bank Name:</strong> ${bankName}</li>
          <li><strong>Account Number:</strong> <span style="font-size: 18px; font-weight: bold; color: #3b82f6;">${accountNumber}</span></li>
        </ul>
      </div>
      <p><strong>IMPORTANT:</strong> Please log in to your Saziate Operator Dashboard and navigate to <em>Settings</em> to add your external settlement bank account details. Saziate will automatically route collected funds to that external account!</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Invite Field Agent
   */
  inviteAgent: (pspName: string, inviteLink: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #3b82f6;">You've been invited to join ${pspName}!</h2>
      <p>You have been invited to join <strong>${pspName}</strong> as a Field Agent on the Saziate platform.</p>
      <p>Please click the button below to create your account and password. Once registered, you will be able to log field collections and verify payments on behalf of your operator.</p>
      <div style="margin: 24px 0;">
        <a href="${inviteLink}" style="background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Accept Invitation & Sign Up</a>
      </div>
      <p style="font-size: 12px; color: #6b7280;">If the button doesn't work, copy and paste this link into your browser: <br/>${inviteLink}</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `,

  /**
   * Invoice Receipt (Payment Confirmed)
   */
  invoiceReceipt: (residentName: string, amount: number, invoiceRef: string, transactionRef: string) => `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <h2 style="color: #10b981;">Payment Confirmed!</h2>
      <p>Hello ${residentName},</p>
      <p>We have successfully received your payment of <strong>₦${amount.toLocaleString()}</strong>.</p>
      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 4px 0;"><strong>Invoice Reference:</strong> ${invoiceRef}</p>
        <p style="margin: 4px 0;"><strong>Transaction ID:</strong> ${transactionRef}</p>
      </div>
      <p>Thank you for keeping your community clean!</p>
      <br/>
      <p>Regards,<br/><strong>The Saziate Team</strong></p>
    </div>
  `
};

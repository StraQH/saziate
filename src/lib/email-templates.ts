/**
 * Centralized Email Templates for Saziate
 */

const buildEmailWrapper = (title: string, contentHtml: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F8FAFC; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #F8FAFC; padding: 40px 20px;">
    <tr>
      <td align="center" valign="top">
        <table width="100%" max-width="600" style="max-width: 600px; width: 100%; background-color: #FFFFFF; border-radius: 12px; border: 1px solid #E2E8F0; border-collapse: separate; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03);">
          <!-- Top Accent Bar -->
          <tr>
            <td height="6" style="background-color: #2563EB; line-height: 6px; font-size: 6px;">&nbsp;</td>
          </tr>
          
          <!-- Logo & Header -->
          <tr>
            <td align="center" style="padding: 32px 40px 24px 40px; border-bottom: 1px solid #F1F5F9;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td align="center">
                    <span style="font-size: 24px; font-weight: 800; letter-spacing: -0.5px; color: #1E293B; font-family: inherit;">
                      Sazi<span style="color: #2563EB;">ate</span>
                    </span>
                    <div style="font-size: 11px; font-weight: 600; color: #64748B; text-transform: uppercase; letter-spacing: 1px; margin-top: 4px;">Smart Waste Utility</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td align="left" style="padding: 40px 40px 32px 40px; line-height: 1.6; color: #334155; font-size: 15px;">
              ${contentHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 32px 40px; background-color: #F8FAFC; border-top: 1px solid #F1F5F9; color: #64748B; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 8px 0; font-weight: 600; color: #475569;">Saziate Platform</p>
              <p style="margin: 0 0 16px 0;">Transforming municipal waste systems with automated billing and operations.</p>
              <p style="margin: 0; font-size: 11px; color: #94A3B8;">&copy; ${new Date().getFullYear()} Saziate. All rights reserved.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

export const emailTemplates = {
  /**
   * Password Reset Email
   */
  passwordReset: (token: string) => buildEmailWrapper("Password Reset Request", `
    <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Password Reset Code</h2>
    <p style="margin: 0 0 20px 0;">You have requested to reset your password. Use the verification code below to set a new password. This code will expire in 10 minutes.</p>
    <div style="padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 24px; font-weight: 700; text-align: center; letter-spacing: 4px; color: #1E293B; margin: 24px 0;">
      ${token}
    </div>
    <p style="margin: 0; font-size: 14px; color: #64748B;">If you did not request this, please ignore this email or contact support.</p>
  `),

  /**
   * Welcome Email template for newly onboarded residents
   */
  welcomeResident: (name: string, tempPassword: string) => buildEmailWrapper("Welcome to Saziate", `
    <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Welcome to Saziate, ${name}!</h2>
    <p style="margin: 0 0 20px 0;">We are delighted to welcome you to the Saziate community. Your premium waste management profile is set up and ready to use.</p>
    <p style="margin: 0 0 20px 0;">Access your personalized resident dashboard to monitor collections, view schedules, and manage bills. To log in, please use your phone number and the temporary secure password below:</p>
    <div style="padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 20px; font-weight: 700; text-align: center; letter-spacing: 2px; color: #1E293B; margin: 24px 0;">
      ${tempPassword}
    </div>
    <p style="margin: 0; font-size: 14px; color: #64748B;">Please log in and update your password immediately to secure your portal access.</p>
  `),

  /**
   * Monthly Invoice/Bill template
   */
  monthlyBill: (name: string, paymentReference: string, totalAmount: number, dueDate: string) => buildEmailWrapper("Your Monthly Waste Bill", `
    <h2 style="color: #1E293B; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Monthly Invoice Ready</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name}, we hope you are having a wonderful week. Your waste collection utility invoice for this billing cycle has been prepared and is detailed below:</p>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 24px; margin: 24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #334155;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;"><strong>Invoice Reference</strong></td>
          <td align="right" style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-family: monospace; font-weight: 600; color: #1E293B;">${paymentReference}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;"><strong>Amount Due</strong></td>
          <td align="right" style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-weight: 700; color: #2563EB; font-size: 16px;">₦${totalAmount.toLocaleString("en-NG")}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B;"><strong>Due Date</strong></td>
          <td align="right" style="padding: 8px 0; font-weight: 600; color: #EF4444;">${dueDate}</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0 0 24px 0;">Please log in to your Resident Portal to make a secure payment online using your Invoice Reference.</p>
    <div align="center" style="margin: 24px 0;">
      <a href="https://saziate.com/login" style="background-color: #2563EB; color: #FFFFFF; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block;">Pay Invoice Now</a>
    </div>
  `),

  /**
   * Payment Receipt template
   */
  paymentReceipt: (name: string, amount: number) => buildEmailWrapper("Payment Receipt", `
    <h2 style="color: #10B981; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Payment Confirmed</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name},</p>
    <p style="margin: 0 0 20px 0;">We have successfully received and verified your payment of <strong style="color: #1E293B;">₦${amount.toLocaleString("en-NG")}</strong>.</p>
    <p style="margin: 0 0 20px 0;">Your invoice has been marked as <strong>PAID</strong>. Thank you for your prompt payment! Your support keeps our waste clearance operations running smoothly.</p>
  `),

  /**
   * Operator Payout Confirmation template
   */
  payoutConfirmation: (operatorName: string, amount: number, accountMask: string) => buildEmailWrapper("Payout Settled", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Settlement Processed</h2>
    <p style="margin: 0 0 20px 0;">Hello ${operatorName},</p>
    <p style="margin: 0 0 20px 0;">Your operator payout settlement of <strong style="color: #1E293B;">₦${amount.toLocaleString("en-NG")}</strong> has been processed successfully to your settlement account ending in <strong>${accountMask}</strong>.</p>
    <p style="margin: 0; font-size: 14px; color: #64748B;">Funds should reflect in your registered bank account shortly.</p>
  `),

  /**
   * Advance Bill Fully Settled
   */
  advanceBillSettled: (name: string, billAmount: number, remainingBalance: number) => buildEmailWrapper("Monthly Bill Settled", `
    <h2 style="color: #10B981; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Monthly Bill Settled!</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name},</p>
    <p style="margin: 0 0 20px 0;">Your monthly waste bill of <strong style="color: #1E293B;">₦${billAmount.toLocaleString("en-NG")}</strong> has been successfully settled using your advance payment balance.</p>
    <div style="background-color: #F0FDF4; border: 1px solid #DCFCE7; border-radius: 8px; padding: 16px; margin: 24px 0; font-size: 14px; color: #15803D; text-align: center;">
      <strong>Remaining Prepaid Balance:</strong> ₦${remainingBalance.toLocaleString("en-NG")}
    </div>
  `),

  /**
   * Partial Advance Settled
   */
  partialAdvanceSettled: (name: string, advanceApplied: number, remainingDue: number) => buildEmailWrapper("Partial Payment Applied", `
    <h2 style="color: #F59E0B; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Partial Payment Applied</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name},</p>
    <p style="margin: 0 0 20px 0;">Your prepaid wallet balance of <strong style="color: #1E293B;">₦${advanceApplied.toLocaleString("en-NG")}</strong> has been applied to this cycle's invoice.</p>
    <p style="margin: 0 0 24px 0;">An outstanding balance of <strong style="color: #EF4444;">₦${remainingDue.toLocaleString("en-NG")}</strong> remains. Please log in to your Resident Portal to complete the settlement at your convenience.</p>
    <div align="center" style="margin: 24px 0;">
      <a href="https://saziate.com/login" style="background-color: #2563EB; color: #FFFFFF; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block;">Settle Outstanding Balance</a>
    </div>
  `),

  /**
   * Advance Payment Receipt
   */
  advancePaymentReceipt: (name: string, amount: number) => buildEmailWrapper("Advance Payment Received", `
    <h2 style="color: #10B981; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Prepayment Confirmed</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name},</p>
    <p style="margin: 0 0 20px 0;">We have successfully received your prepaid credit addition of <strong style="color: #1E293B;">₦${amount.toLocaleString("en-NG")}</strong>.</p>
    <p style="margin: 0; font-size: 14px; color: #64748B;">This balance will be safely held and automatically applied to your future waste invoices.</p>
  `),

  welcomePSP: (name: string) => buildEmailWrapper("Welcome to Saziate", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Welcome to Saziate, ${name}!</h2>
    <p style="margin: 0 0 20px 0;">Thank you for partnering with Saziate. We are excited to support your waste management operations.</p>
    <p style="margin: 0 0 20px 0;">Your operator profile is active. To enable automatic billing and receive direct payments, please log in and register your external settlement bank account. Your Dedicated Virtual Account (DVA) will be provisioned instantly upon submission.</p>
    <div align="center" style="margin: 24px 0;">
      <a href="https://saziate.com/login" style="background-color: #2563EB; color: #FFFFFF; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block;">Link Bank Account</a>
    </div>
  `),

  /**
   * Welcome PSP Operator (Admin Onboarded)
   */
  welcomePspOperator: (name: string, tempPassword: string) => buildEmailWrapper("Welcome to Saziate", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Operator Profile Activated</h2>
    <p style="margin: 0 0 20px 0;">Welcome to Saziate, ${name}!</p>
    <p style="margin: 0 0 20px 0;">A Saziate Operator Profile has been generated for you by the platform administrator.</p>
    <p style="margin: 0 0 20px 0;">Please log in to your Saziate Operator Dashboard using your registered email and the temporary password below:</p>
    <div style="padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 20px; font-weight: 700; text-align: center; letter-spacing: 2px; color: #1E293B; margin: 24px 0;">
      ${tempPassword}
    </div>
    <p style="margin: 0; font-size: 14px; color: #64748B;">Please log in and update your password immediately to secure your operator portal.</p>
  `),

  /**
   * Welcome Field Agent Onboarding template
   */
  welcomeAgent: (name: string, pspName: string, tempPassword: string) => buildEmailWrapper("Welcome to Saziate", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Field Agent Profile Activated</h2>
    <p style="margin: 0 0 20px 0;">Welcome to Saziate, ${name}!</p>
    <p style="margin: 0 0 20px 0;">You have been successfully onboarded as a Field Agent representing <strong>${pspName}</strong>.</p>
    <p style="margin: 0 0 20px 0;">Please access the Field Agent mobile route application using your email and the temporary password below:</p>
    <div style="padding: 16px; background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 20px; font-weight: 700; text-align: center; letter-spacing: 2px; color: #1E293B; margin: 24px 0;">
      ${tempPassword}
    </div>
    <p style="margin: 0; font-size: 14px; color: #64748B;">Please log in and change your password immediately to secure your access.</p>
  `),

  /**
   * PSP Approved (DVA Provisioned)
   */
  approvePSP: (name: string, bankName: string, accountNumber: string) => buildEmailWrapper("Virtual Account Activated", `
    <h2 style="color: #10B981; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Virtual Account Provisioned!</h2>
    <p style="margin: 0 0 20px 0;">Congratulations ${name}, your Saziate operator account has been fully verified and activated.</p>
    <p style="margin: 0 0 20px 0;">We have successfully provisioned your Dedicated Virtual Account (DVA) to receive direct waste payments from residents:</p>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 24px; margin: 24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #334155;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;"><strong>DVA Bank Name</strong></td>
          <td align="right" style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-weight: 600; color: #1E293B;">${bankName}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B;"><strong>DVA Account Number</strong></td>
          <td align="right" style="padding: 8px 0; font-weight: 700; color: #2563EB; font-size: 18px;">${accountNumber}</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0 0 20px 0;"><strong>IMPORTANT:</strong> If you haven't already, please link your external Settlement Bank details in <em>Settings</em>. All collected resident payments will be automatically swept to your payout account.</p>
  `),

  /**
   * Invite Field Agent
   */
  inviteAgent: (pspName: string, inviteLink: string) => buildEmailWrapper("Join Saziate", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Invitation to Join ${pspName}</h2>
    <p style="margin: 0 0 20px 0;">You have been invited to join the field operations team at <strong>${pspName}</strong> as a Field Agent on the Saziate platform.</p>
    <p style="margin: 0 0 24px 0;">Please click the button below to accept the invitation and set up your agent credentials. Once registered, you will be able to log field collections and verify payments on behalf of your operator.</p>
    <div align="center" style="margin: 24px 0;">
      <a href="${inviteLink}" style="background-color: #2563EB; color: #FFFFFF; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block;">Accept Invitation</a>
    </div>
    <p style="font-size: 11px; color: #94A3B8; margin-top: 24px;">If the button doesn't work, copy and paste this link into your browser: <br/>${inviteLink}</p>
  `),

  /**
   * Invoice Receipt (Payment Confirmed)
   */
  invoiceReceipt: (residentName: string, amount: number, invoiceRef: string, transactionRef: string) => buildEmailWrapper("Payment Receipt", `
    <h2 style="color: #10B981; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Payment Confirmed</h2>
    <p style="margin: 0 0 20px 0;">Hello ${residentName},</p>
    <p style="margin: 0 0 20px 0;">Thank you for your payment. Your waste utility invoice has been processed successfully. Below is your official digital receipt:</p>
    <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 24px; margin: 24px 0;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="font-size: 14px; color: #334155;">
        <tr>
          <td style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;"><strong>Invoice Reference</strong></td>
          <td align="right" style="padding: 8px 0; border-bottom: 1px solid #E2E8F0; font-family: monospace; font-weight: 600; color: #1E293B;">${invoiceRef}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #64748B;"><strong>Transaction ID</strong></td>
          <td align="right" style="padding: 8px 0; font-family: monospace; font-weight: 600; color: #1E293B;">${transactionRef}</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0; font-size: 14px; color: #64748B; font-style: italic;">Thank you for partnering with Saziate to keep our neighborhoods clean!</p>
  `),

  /**
   * Waste Collection Vehicle En Route Alert
   */
  routeActive: (name: string, routeName: string) => buildEmailWrapper("Waste Collection Active", `
    <h2 style="color: #2563EB; font-size: 20px; font-weight: 700; margin: 0 0 16px 0;">Waste Truck En Route!</h2>
    <p style="margin: 0 0 20px 0;">Dear ${name},</p>
    <p style="margin: 0 0 20px 0;">The waste collection team is en route! The service truck is currently entering your street zone on route: <strong>${routeName}</strong> today.</p>
    <p style="margin: 0 0 24px 0;">Please ensure that your waste bins or drums are positioned at the curb for collection. You can track progress in real-time on your dashboard.</p>
    <div align="center" style="margin: 24px 0;">
      <a href="https://saziate.com" style="background-color: #2563EB; color: #FFFFFF; font-weight: 600; padding: 12px 32px; text-decoration: none; border-radius: 6px; display: inline-block;">Track Truck Progress</a>
    </div>
  `)
};


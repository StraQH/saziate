export const smsTemplates = {
  /**
   * Welcome Resident SMS
   */
  welcomeResident: (name: string, tempPassword: string) => 
    `Hello ${name}, welcome to Saziate! Your account has been created. Log in at saziate.com with your phone number and temporary password: ${tempPassword}. Please update your email on login.`,

  /**
   * Payment Logged SMS
   */
  paymentLogged: (amount: string, invoiceId: string) =>
    `We have received your payment of NGN ${amount} for invoice ${invoiceId}. Your account will be updated once verified.`,
    
  /**
   * Payment Verified SMS
   */
  paymentVerified: (amount: string, invoiceId: string) =>
    `Your payment of NGN ${amount} for invoice ${invoiceId} has been successfully verified and applied to your account.`,

  /**
   * Forgot Password Reset Code
   */
  forgotPassword: (code: string) =>
    `Your Saziate password reset code is: ${code}. It expires in 10 minutes.`,
};

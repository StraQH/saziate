import { config } from "./config";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email using Resend API.
 * In mock mode, logs to the console instead.
 */
export async function sendEmail({ to, subject, html }: SendEmailParams): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;

  if (config.isMockMode || !apiKey) {
    console.log("----------------------------------------");
    console.log(`[MOCK EMAIL] To: ${to}`);
    console.log(`[MOCK EMAIL] Subject: ${subject}`);
    console.log(`[MOCK EMAIL] Body:\n${html}`);
    console.log("----------------------------------------");
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Saziate <noreply@saziate.com>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("Failed to send email via Resend:", errorText);
    // Optionally throw error based on your strictness requirements
  }
}

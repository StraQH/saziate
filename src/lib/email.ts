import { config } from "./config";
import { getAppEnv } from "./env";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  apiKey?: string;
}

/**
 * Sends an email using Resend API.
 * In mock mode, logs to the console instead.
 */
export async function sendEmail({ to, subject, html, apiKey }: SendEmailParams): Promise<void> {
  const env = getAppEnv();
  const finalApiKey = apiKey || env.RESEND_API_KEY;

  if (config.isMockMode || !finalApiKey) {
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
      Authorization: `Bearer ${finalApiKey}`,
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

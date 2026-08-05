import { getCloudflareContext } from "@opennextjs/cloudflare";

export type CloudflareEnv = {
  DB: import("@cloudflare/workers-types").D1Database;
  NEXT_PUBLIC_MOCK_MODE?: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
  TERMII_API_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PUBLIC_KEY?: string;
};

export function getAppEnv(): Record<string, any> {
  let env: Record<string, any> = process.env;
  try {
    const cfContext = getCloudflareContext();
    if (cfContext && cfContext.env) {
      env = cfContext.env;
    }
  } catch (e) {
    // Silently fallback to process.env for local Next.js dev server
  }
  return env;
}

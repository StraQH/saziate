// src/lib/env.ts
export type CloudflareEnv = {
  DB: import("@cloudflare/workers-types").D1Database;
  NEXT_PUBLIC_MOCK_MODE?: string;
  BETTER_AUTH_SECRET?: string;
  RESEND_API_KEY?: string;
};

// In Next.js Node.js environment, we polyfill CloudflareEnv
let env: Record<string, string | undefined> = process.env as Record<string, string | undefined>;

export function getAppEnv(): Record<string, string | undefined> {
  return env;
}

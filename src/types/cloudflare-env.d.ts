// Cloudflare Workers environment bindings
// Referenced in API route handlers via `process.env` or the Workers `env` object
interface CloudflareEnv {
  DB: D1Database;
  ASSETS: Fetcher;
  NEXT_PUBLIC_APP_NAME: string;
  BETTER_AUTH_SECRET: string;
  PAYSTACK_SECRET_KEY: string;
  PAYSTACK_WEBHOOK_SECRET: string;
  TERMII_API_KEY: string;
}

declare global {
  // Augment Next.js process.env for editor type-safety
  namespace NodeJS {
    interface ProcessEnv extends CloudflareEnv {}
  }
}

export {};

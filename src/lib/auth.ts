// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

const authSecret = process.env.BETTER_AUTH_SECRET || "mock_secret";

/**
 * Configure Better Auth instance with Drizzle ORM Adapter for SQLite/D1.
 */
export const auth = (dbBinding: D1Database, requestOrigin?: string) => {
  const db = getDb(dbBinding);
  const isDemo = process.env.NEXT_PUBLIC_MOCK_MODE === "true" || requestOrigin?.includes("demo.saziate.com");

  // Dynamically resolve base URL to handle Cloudflare Workers execution cleanly
  const baseURL = requestOrigin || (isDemo ? "https://demo.saziate.com" : "https://app.saziate.com");

  return betterAuth({
    baseURL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        ...schema,
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    secret: authSecret,
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: [
      "http://localhost:3000",
      "https://saziate.pages.dev",
      "https://app.saziate.com",
      "https://demo.saziate.com",
    ],
    advanced: {
      cookiePrefix: isDemo ? "saziate_demo" : "saziate_prod",
      crossSubdomainCookies: {
        enabled: false,
      },
      disableCSRFCheck: false,
    },
  });
};
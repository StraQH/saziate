// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/schema";

const authSecret = process.env.BETTER_AUTH_SECRET || "saziate_prod_secret_2026";

/**
 * Configure Better Auth instance with explicit table mappings for Cloudflare D1.
 */
export const getAuth = (dbBinding: D1Database, requestOrigin?: string) => {
  const db = getDb(dbBinding);
  const isDemo = process.env.NEXT_PUBLIC_MOCK_MODE === "true" || requestOrigin?.includes("demo.saziate.com");
  const baseURL = requestOrigin || (isDemo ? "https://demo.saziate.com" : "https://app.saziate.com");

  return betterAuth({
    baseURL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: users,
        session: sessions,
        account: accounts,
        verification: verifications,
      },
      usePlural: true,
      transaction: false, // REQUIRED FOR CLOUDFLARE D1 (D1 does not support nested Drizzle transactions)
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

export const auth = getAuth;
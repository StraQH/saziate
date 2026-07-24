// src/lib/auth.ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import { users, sessions, accounts, verifications } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/hash";
import { getAppEnv } from "@/lib/env";

/**
 * Configure Better Auth instance with explicit table mappings for Cloudflare D1.
 */
export const getAuth = (dbBinding: D1Database, requestOrigin?: string) => {
  const env = getAppEnv();
  const db = getDb(dbBinding);
  const isDemo = env.NEXT_PUBLIC_MOCK_MODE === "true" || requestOrigin?.includes("demo.saziate.com");
  const baseURL = requestOrigin || (isDemo ? "https://demo.saziate.com" : "https://app.saziate.com");
  const authSecret = env.BETTER_AUTH_SECRET || "saziate_prod_secret_2026";

  return betterAuth({
    logger: {
      level: "debug",
    },
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
      transaction: false, // REQUIRED FOR CLOUDFLARE D1
    }),
    secret: authSecret,
    emailAndPassword: {
      enabled: true,
      password: {
        hash: async (password: string) => await hashPassword(password),
        verify: async ({ password, hash }: any) => await verifyPassword(password, hash),
      },
    },
    user: {
      additionalFields: {
        role: { type: "string", required: false, defaultValue: "resident" },
        firstName: { type: "string", required: false },
        lastName: { type: "string", required: false },
        phone: { type: "string", required: false },
        pspId: { type: "string", required: false },
      }
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
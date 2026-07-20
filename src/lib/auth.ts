import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

const authSecret = process.env.BETTER_AUTH_SECRET || "mock_secret";

/**
 * Configure Better Auth instance with Drizzle ORM Adapter for SQLite.
 */
export const auth = (dbBinding: D1Database) => {
  const db = getDb(dbBinding);
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    secret: authSecret,
    emailAndPassword: {
      enabled: true,
    },
    trustedOrigins: ["http://localhost:3000", "https://saziate.pages.dev"],
    advanced: {
      crossSubDomainCookies: {
        enabled: true,
      },
      disableCSRFCheck: false,
    },
  });
};

import { createAuthClient } from "better-auth/react";

/**
 * Better Auth client configuration for front-end sessions.
 */
export const authClient = createAuthClient({
  baseURL: typeof window !== "undefined" ? window.location.origin : "http://localhost:3000",
});

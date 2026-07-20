import { auth } from "@/lib/auth";
import { config } from "@/lib/config";
import { MOCK_PSP_ID } from "./mockdata";

/**
 * Retrieve active session and verify associated tenant pspId.
 * Fallbacks to mock operator metadata when NEXT_PUBLIC_MOCK_MODE is enabled.
 */
export async function getActivePspId(req: Request, dbBinding: D1Database): Promise<string | null> {
  if (config.isMockMode) {
    return MOCK_PSP_ID;
  }

  try {
    const betterAuth = auth(dbBinding);
    const session = await betterAuth.api.getSession({
      headers: req.headers,
    });

    return (session?.user as any)?.pspId || null;
  } catch (err) {
    console.error("Session retrieval error:", err);
    return null;
  }
}

/**
 * Validates the session and ensures the user has one of the allowed roles.
 * Returns the session object if valid, otherwise throws an Error.
 */
export async function requireRole(req: Request, dbBinding: D1Database, allowedRoles: string[]) {
  if (config.isMockMode) {
    return { user: { role: allowedRoles[0], id: "mock_user", pspId: MOCK_PSP_ID } };
  }

  const betterAuth = auth(dbBinding);
  const session = await betterAuth.api.getSession({
    headers: req.headers,
  });

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  const userRole = (session.user as any).role as string;
  
  if (!allowedRoles.includes(userRole)) {
    throw new Error("Forbidden");
  }

  return session;
}

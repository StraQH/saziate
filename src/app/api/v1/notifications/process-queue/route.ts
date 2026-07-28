export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { processPendingRetries } from "@/lib/notifications";
import { config } from "@/lib/config";


export async function POST(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;

  try {
    const authHeader = req.headers.get("Authorization");
    if (!config.isMockMode) {
      if (!env.CRON_SECRET || authHeader !== `Bearer ${env.CRON_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
    }

    const termiiKey = env.TERMII_API_KEY;
    if (!termiiKey) {
      throw new Error("TERMII_API_KEY is required.");
    }
    await processPendingRetries(env.DB as any, termiiKey);

    return new Response(
      JSON.stringify({
        status: "success" as any,
        message: "Pending notification retry queue processed.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Process Queue Error:", error);
    console.error("[API Error]", error);
    if (error.message === "Unauthorized") {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    if (error.message === "Forbidden") {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
    }
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

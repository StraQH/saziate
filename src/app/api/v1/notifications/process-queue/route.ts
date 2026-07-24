import { getAppEnv } from "@/lib/env";
import { processPendingRetries } from "@/lib/notifications";
import { config } from "@/lib/config";


export async function POST(req: Request) {
  const env = getAppEnv() as any;

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
    await processPendingRetries(env.DB, termiiKey);

    return new Response(
      JSON.stringify({
        status: "success",
        message: "Pending notification retry queue processed.",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Process Queue Error:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
}

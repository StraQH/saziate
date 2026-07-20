import { processPendingRetries } from "@/lib/notifications";

export const runtime = "edge";

export async function POST(req: Request) {
  const env = process.env as any;

  try {
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
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}

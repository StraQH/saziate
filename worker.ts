/**
 * Custom Cloudflare Worker entry point that wraps the OpenNext handler
 * and adds a scheduled() export for Cron Triggers.
 *
 * Each cron expression is mapped to an internal Next.js API route.
 * The scheduled handler uses the worker's own fetch handler to dispatch
 * the request internally (no external HTTP round-trip).
 */

// @ts-ignore: .open-next/worker.js is generated at build time by opennextjs-cloudflare
import handler from "./.open-next/worker.js";

// Map cron expressions → internal API routes
const CRON_ROUTES: Record<string, string> = {
  "0 0 1 * *":   "/api/v1/cron/generate-invoices",
  "0 0 * * *":   "/api/v1/cron/process-payouts",
  "*/5 * * * *": "/api/v1/cron/dispatch-notifications",
};

export default {
  // Delegate all HTTP requests to the OpenNext handler
  fetch: handler.fetch,

  // Handle Cloudflare Cron Triggers
  async scheduled(event: ScheduledEvent, env: Record<string, unknown>, ctx: ExecutionContext) {
    const route = CRON_ROUTES[event.cron];
    if (!route) {
      console.error(`[CRON] No route mapped for cron expression: ${event.cron}`);
      return;
    }

    console.log(`[CRON] Firing ${event.cron} → ${route}`);

    // Build an internal request with the CRON_SECRET for authentication
    const cronSecret = (env.CRON_SECRET as string) || "";
    const headers: Record<string, string> = {
      "User-Agent": "Cloudflare-Cron/1.0",
    };
    if (cronSecret) {
      headers["Authorization"] = `Bearer ${cronSecret}`;
    }

    // Use the worker's own fetch handler to dispatch the request internally
    const request = new Request(`https://internal${route}`, {
      method: "GET",
      headers,
    });

    try {
      const response = await handler.fetch(request, env, ctx);
      const body = await response.text();
      console.log(`[CRON] ${route} responded ${response.status}: ${body.substring(0, 200)}`);
    } catch (err) {
      console.error(`[CRON] ${route} failed:`, err);
    }
  },
};

// Re-export any additional handlers (Durable Objects, etc.) from OpenNext if needed
// @ts-ignore
export { DOQueueHandler, DOShardedTagCache } from "./.open-next/worker.js";

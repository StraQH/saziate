// env.d.ts
import type { D1Database } from "@cloudflare/workers-types";

interface CloudflareEnv {
  DB: D1Database;
  NEXT_PUBLIC_APP_NAME?: string;
  NEXT_PUBLIC_MOCK_MODE?: string;
}
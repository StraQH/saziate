import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// This function is called inside a Cloudflare Workers request context
// where `env.DB` is the D1 binding injected by the Workers runtime.
export function getDb(d1?: D1Database) {
  if (!d1) throw new Error("Missing D1 Database Binding");
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;

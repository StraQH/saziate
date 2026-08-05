import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

// This function is called inside a Cloudflare Workers request context
// where `env.DB` is the D1 binding injected by the Workers runtime.
export function getDb(d1?: D1Database) {
  if (!d1) {
    // Return a dummy Drizzle instance that only throws when a query is executed.
    // This allows Mock Mode to bypass DB requirements without crashing API routes.
    const fakeD1 = new Proxy({}, {
      get(target, prop) {
        return () => {
          throw new Error(`Missing D1 Database Binding. Ensure you are running with Cloudflare Wrangler or OpenNext context. (Tried to execute D1.${String(prop)})`);
        };
      }
    }) as unknown as D1Database;
    return drizzle(fakeD1, { schema });
  }
  return drizzle(d1, { schema });
}

export type Db = ReturnType<typeof getDb>;

import { D1Database } from "@cloudflare/workers-types";
import { rateLimits } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

interface RateLimitOptions {
  max?: number;
  windowMs?: number;
}

export async function checkRateLimit(
  ip: string,
  d1: D1Database,
  keyPrefix: string = "default",
  options?: RateLimitOptions
): Promise<boolean> {
  const maxRequests = options?.max || 10;
  const windowMs = options?.windowMs || 60_000;
  
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  
  const db = drizzle(d1);
  
  // Try to get the existing limit
  const existing = await db
    .select()
    .from(rateLimits)
    .where(eq(rateLimits.key, key))
    .get();

  if (existing) {
    const isOutsideWindow = (now - existing.windowStart.getTime()) >= windowMs;
    
    if (isOutsideWindow) {
      // Reset window
      await db.update(rateLimits)
        .set({
          count: 1,
          windowStart: new Date(now)
        })
        .where(eq(rateLimits.key, key));
      return true;
    } else {
      // Inside window
      if (existing.count >= maxRequests) {
        return false;
      }
      
      // Increment
      await db.update(rateLimits)
        .set({
          count: sql`${rateLimits.count} + 1`
        })
        .where(eq(rateLimits.key, key));
      return true;
    }
  } else {
    // New key
    await db.insert(rateLimits)
      .values({
        key: key,
        count: 1,
        windowStart: new Date(now)
      });
    return true;
  }
}

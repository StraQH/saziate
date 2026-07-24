import { getCloudflareContext } from "@opennextjs/cloudflare";

export function getAppEnv() {
  let env: any = process.env;
  try {
    env = getCloudflareContext().env || process.env;
  } catch (e: any) {
    // Silently fallback for Next.js local development
  }
  return env;
}

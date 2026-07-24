import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();

config.edgeExternals = config.edgeExternals || [];
config.edgeExternals.push("@better-auth/core/instrumentation");

export default config;

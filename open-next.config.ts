import { defineCloudflareConfig } from "@opennextjs/cloudflare";

const config = defineCloudflareConfig();
if (config.cloudflare) {
  config.cloudflare.useWorkerdCondition = false;
}

export default config;

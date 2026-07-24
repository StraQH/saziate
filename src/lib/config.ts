import { getAppEnv } from "./env";

export const config = {
  get isMockMode(): boolean {
    const env = getAppEnv();
    if (typeof window !== "undefined") {
      return (
        window.location.hostname.includes("demo.") ||
        env.NEXT_PUBLIC_MOCK_MODE === "true"
      );
    }
    return env.NEXT_PUBLIC_MOCK_MODE === "true";
  },
};

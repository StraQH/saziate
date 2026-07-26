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

  // Financial Constants
  PLATFORM_FEE_RATE: 0.05,
  PLATFORM_FEE_DIVISOR: 1.05,
  DEFAULT_MONTHLY_RATE_NGN: 6000,
  AUTO_PAYOUT_MINIMUM_NGN: 1000,
  
  // Billing Constants
  INVOICE_DUE_DAYS: 7,
  ONDEMAND_DUE_DAYS: 3,

  // Default UI Configuration Values
  DEFAULT_COMMERCIAL_RATE_NGN: 15000,
  DEFAULT_INDUSTRIAL_RATE_NGN: 45000,
  DEFAULT_HEALTH_RATE_NGN: 30000,
  DEFAULT_MANUAL_PAYOUT_PROMPT_NGN: 10000,
};

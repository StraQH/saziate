import { getAppEnv } from "./env";

export const LOCALITIES = {
  NG: {
    code: "+234",
    currency: "NGN",
    symbol: "₦",
    locale: "en-NG",
    autoPayoutMinimum: 1000,
    rates: {
      general: { residential: 5000, commercial: 15000, industrial: 45000, health: 30000, manualPayoutPrompt: 10000 },
      waste: { residential: 6000, commercial: 15000, industrial: 45000, health: 30000, manualPayoutPrompt: 10000 },
      water: { residential: 10000, commercial: 25000, industrial: 80000, health: 50000, manualPayoutPrompt: 20000 },
      power: { residential: 20000, commercial: 50000, industrial: 150000, health: 100000, manualPayoutPrompt: 50000 },
    }
  },
  US: {
    code: "+1",
    currency: "USD",
    symbol: "$",
    locale: "en-US",
    autoPayoutMinimum: 50,
    rates: {
      general: { residential: 20, commercial: 100, industrial: 300, health: 200, manualPayoutPrompt: 100 },
      waste: { residential: 25, commercial: 120, industrial: 350, health: 250, manualPayoutPrompt: 150 },
      water: { residential: 40, commercial: 150, industrial: 400, health: 300, manualPayoutPrompt: 200 },
      power: { residential: 80, commercial: 250, industrial: 800, health: 600, manualPayoutPrompt: 500 },
    }
  }
};

export const ACTIVE_LOCALITY = "NG";

export function getDefaultRates(serviceType: string = "general", locality: string = ACTIVE_LOCALITY) {
  const loc = LOCALITIES[locality as keyof typeof LOCALITIES] || LOCALITIES[ACTIVE_LOCALITY];
  return loc.rates[serviceType as keyof typeof loc.rates] || loc.rates.general;
}

export function getLocality(locality: string = ACTIVE_LOCALITY) {
  return LOCALITIES[locality as keyof typeof LOCALITIES] || LOCALITIES[ACTIVE_LOCALITY];
}

export const config = {
  get isMockMode(): boolean {
    const env = getAppEnv() || {};
    if (typeof window !== "undefined") {
      return (
        window.location.hostname.includes("demo.") ||
        (!env.DB && window.location.hostname === "localhost") ||
        process.env.NEXT_PUBLIC_MOCK_MODE === "true" ||
        env.NEXT_PUBLIC_MOCK_MODE === "true"
      );
    }
    return (!env.DB && process.env.NODE_ENV === "development") || process.env.NEXT_PUBLIC_MOCK_MODE === "true" || env.NEXT_PUBLIC_MOCK_MODE === "true";
  },

  PLATFORM_FEE_RATE: 0.05,
  PLATFORM_FEE_DIVISOR: 1.05,
  INVOICE_DUE_DAYS: 7,
  ONDEMAND_DUE_DAYS: 3,
  defaultGateway: "paystack",

  get locality() {
    return getLocality(ACTIVE_LOCALITY);
  }
};

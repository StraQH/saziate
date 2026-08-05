export const dynamic = "force-dynamic";
import { getAppEnv } from "@/lib/env";
import { PaystackClient } from "@/lib/paystack";
import { config } from "@/lib/config";

const MOCK_BANKS = [
  { name: "Access Bank", code: "044" },
  { name: "Citibank Nigeria", code: "023" },
  { name: "Ecobank Nigeria", code: "050" },
  { name: "Fidelity Bank", code: "070" },
  { name: "First Bank of Nigeria", code: "011" },
  { name: "First City Monument Bank (FCMB)", code: "214" },
  { name: "Globus Bank", code: "00103" },
  { name: "Guaranty Trust Bank (GTBank)", code: "058" },
  { name: "Heritage Bank", code: "030" },
  { name: "Keystone Bank", code: "082" },
  { name: "Optimus Bank", code: "107" },
  { name: "Parallex Bank", code: "104" },
  { name: "PremiumTrust Bank", code: "105" },
  { name: "Providus Bank", code: "101" },
  { name: "Signature Bank", code: "106" },
  { name: "Stanbic IBTC Bank", code: "221" },
  { name: "Standard Chartered Bank", code: "068" },
  { name: "Sterling Bank", code: "232" },
  { name: "Suntrust Bank", code: "100" },
  { name: "Taj Bank", code: "302" },
  { name: "Titan Bank", code: "102" },
  { name: "Union Bank of Nigeria", code: "032" },
  { name: "United Bank for Africa (UBA)", code: "033" },
  { name: "Unity Bank", code: "215" },
  { name: "Wema Bank", code: "035" },
  { name: "Zenith Bank", code: "057" }
];

export async function GET(req: Request) {
  const env = getAppEnv() as Record<string, string | undefined>;

  if (config.isMockMode) {
    return new Response(JSON.stringify(MOCK_BANKS), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 1. Try Paystack Bank List
  if (env.PAYSTACK_SECRET_KEY) {
    try {
      const paystack = new PaystackClient(env.PAYSTACK_SECRET_KEY);
      const banks = await paystack.getBanks();
      const formatted = banks.map(b => ({ name: b.name, code: b.code }));
      return new Response(JSON.stringify(formatted), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("Failed to fetch banks from Paystack:", err);
      return new Response(JSON.stringify({ error: "Failed to fetch banks." }), { status: 502 });
    }
  }

  return new Response(JSON.stringify({ error: "Payment provider not configured." }), { status: 500 });
}

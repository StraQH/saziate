import { config } from "@/lib/config";

export interface InitializePaystackTransactionParams {
  amount: number; // in Naira (will be converted to kobo automatically)
  email: string;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
}

export interface CreatePaystackRecipientParams {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency?: string;
}

export interface InitiatePaystackTransferParams {
  amount: number; // in Naira (will be converted to kobo automatically)
  recipientCode: string;
  reference: string;
  reason?: string;
}

export class PaystackClient {
  private secretKey: string;
  private baseUrl: string = "https://api.paystack.co";

  constructor(secretKey: string) {
    if (!secretKey) {
      throw new Error("Paystack Secret Key is required.");
    }
    this.secretKey = secretKey;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = {
      Authorization: `Bearer ${this.secretKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = (await response.json()) as any;

    if (!response.ok || data.status === false) {
      throw new Error(data.message || `Paystack API error: ${response.statusText}`);
    }

    return data.data as T;
  }

  /**
   * Resolve NIBSS Bank Account Holder Name
   */
  async resolveBankAccount(accountNumber: string, bankCode: string): Promise<{ account_number: string; account_name: string; bank_id: number }> {
    return this.request<any>(`/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`);
  }

  /**
   * Get List of Commercial Banks
   */
  async getBanks(): Promise<{ name: string; code: string; active: boolean; country: string }[]> {
    return this.request<any>("/bank?country=nigeria");
  }

  /**
   * Create Paystack Customer
   */
  async createCustomer(email: string, firstName?: string, lastName?: string, phone?: string): Promise<{ customer_code: string; id: number; email: string }> {
    return this.request<any>("/customer", {
      method: "POST",
      body: JSON.stringify({
        email,
        first_name: firstName || "Valued",
        last_name: lastName || "Resident",
        phone: phone || undefined,
      }),
    });
  }



  /**
   * Initialize Paystack Transaction (Checkout Modal / Redirect)
   */
  async initializeTransaction(params: InitializePaystackTransactionParams): Promise<{ authorization_url: string; access_code: string; reference: string }> {
    const amountInKobo = Math.round(params.amount * 100);
    return this.request<any>("/transaction/initialize", {
      method: "POST",
      body: JSON.stringify({
        amount: amountInKobo,
        email: params.email,
        reference: params.reference,
        callback_url: params.callbackUrl,
        metadata: params.metadata,
      }),
    });
  }

  /**
   * Verify Paystack Transaction by Reference
   */
  async verifyTransaction(reference: string): Promise<any> {
    return this.request<any>(`/transaction/verify/${encodeURIComponent(reference)}`);
  }

  /**
   * Create Transfer Recipient for Operator Payouts
   */
  async createTransferRecipient(params: CreatePaystackRecipientParams): Promise<{ recipient_code: string; details: any }> {
    return this.request<any>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify({
        type: "nuban",
        name: params.name,
        account_number: params.accountNumber,
        bank_code: params.bankCode,
        currency: params.currency || config.locality.currency || "NGN",
      }),
    });
  }

  /**
   * Initiate Transfer (Payout to Operator Bank Account)
   */
  async initiateTransfer(params: InitiatePaystackTransferParams): Promise<{ transfer_code: string; status: string; reference: string }> {
    const amountInKobo = Math.round(params.amount * 100);
    return this.request<any>("/transfer", {
      method: "POST",
      body: JSON.stringify({
        source: "balance",
        amount: amountInKobo,
        recipient: params.recipientCode,
        reference: params.reference,
        reason: params.reason || "Saziate Net Payout Settlement",
      }),
    });
  }
}

/**
 * Verify Paystack Webhook Signature (HMAC SHA-512)
 */
export async function verifyPaystackSignature(signature: string | null, rawBody: string, secretKey: string): Promise<boolean> {
  if (!signature || !secretKey) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secretKey),
      { name: "HMAC", hash: "SHA-512" },
      false,
      ["verify", "sign"]
    );
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const hashHex = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex.toLowerCase() === signature.toLowerCase();
  } catch (err) {
    console.error("Paystack signature verification error:", err);
    return false;
  }
}

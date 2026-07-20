/**
 * Paystack API Client Helper for Saziate
 * Integrates Dedicated Virtual Accounts (DVA) and Transfer settlements.
 */

export interface CreateCustomerParams {
  email: string;
  first_name: string;
  last_name: string;
  phone: string;
}

export interface CreateDvaParams {
  customer: string; // Customer code (e.g. CUS_xn7bbgxw1g25881)
  preferred_bank?: string; // Preferred provider e.g. "wema-bank"
}

export interface InitiateTransferParams {
  source: "balance";
  amount: number; // in kobo (NGN * 100)
  recipient: string; // Transfer recipient code
  reason?: string;
}

export class PaystackClient {
  private secretKey: string;
  private baseUrl = "https://api.paystack.co";

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

    const data = await response.json() as any;

    if (!response.ok || !data.status) {
      throw new Error(data.message || `Paystack API error: ${response.statusText}`);
    }

    return data.data as T;
  }

  /**
   * Create a customer profile on Paystack.
   * Required before a DVA can be provisioned.
   */
  async createCustomer(params: CreateCustomerParams): Promise<{ customer_code: string; id: number }> {
    return this.request<{ customer_code: string; id: number }>("/customer", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * Create a Dedicated Virtual Account (DVA) for a customer.
   */
  async createDedicatedAccount(params: CreateDvaParams): Promise<{
    bank: { name: string; id: number };
    account_number: string;
    account_name: string;
  }> {
    return this.request<any>("/dedicated_account", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * Create a Transfer Recipient (PSP Settlement Account destination).
   */
  async createTransferRecipient(params: {
    type: "nuban";
    name: string;
    account_number: string;
    bank_code: string;
    currency: "NGN";
  }): Promise<{ recipient_code: string }> {
    return this.request<{ recipient_code: string }>("/transferrecipient", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * Initiate payout transfer to a PSP's account.
   */
  async initiateTransfer(params: InitiateTransferParams): Promise<{ reference: string; status: string; transfer_code: string }> {
    return this.request<any>("/transfer", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }


}

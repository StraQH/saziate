/**
 * Monnify API Client Helper for Saziate
 * Integrates Reserved Accounts (DVA), Checkout, and Disbursements.
 */

export interface CreateReservedAccountParams {
  accountReference: string;
  accountName: string;
  currencyCode: "NGN";
  contractCode: string;
  customerEmail: string;
  customerName: string;
  bvn?: string;
  getAllAvailableBanks?: boolean;
}

export interface InitializeTransactionParams {
  amount: number; // in NGN
  customerName: string;
  customerEmail: string;
  paymentReference: string;
  paymentDescription: string;
  currencyCode: "NGN";
  contractCode: string;
  redirectUrl: string;
  paymentMethods: string[]; // e.g. ["CARD", "ACCOUNT_TRANSFER"]
}

export interface SingleTransferParams {
  amount: number;
  reference: string;
  narration: string;
  destinationBankCode: string;
  destinationAccountNumber: string;
  currency: "NGN";
  sourceAccountNumber: string; // The Monnify wallet account number
}

export class MonnifyClient {
  private apiKey: string;
  private secretKey: string;
  private contractCode: string;
  private baseUrl: string;

  constructor(apiKey: string, secretKey: string, contractCode: string) {
    if (!apiKey || !secretKey || !contractCode) {
      throw new Error("Monnify API Key, Secret Key, and Contract Code are required.");
    }
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.contractCode = contractCode;
    // Use sandbox URL if api key starts with MK_TEST, else use live URL
    this.baseUrl = apiKey.startsWith("MK_TEST_") 
      ? "https://sandbox.monnify.com" 
      : "https://api.monnify.com";
  }

  /**
   * Authenticate and get a Bearer token
   */
  private async getAccessToken(): Promise<string> {
    const credentials = btoa(`${this.apiKey}:${this.secretKey}`);
    const response = await fetch(`${this.baseUrl}/api/v1/auth/login`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
    });

    const data = await response.json() as any;
    if (!response.ok || !data.requestSuccessful) {
      throw new Error(data.responseMessage || "Monnify authentication failed");
    }

    return data.responseBody.accessToken;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const token = await this.getAccessToken();
    const headers = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    };

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    const data = await response.json() as any;

    if (!response.ok || !data.requestSuccessful) {
      throw new Error(data.responseMessage || `Monnify API error: ${response.statusText}`);
    }

    return data.responseBody as T;
  }

  /**
   * Create a Reserved Account (Dedicated Virtual Account)
   */
  async createReservedAccount(params: Omit<CreateReservedAccountParams, "contractCode" | "currencyCode">): Promise<any> {
    return this.request<any>("/api/v2/bank-transfer/reserved-accounts", {
      method: "POST",
      body: JSON.stringify({
        ...params,
        contractCode: this.contractCode,
        currencyCode: "NGN",
      }),
    });
  }

  /**
   * Initialize a Transaction (Checkout link)
   */
  async initializeTransaction(params: Omit<InitializeTransactionParams, "contractCode" | "currencyCode">): Promise<{ checkoutUrl: string; transactionReference: string }> {
    return this.request<any>("/api/v1/merchant/transactions/init-transaction", {
      method: "POST",
      body: JSON.stringify({
        ...params,
        contractCode: this.contractCode,
        currencyCode: "NGN",
      }),
    });
  }

  /**
   * Initiate a single transfer (Payout)
   */
  async initiateTransfer(params: SingleTransferParams): Promise<any> {
    return this.request<any>("/api/v2/disbursements/single", {
      method: "POST",
      body: JSON.stringify(params),
    });
  }

  /**
   * Validate Bank Account
   */
  async validateBankAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
    return this.request<any>(`/api/v1/disbursements/account/validate?accountNumber=${accountNumber}&bankCode=${bankCode}`);
  }

  /**
   * Get all banks
   */
  async getBanks(): Promise<{ name: string; code: string; ussdTemplate: string; baseUssdCode: string; transferUssdTemplate: string }[]> {
    return this.request<any>("/api/v1/banks");
  }

  /**
   * Get Transaction Status
   */
  async getTransactionStatus(paymentReference: string): Promise<any> {
    return this.request<any>(`/api/v1/merchant/transactions/query?paymentReference=${encodeURIComponent(paymentReference)}`);
  }
}

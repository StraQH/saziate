/**
 * Termii SMS & WhatsApp Notification Helper Client
 */

export interface SendMessageParams {
  to: string; // Recipient phone number in standard format e.g. "2348021234567"
  sms: string; // The message body text
}

export class TermiiClient {
  private apiKey: string;
  private baseUrl = "https://api.ng.termii.com/api";
  private senderId = "Saziate"; // Configured Sender ID on Termii portal

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("Termii API Key is required.");
    }
    this.apiKey = apiKey;
  }

  private async request<T>(endpoint: string, payload: any): Promise<T> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        api_key: this.apiKey,
        ...payload,
      }),
    });

    const data = await response.json() as any;

    if (!response.ok) {
      throw new Error(data.message || `Termii API error: ${response.statusText}`);
    }

    return data as T;
  }

  /**
   * Send WhatsApp notification message.
   */
  async sendWhatsApp(params: SendMessageParams): Promise<{ message_id: string; status: string }> {
    return this.request<any>("/sms/send", {
      to: params.to,
      from: this.senderId,
      sms: params.sms,
      type: "whatsapp",
      channel: "whatsapp",
    });
  }

  /**
   * Fallback to direct SMS.
   */
  async sendSMS(params: SendMessageParams): Promise<{ message_id: string; status: string }> {
    return this.request<any>("/sms/send", {
      to: params.to,
      from: this.senderId,
      sms: params.sms,
      type: "plain",
      channel: "dnd", // DND route bypass for Nigerian operators
    });
  }
}

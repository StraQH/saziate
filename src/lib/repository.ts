import { config } from "@/lib/config";
import {
  MOCK_RESIDENTS,
  MOCK_ZONES,
  MOCK_INVOICES,
  MOCK_SERVICES,
  MOCK_organizations,
  type Resident,
  type Zone,
  type Invoice,
  type ServiceRun,
  type OnboardedOrg
} from "./mockdata";

/**
 * Data Repository Layer for Saziate.
 * Automatically directs calls to memory mock structures or external API endpoints.
 */
export class SaziateRepository {
  private orgId: string;

  constructor(orgId: string) {
    this.orgId = orgId;
  }

  /**
   * Retrieve residents
   */
  async getResidents(page: number = 1, limit: number = 50, search: string = ""): Promise<{ data: Resident[], totalPages: number, totalCount: number }> {
    if (config.isMockMode) {
      return { data: MOCK_RESIDENTS, totalPages: 1, totalCount: MOCK_RESIDENTS.length };
    }

    const response = await fetch(`/api/v1/residents?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch residents");
    }
    
    const result = await response.json() as unknown as { data: Resident[], totalPages: number, totalCount: number };
    return result; // Expected format: { data: [...], totalCount, totalPages, page, limit }
  }

  /**
   * Retrieve zones
   */
  async getZones(): Promise<Zone[]> {
    if (config.isMockMode) {
      return MOCK_ZONES;
    }

    const response = await fetch(`/api/v1/zones`);
    if (!response.ok) {
      throw new Error("Failed to fetch zones");
    }
    
    const result = await response.json() as unknown as Zone[];
    return result;
  }

  /**
   * Retrieve invoices
   */
  async getInvoices(page: number = 1, limit: number = 50, search: string = ""): Promise<{ data: Invoice[], totalPages: number, totalCount: number }> {
    if (config.isMockMode) {
      return { data: MOCK_INVOICES, totalPages: 1, totalCount: MOCK_INVOICES.length };
    }

    const response = await fetch(`/api/v1/org/invoices?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch invoices");
    }
    
    const result = await response.json() as unknown as { data: Invoice[], totalPages: number, totalCount: number };
    return result;
  }

  /**
   * Retrieve services logs
   */
  async getServices(page: number = 1, limit: number = 50, search: string = ""): Promise<{ data: ServiceRun[], totalPages: number, totalCount: number }> {
    if (config.isMockMode) {
      return { data: MOCK_SERVICES, totalPages: 1, totalCount: MOCK_SERVICES.length };
    }

    const response = await fetch(`/api/v1/org/services?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch services");
    }
    
    const result = await response.json() as unknown as { data: ServiceRun[], totalPages: number, totalCount: number };
    return result;
  }

  /**
   * Get dynamic summary metrics for dashboards
   * Requires a dedicated endpoint: /api/v1/org/metrics
   */
  async getMetrics(): Promise<{ label: string; value: string }[]> {
    if (config.isMockMode) {
      return [
        { label: "Revenue This Month", value: "₦1,240,000" },
        { label: "Settled Today",          value: "₦145,000" },
        { label: "Available Settlement",   value: "₦380,000" },
        { label: "Next Settlement Date",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
        { label: "Total Active Residents", value: "1,240" },
        { label: "Paid Invoices",          value: "245" },
        { label: "Unpaid Invoices",        value: "42" },
        { label: "Active Zones",          value: "14" },
      ];
    }

    const response = await fetch(`/api/v1/org/metrics`);
    if (!response.ok) {
      throw new Error("Failed to fetch metrics");
    }
    
    const result = await response.json() as unknown as { metrics: { label: string; value: string }[] };
    return result.metrics;
  }
}

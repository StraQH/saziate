import { config } from "@/lib/config";
import {
  MOCK_RESIDENTS,
  MOCK_ROUTES,
  MOCK_INVOICES,
  MOCK_COLLECTIONS,
  MOCK_PSPS,
  type Resident,
  type Route,
  type Invoice,
  type CollectionRun,
  type OnboardedPSP
} from "./mockdata";

/**
 * Data Repository Layer for Saziate.
 * Automatically routes calls to memory mock structures or external API endpoints.
 */
export class SaziateRepository {
  private pspId: string;

  constructor(pspId: string) {
    this.pspId = pspId;
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
   * Retrieve routes
   */
  async getRoutes(): Promise<Route[]> {
    if (config.isMockMode) {
      return MOCK_ROUTES;
    }

    const response = await fetch(`/api/v1/routes`);
    if (!response.ok) {
      throw new Error("Failed to fetch routes");
    }
    
    const result = await response.json() as unknown as Route[];
    return result;
  }

  /**
   * Retrieve invoices
   */
  async getInvoices(page: number = 1, limit: number = 50, search: string = ""): Promise<{ data: Invoice[], totalPages: number, totalCount: number }> {
    if (config.isMockMode) {
      return { data: MOCK_INVOICES, totalPages: 1, totalCount: MOCK_INVOICES.length };
    }

    const response = await fetch(`/api/v1/psp/invoices?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch invoices");
    }
    
    const result = await response.json() as unknown as { data: Invoice[], totalPages: number, totalCount: number };
    return result;
  }

  /**
   * Retrieve collections logs
   */
  async getCollections(page: number = 1, limit: number = 50, search: string = ""): Promise<{ data: CollectionRun[], totalPages: number, totalCount: number }> {
    if (config.isMockMode) {
      return { data: MOCK_COLLECTIONS, totalPages: 1, totalCount: MOCK_COLLECTIONS.length };
    }

    const response = await fetch(`/api/v1/psp/collections?page=${page}&limit=${limit}&search=${encodeURIComponent(search)}`);
    if (!response.ok) {
      throw new Error("Failed to fetch collections");
    }
    
    const result = await response.json() as unknown as { data: CollectionRun[], totalPages: number, totalCount: number };
    return result;
  }

  /**
   * Get dynamic summary metrics for dashboards
   * Requires a dedicated endpoint: /api/v1/psp/metrics
   */
  async getMetrics(): Promise<{ label: string; value: string }[]> {
    if (config.isMockMode) {
      return [
        { label: "Collections This Month", value: "₦1,240,000" },
        { label: "Settled Today",          value: "₦145,000" },
        { label: "Available Settlement",   value: "₦380,000" },
        { label: "Next Settlement Date",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) },
        { label: "Total Active Residents", value: "1,240" },
        { label: "Paid Invoices",          value: "245" },
        { label: "Unpaid Invoices",        value: "42" },
        { label: "Active Routes",          value: "14" },
      ];
    }

    const response = await fetch(`/api/v1/psp/metrics`);
    if (!response.ok) {
      throw new Error("Failed to fetch metrics");
    }
    
    const result = await response.json() as unknown as { metrics: { label: string; value: string }[] };
    return result.metrics;
  }
}

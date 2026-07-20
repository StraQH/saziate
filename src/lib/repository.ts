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
import { getDb } from "@/db";
import { residentProfiles, routes, invoices, collectionLogs, psps, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * Data Repository Layer for Saziate.
 * Automatically routes calls to memory mock structures or D1 database queries.
 */
export class SaziateRepository {
  private dbBinding?: D1Database;
  private pspId: string;

  constructor(pspId: string, dbBinding?: D1Database) {
    this.pspId = pspId;
    this.dbBinding = dbBinding;
  }

  private getDbInstance() {
    if (!this.dbBinding) {
      throw new Error("D1 Database binding is missing.");
    }
    return getDb(this.dbBinding);
  }

  /**
   * Retrieve residents
   */
  async getResidents(): Promise<Resident[]> {
    if (config.isMockMode) {
      return MOCK_RESIDENTS;
    }

    const db = this.getDbInstance();
    const results = await db
      .select({
        id: users.id,
        name: users.name,
        phone: users.phone,
        address: residentProfiles.address,
        billingCategory: residentProfiles.billingCategory,
        customMonthlyRate: residentProfiles.customMonthlyRate,
        referenceCode: residentProfiles.referenceCode,
      })
      .from(residentProfiles)
      .innerJoin(users, eq(residentProfiles.userId, users.id))
      .where(eq(users.pspId, this.pspId));

    return results.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone || "",
      address: r.address,
      route: "Lekki Res Zone A", // Mapped route
      billingCategory: r.billingCategory,
      baseRate: r.customMonthlyRate || 6000,
      isOverride: !!r.customMonthlyRate,
      referenceCode: r.referenceCode,
      status: "active",
    }));
  }

  /**
   * Retrieve routes
   */
  async getRoutes(): Promise<Route[]> {
    if (config.isMockMode) {
      return MOCK_ROUTES;
    }

    const db = this.getDbInstance();
    const results = await db
      .select()
      .from(routes)
      .where(eq(routes.pspId, this.pspId));

    return results.map((r: any) => ({
      id: r.id,
      name: r.name,
      description: r.description || "",
      assignedAgent: "Unassigned",
      rates: {
        residential: 6000,
        commercial: 15000,
        industrial: 45000,
        health: 30000,
      },
    }));
  }

  /**
   * Retrieve invoices
   */
  async getInvoices(): Promise<Invoice[]> {
    if (config.isMockMode) {
      return MOCK_INVOICES;
    }

    const db = this.getDbInstance();
    const results = await db
      .select({
        id: invoices.id,
        residentName: users.name,
        referenceCode: residentProfiles.referenceCode,
        baseAmount: invoices.baseAmount,
        platformFee: invoices.platformFee,
        totalAmount: invoices.totalAmount,
        dueDate: invoices.dueDate,
        status: invoices.status,
        billingPeriodStart: invoices.billingPeriodStart,
      })
      .from(invoices)
      .innerJoin(users, eq(invoices.residentId, users.id))
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .where(eq(invoices.pspId, this.pspId));

    return results.map((inv: any) => ({
      id: inv.id,
      residentName: inv.residentName,
      referenceCode: inv.referenceCode,
      baseAmount: inv.baseAmount,
      platformFee: inv.platformFee,
      totalAmount: inv.totalAmount,
      dueDate: new Date(inv.dueDate).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }),
      status: inv.status,
      billingPeriod: new Date(inv.billingPeriodStart).toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
    }));
  }

  /**
   * Retrieve collections logs
   */
  async getCollections(): Promise<CollectionRun[]> {
    if (config.isMockMode) {
      return MOCK_COLLECTIONS;
    }

    const db = this.getDbInstance();
    const results = await db
      .select({
        id: collectionLogs.id,
        residentName: users.name,
        address: residentProfiles.address,
        status: collectionLogs.status,
        loggedAt: collectionLogs.loggedAt,
      })
      .from(collectionLogs)
      .innerJoin(users, eq(collectionLogs.residentId, users.id))
      .innerJoin(residentProfiles, eq(users.id, residentProfiles.userId))
      .innerJoin(routes, eq(collectionLogs.routeId, routes.id))
      .where(eq(routes.pspId, this.pspId));

    return results.map((c: any) => ({
      id: c.id,
      residentName: c.residentName,
      address: c.address,
      route: "Lekki Res Zone A",
      status: c.status === "collected" ? "collected" : c.status === "no_waste" ? "no_waste" : c.status === "no_access" ? "no_access" : "pending",
      loggedBy: "Field Agent",
      loggedAt: new Date(c.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today",
    }));
  }

  /**
   * Get dynamic summary metrics for dashboards
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

    const db = this.getDbInstance();
    
    // Total payments received (count of paid invoices)
    const paidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.pspId, this.pspId), eq(invoices.status, "paid")));

    // Sum total paid amount
    const paidSums = await db
      .select({ total: invoices.totalAmount })
      .from(invoices)
      .where(and(eq(invoices.pspId, this.pspId), eq(invoices.status, "paid")));
      
    // Count unpaid invoices
    const unpaidInvoices = await db
      .select({ count: invoices.id })
      .from(invoices)
      .where(and(eq(invoices.pspId, this.pspId), eq(invoices.status, "pending")));

    // Count residents for this PSP
    const residentUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.pspId, this.pspId), eq(users.role, "resident")));
      
    // Count routes for this PSP
    const pspRoutes = await db
      .select({ id: routes.id })
      .from(routes)
      .where(eq(routes.pspId, this.pspId));

    const totalPaidSum = paidSums.reduce((sum: number, inv: any) => sum + inv.total, 0);

    return [
      { label: "Collections This Month", value: `₦${totalPaidSum.toLocaleString("en-NG")}` },
      { label: "Settled Today",          value: "₦0" },
      { label: "Available Settlement",   value: `₦${(totalPaidSum * 0.95).toLocaleString("en-NG")}` }, // Less Saziate 5% commission
      { label: "Next Settlement Date",   value: new Date(Date.now() + 86400000).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) }, // T+1
      { label: "Total Active Residents", value: residentUsers.length.toLocaleString() },
      { label: "Paid Invoices",          value: paidInvoices.length.toLocaleString() },
      { label: "Unpaid Invoices",        value: unpaidInvoices.length.toLocaleString() },
      { label: "Active Routes",          value: pspRoutes.length.toLocaleString() },
    ];
  }
}

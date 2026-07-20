// Mock data configurations for Saziate Operator Dashboards

export interface Resident {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  route: string;
  billingCategory: "residential" | "commercial" | "industrial" | "health";
  baseRate: number;
  isOverride: boolean;
  referenceCode: string;
  status: "active" | "suspended";
}

export interface Route {
  id: string;
  name: string;
  description: string;
  collectionSchedule: string;
  assignedAgent: string;
  rates: {
    residential: number;
    commercial: number;
    industrial: number;
    health: number;
  };
}

export interface Invoice {
  id: string;
  residentName: string;
  referenceCode: string;
  baseAmount: number;
  platformFee: number;
  totalAmount: number;
  dueDate: string;
  status: "pending" | "paid" | "overdue" | "cancelled";
  billingPeriod: string;
}

export interface CollectionRun {
  id: string;
  residentName: string;
  address: string;
  route: string;
  status: "collected" | "no_access" | "no_waste" | "pending";
  loggedBy: string;
  loggedAt: string | null;
}

export interface OnboardedPSP {
  id: string;
  name: string;
  rcNumber: string;
  contactEmail: string;
  totalSettlementVolume: number;
  status: "verified" | "pending_verification";
}

export const MOCK_RESIDENTS: Resident[] = [
  {
    id: "r1",
    name: "Babajide Sanwo",
    email: "resident@example.com",
    phone: "+2348021111111",
    address: "14 Admiralty Way, Lekki Phase 1",
    route: "Lekki Res Zone A",
    billingCategory: "residential",
    baseRate: 6000,
    isOverride: false,
    referenceCode: "SZ-LEK-001",
    status: "active",
  },
  {
    id: "r2",
    name: "Funke Akindele",
    email: "funke@example.com",
    phone: "+2348022222222",
    address: "8 Fola Osibo St, Lekki Phase 1",
    route: "Lekki Comm Zone B",
    billingCategory: "residential",
    baseRate: 7500,
    isOverride: true,
    referenceCode: "SZ-LEK-002",
    status: "active",
  },
  {
    id: "r3",
    name: "St. Nicholas Clinic",
    email: "admin@stnicholas.com",
    phone: "+2348024444444",
    address: "Plot 10, Onikepo Akande St",
    route: "Lekki Res Zone C",
    billingCategory: "health",
    baseRate: 30000,
    isOverride: false,
    referenceCode: "SZ-LEK-003",
    status: "suspended",
  },
];

export const MOCK_ROUTES: Route[] = [
  {
    id: "rt1",
    name: "Lekki Res Zone A",
    description: "Covers Admiralty Way, Fola Osibo, and block clusters A-F",
    collectionSchedule: "Mondays & Thursdays",
    assignedAgent: "Field Agent Johnson",
    rates: {
      residential: 6000,
      commercial: 15000,
      industrial: 45000,
      health: 30000,
    },
  },
  {
    id: "rt2",
    name: "Lekki Comm Zone B",
    description: "Commercial establishments along main expressway corridors",
    collectionSchedule: "Tuesdays & Fridays",
    assignedAgent: "Field Agent Musa",
    rates: {
      residential: 7500,
      commercial: 25000,
      industrial: 60000,
      health: 40000,
    },
  },
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "inv1",
    residentName: "Babajide Sanwo",
    referenceCode: "SZ-LEK-001",
    baseAmount: 6000,
    platformFee: 300,
    totalAmount: 6300,
    dueDate: "28 Jul 2026",
    status: "pending",
    billingPeriod: "July 2026",
  },
  {
    id: "inv2",
    residentName: "Funke Akindele",
    referenceCode: "SZ-LEK-002",
    baseAmount: 7500,
    platformFee: 375,
    totalAmount: 7875,
    dueDate: "28 Jul 2026",
    status: "paid",
    billingPeriod: "July 2026",
  },
  {
    id: "inv3",
    residentName: "St. Nicholas Clinic",
    referenceCode: "SZ-LEK-003",
    baseAmount: 30000,
    platformFee: 1500,
    totalAmount: 31500,
    dueDate: "28 Jun 2026",
    status: "overdue",
    billingPeriod: "June 2026",
  },
];

export const MOCK_COLLECTIONS: CollectionRun[] = [
  {
    id: "col1",
    residentName: "Babajide Sanwo",
    address: "14 Admiralty Way, Lekki Phase 1",
    route: "Lekki Res Zone A",
    status: "collected",
    loggedBy: "Field Agent Johnson",
    loggedAt: "08:14 AM Today",
  },
  {
    id: "col2",
    residentName: "Funke Akindele",
    address: "8 Fola Osibo St, Lekki Phase 1",
    route: "Lekki Comm Zone B",
    status: "no_waste",
    loggedBy: "Field Agent Musa",
    loggedAt: "10:30 AM Today",
  },
  {
    id: "col3",
    residentName: "St. Nicholas Clinic",
    address: "Plot 10, Onikepo Akande St",
    route: "Lekki Res Zone C",
    status: "pending",
    loggedBy: "Unassigned",
    loggedAt: null,
  },
];

export const MOCK_PSPS: OnboardedPSP[] = [
  {
    id: "psp1",
    name: "Lekki Green Cleaners Ltd",
    rcNumber: "RC-1029384",
    contactEmail: "ops@lekkigreenclean.com",
    totalSettlementVolume: 1240000,
    status: "verified",
  },
  {
    id: "psp2",
    name: "Ikoyi Waste Solutions",
    rcNumber: "RC-9830291",
    contactEmail: "solutions@ikoyiwaste.org",
    totalSettlementVolume: 0,
    status: "pending_verification",
  },
];

export const MOCK_PSP_ID = "psp_lekki_green";
export const MOCK_AGENT_ID = "agent_lekki_1";
export const MOCK_ROUTE_ID = "route_lekki_1";
export const MOCK_PSP_NAME = "Lekki Green Cleaners Ltd";
export const MOCK_PSP_EMAIL = "ops@lekkigreenclean.com";
export const MOCK_ROUTE_NAME = "Lekki Res Zone A";
export const MOCK_WARD = "Lekki Ward A";
export const MOCK_LGA = "Eti-Osa";

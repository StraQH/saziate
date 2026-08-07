// Mock data configurations for Saziate Operator Dashboards

export interface Resident {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  zone: string;
  billingCategory: "residential" | "commercial" | "industrial" | "health";
  propertyType?: string;
  baseRate: number;
  isOverride: boolean;
  referenceCode: string;
  status: "active" | "suspended";
}

export interface Zone {
  id: string;
  name: string;
  description: string;
  serviceSchedule: string;
  assignedAgent: string;
  assignedAgentName?: string;
  assignedAgentId?: string;
  rates: Array<{
    category: "commercial" | "residential" | "industrial" | "health";
    monthlyRate: number;
  }>;
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

export interface ServiceRun {
  id: string;
  residentName: string;
  address: string;
  zone: string;
  status: "completed" | "no_access" | "no_service" | "pending";
  loggedBy: string;
  loggedAt: string | null;
}

export interface OnboardedOrg {
  serviceType?: string;
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
    name: "John Doe",
    email: "resident@example.com",
    phone: "+2348021111111",
    address: "123 Main St, Metropolis",
    zone: "North Residential Zone",
    billingCategory: "residential",
    baseRate: 6000,
    isOverride: false,
    referenceCode: "SZDEMO001",
    status: "active",
  },
  {
    id: "r2",
    name: "Jane Smith",
    email: "jane@example.com",
    phone: "+2348022222222",
    address: "456 Market St, Metropolis",
    zone: "East Commercial Zone",
    billingCategory: "residential",
    baseRate: 7500,
    isOverride: true,
    referenceCode: "SZDEMO002",
    status: "active",
  },
  {
    id: "r3",
    name: "St. Nicholas Clinic",
    email: "admin@stnicholas.com",
    phone: "+2348024444444",
    address: "Plot 10, Demo Industrial Area",
    zone: "West Residential Zone",
    billingCategory: "health",
    baseRate: 30000,
    isOverride: false,
    referenceCode: "SZDEMO003",
    status: "suspended",
  },
];

export const MOCK_ZONES: Zone[] = [
  {
    id: "rt1",
    name: "North Residential Zone",
    description: "Covers primary residential clusters A–F",
    serviceSchedule: "",
    assignedAgent: "Field Agent Johnson",
    rates: [
      { category: "residential", monthlyRate: 6000 },
      { category: "commercial", monthlyRate: 15000 },
      { category: "industrial", monthlyRate: 45000 },
      { category: "health", monthlyRate: 30000 },
    ],
  },
  {
    id: "rt2",
    name: "East Commercial Zone",
    description: "Commercial establishments along main expressway corridors",
    serviceSchedule: "",
    assignedAgent: "Field Agent Musa",
    rates: [
      { category: "residential", monthlyRate: 7500 },
      { category: "commercial", monthlyRate: 25000 },
      { category: "industrial", monthlyRate: 60000 },
      { category: "health", monthlyRate: 40000 },
    ],
  },
];

export const MOCK_INVOICES: Invoice[] = [
  {
    id: "inv1",
    residentName: "John Doe",
    referenceCode: "SZDEMO001",
    baseAmount: 6000,
    platformFee: 300,
    totalAmount: 6300,
    dueDate: "28 Jul 2026",
    status: "pending",
    billingPeriod: "July 2026",
  },
  {
    id: "inv2",
    residentName: "Jane Smith",
    referenceCode: "SZDEMO002",
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
    referenceCode: "SZDEMO003",
    baseAmount: 30000,
    platformFee: 1500,
    totalAmount: 31500,
    dueDate: "28 Jun 2026",
    status: "overdue",
    billingPeriod: "June 2026",
  },
];

export const MOCK_SERVICES: ServiceRun[] = [
  {
    id: "col1",
    residentName: "John Doe",
    address: "123 Main St, Metropolis",
    zone: "North Residential Zone",
    status: "completed",
    loggedBy: "Field Agent Johnson",
    loggedAt: "08:14 AM Today",
  },
  {
    id: "col2",
    residentName: "Jane Smith",
    address: "456 Market St, Metropolis",
    zone: "East Commercial Zone",
    status: "no_service",
    loggedBy: "Field Agent Musa",
    loggedAt: "10:30 AM Today",
  },
  {
    id: "col3",
    residentName: "St. Nicholas Clinic",
    address: "Plot 10, Demo Industrial Area",
    zone: "West Residential Zone",
    status: "pending",
    loggedBy: "Unassigned",
    loggedAt: null,
  },
];

export const MOCK_organizations: OnboardedOrg[] = [
  {
    id: "org_demo_1",
    name: "Metro Waste Management",
    rcNumber: "RC-1029384",
    contactEmail: "ops@metro-waste.com",
    totalSettlementVolume: 1240000,
    status: "verified",
  },
  {
    id: "org_demo_2",
    name: "Demo Waste Solutions",
    rcNumber: "RC-9830291",
    contactEmail: "solutions@demo-waste.org",
    totalSettlementVolume: 0,
    status: "pending_verification",
  },
];

export const MOCK_ORG_ID = "org_demo_1";
export const MOCK_AGENT_ID = "agent_demo_1";
export const MOCK_ZONE_ID = "zone_demo_1";
export const MOCK_ORG_NAME = "Metro Waste Management";
export const MOCK_ORG_EMAIL = "ops@metro-waste.com";
export const MOCK_ZONE_NAME = "North Residential Zone";
export const MOCK_WARD = "District 1";
export const MOCK_LGA = "Area 1";

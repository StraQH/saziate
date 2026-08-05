"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import {
  CreditCard,
  Calendar,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Wallet,
  Building2,
  Clock,
  History
} from "lucide-react";
import Link from "next/link";
import { TopUpModal } from "@/components/resident/TopUpModal";

interface DashboardData {
  residentName: string;
  residentEmail?: string;
  orgInfo: {
    name: string;
    serviceType: string;
  };
  currentInvoice: {
    id: string;
    paymentReference?: string;
    baseAmount: number;
    platformFee: number;
    totalAmount: number;
    dueDate: string;
    status: string;
    billingPeriod: string;
  } | null;
  nextService: {
    date: string;
    status: string;
    zone: string;
  };
  advancePaymentBalance: number;
  totalOutstandingBalance?: number;
  whoIOwe: {
    orgName: string;
    serviceType: string;
    amount: number;
    invoiceIds: string[];
  }[];
  serviceHistory: {
    id: string;
    status: string;
    date: string;
    agentName: string;
    orgName: string;
    serviceType: string;
  }[];
}

export default function ResidentDashboard() {
  const { toast } = useToast();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTopUp, setShowTopUp] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resident/dashboard");
      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (res.ok) {
        const body = await res.json() as any as DashboardData;
        setData(body);
      }
    } catch (err) {
      console.error("Failed to load dashboard data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="card flex items-center justify-center" style={{ padding: "8rem" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card text-center" style={{ padding: "4rem" }}>
        <p className="text-muted">Failed to load dashboard parameters.</p>
        <button className="btn btn-primary" onClick={fetchDashboardData} style={{ marginTop: "1rem" }}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Greeting Card */}
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Welcome, {data.residentName}</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track your utility services, view provider bills, and manage payments seamlessly.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchDashboardData}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {showTopUp && (
        <TopUpModal 
          onClose={() => setShowTopUp(false)}
          onSuccess={(mockUrl) => {
            setShowTopUp(false);
            if (mockUrl) {
              toast(`Simulated Top-Up Success! Redirect: ${mockUrl}`, "success");
            } else {
              toast("Top-Up Successful!", "success");
            }
            fetchDashboardData();
          }}
        />
      )}

      {/* Email Alert reminder for onboarding fallback */}
      {data.residentEmail && data.residentEmail.endsWith("@saziate.com") && (
        <div style={{ background: "rgba(245, 158, 11, 0.1)", border: "1px solid var(--color-warning)", padding: "1.25rem", borderRadius: "var(--radius-lg)", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ background: "var(--color-bg)", padding: "0.5rem", borderRadius: "50%", color: "var(--color-warning)" }}>
              <AlertCircle size={20} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--color-warning-dark)" }}>Configure Your Email Address</p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-warning)", marginTop: "0.25rem" }}>You are currently using your phone number for login. Please update your profile with a valid email to receive digital invoices and payment receipts.</p>
            </div>
          </div>
          <Link href="/resident/profile" className="btn btn-warning btn-sm" style={{ backgroundColor: "var(--color-warning)", color: "white" }}>
            Add Email
          </Link>
        </div>
      )}

      {/* Wallet Balance Hero Card */}
      <div style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary)", padding: "1.5rem", borderRadius: "var(--radius-lg)", marginBottom: "2rem", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "1rem", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div style={{ background: "var(--color-bg)", padding: "0.75rem", borderRadius: "50%", color: "var(--color-primary)" }}>
            <Wallet size={24} />
          </div>
          <div>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-primary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Saziate Wallet Balance</p>
            <h2 style={{ margin: "0.25rem 0 0 0", fontSize: "2rem", fontWeight: 700, color: "var(--color-primary-dark)" }}>
              {formatCurrency(data.advancePaymentBalance || 0)}
            </h2>
            <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-primary)", marginTop: "0.25rem" }}>
              Funds here will automatically cover your upcoming monthly utility bills.
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowTopUp(true)}>
          <CreditCard size={18} style={{ marginRight: "0.5rem" }} />
          Top-Up Wallet
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        
        {/* What I Owe & Who I Owe Card */}
        <div className="card flex flex-col justify-between" style={{ padding: "1.5rem" }}>
          <div>
            <div className="flex justify-between items-start" style={{ marginBottom: "1rem" }}>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <DollarSign size={20} className="text-gray-500" />
                What I Owe
              </h3>
              {data.whoIOwe && data.whoIOwe.length > 0 ? (
                <Badge variant={data.currentInvoice?.status === "pending" ? "warning" : "danger"}>
                  {data.whoIOwe.length} PENDING BILLS
                </Badge>
              ) : (
                <Badge variant="success">ALL SETTLED</Badge>
              )}
            </div>
            
            {data.whoIOwe && data.whoIOwe.length > 0 ? (
              <div>
                <h2 style={{ fontSize: "2.5rem", fontWeight: 700, margin: "0.5rem 0", color: "var(--color-text)" }}>
                  {formatCurrency(data.totalOutstandingBalance || 0)}
                </h2>
                
                <div className="mt-6 mb-2">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Who I Owe (Providers)</h4>
                  <div className="space-y-3">
                    {data.whoIOwe.map((provider, idx) => (
                      <div key={idx} className="flex justify-between items-center p-3 rounded-md bg-gray-50 border border-gray-100">
                        <div className="flex flex-col">
                          <span className="font-semibold text-gray-800 text-sm">{provider.orgName}</span>
                          <span className="text-xs text-gray-500 capitalize">{provider.serviceType} Service</span>
                        </div>
                        <span className="font-bold text-gray-900">{formatCurrency(provider.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ padding: "2.5rem 0", textAlign: "center" }}>
                <div className="inline-flex justify-center items-center w-16 h-16 rounded-full bg-green-50 text-green-500 mb-4">
                  <CheckCircle2 size={32} />
                </div>
                <h4 className="font-semibold text-gray-800 mb-1">No Outstanding Bills</h4>
                <p className="text-muted text-sm">All your utility providers are currently settled. Thank you!</p>
              </div>
            )}
          </div>
          
          <div className="divider" style={{ margin: "1.25rem 0" }} />
          <div className="flex gap-3">
            <Link href="/resident/invoices" className="btn btn-secondary flex-1 justify-center">
              <span>View All Invoices</span>
            </Link>
            {data.whoIOwe && data.whoIOwe.length > 0 && (
              <button className="btn btn-primary flex-1 justify-center" onClick={() => setShowTopUp(true)}>
                <span>Pay Total Balance</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* Services Rendered Feed Card */}
          <div className="card" style={{ padding: "1.5rem" }}>
            <div className="flex justify-between items-start" style={{ marginBottom: "1rem" }}>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                <History size={20} className="text-gray-500" />
                Recent Services
              </h3>
              <Badge variant="neutral">{data.nextService.status}</Badge>
            </div>
            
            <p className="text-xs text-muted" style={{ marginBottom: "1rem" }}>
              Your upcoming scheduled service is: <strong>{data.nextService.date}</strong> in <strong>{data.nextService.zone}</strong>.
            </p>
            
            {data.serviceHistory && data.serviceHistory.length > 0 ? (
              <div className="space-y-4 mt-2">
                {data.serviceHistory.map((log) => (
                  <div key={log.id} className="flex gap-3 border-l-2 border-primary pl-3 py-1">
                    <div className="flex flex-col flex-1">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-sm text-gray-800 capitalize">{log.serviceType} Service</span>
                        <span className="text-xs text-gray-500 flex items-center gap-1"><Clock size={12}/> {log.date}</span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-500 truncate max-w-[150px]">{log.orgName}</span>
                        <Badge variant={log.status === 'completed' ? 'success' : 'warning'}>{log.status}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center text-gray-400">
                <p className="text-sm">No recent service activity.</p>
              </div>
            )}
            
            <div className="divider" style={{ margin: "1.25rem 0" }} />
            <Link href="/resident/services" className="btn btn-ghost w-full justify-center text-xs">
              <span>View Full History</span>
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}

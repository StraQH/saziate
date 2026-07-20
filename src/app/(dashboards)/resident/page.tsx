"use client";

import { useState, useEffect } from "react";
import { formatNaira } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import {
  CreditCard,
  Calendar,
  AlertCircle,
  Copy,
  CheckCircle2,
  DollarSign,
  ArrowRight,
  RefreshCw,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { DVAInfoCard } from "@/components/resident/DVAInfoCard";
import { TopUpModal } from "@/components/resident/TopUpModal";

interface DashboardData {
  residentName: string;
  pspInfo: {
    name: string;
    dvaBankName: string;
    dvaAccountNumber: string;
    dvaAccountName: string;
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
  nextCollection: {
    date: string;
    status: string;
    route: string;
  };
  advancePaymentBalance: number;
}

export default function ResidentDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [showTopUp, setShowTopUp] = useState(false);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resident/dashboard");
      if (res.ok) {
        const body = await res.json() as DashboardData;
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

  const handleCopy = () => {
    if (!data?.pspInfo.dvaAccountNumber) return;
    navigator.clipboard.writeText(data.pspInfo.dvaAccountNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

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
            Track your waste collections and settle bills instantly via your dedicated virtual account.
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
              alert(`Simulated Top-Up Success! Paystack Redirect: ${mockUrl}`);
            } else {
              alert("Top-Up Successful!");
            }
            fetchDashboardData();
          }}
        />
      )}

      {/* Advance Balance Alert */}
      {(data.advancePaymentBalance || 0) > 0 && (
        <div style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary)", padding: "1rem", borderRadius: "var(--radius-lg)", marginBottom: "2rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <div style={{ background: "var(--color-bg)", padding: "0.5rem", borderRadius: "50%", color: "var(--color-primary)" }}>
              <Wallet size={20} />
            </div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, color: "var(--color-primary-dark)" }}>Advance Payment Balance: {formatNaira(data.advancePaymentBalance)}</p>
              <p style={{ margin: 0, fontSize: "0.875rem", color: "var(--color-primary)", marginTop: "0.25rem" }}>This will automatically cover your upcoming monthly bills.</p>
            </div>
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowTopUp(true)}>Top-Up More</button>
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "1.5rem", marginBottom: "2rem" }}>
        
        {/* Bill Payment Card */}
        <div className="card flex flex-col justify-between" style={{ padding: "1.5rem" }}>
          <div>
            <div className="flex justify-between items-start" style={{ marginBottom: "1rem" }}>
              <h3 className="font-semibold text-lg">Current Invoice</h3>
              {data.currentInvoice ? (
                <Badge variant={data.currentInvoice.status === "pending" ? "warning" : "danger"}>
                  {data.currentInvoice.status.toUpperCase()}
                </Badge>
              ) : (
                <Badge variant="success">PAID</Badge>
              )}
            </div>
            {data.currentInvoice ? (
              <div>
                <p className="text-muted text-xs">Period: {data.currentInvoice.billingPeriod}</p>
                <h2 style={{ fontSize: "2rem", fontWeight: 700, margin: "0.5rem 0", color: "var(--color-text)" }}>
                  {formatNaira(data.currentInvoice.totalAmount)}
                </h2>
                <div className="flex items-center gap-1.5 text-xs text-muted">
                  <Calendar size={14} />
                  <span>Due on {data.currentInvoice.dueDate}</span>
                </div>
              </div>
            ) : (
              <div style={{ padding: "1.5rem 0" }}>
                <p className="text-muted text-sm">All bills are currently settled. Thank you!</p>
              </div>
            )}
          </div>
          <div className="divider" style={{ margin: "1.25rem 0" }} />
          <div className="flex gap-3">
            <Link href="/resident/invoices" className="btn btn-primary flex-1 justify-center">
              <span>View Invoices</span>
            </Link>
            <button className="btn btn-secondary flex-1 justify-center" onClick={() => setShowTopUp(true)}>
              <span>Top-Up</span>
            </button>
          </div>
        </div>

        {/* virtual Bank account copy panel */}
        <DVAInfoCard 
          bankName={data.pspInfo.dvaBankName}
          accountNumber={data.pspInfo.dvaAccountNumber}
          accountName={data.pspInfo.dvaAccountName}
          paymentReference={data.currentInvoice?.paymentReference}
        />

        {/* Next Scheduled Pickup */}
        <div className="card flex flex-col justify-between" style={{ padding: "1.5rem" }}>
          <div>
            <div className="flex justify-between items-start" style={{ marginBottom: "1rem" }}>
              <h3 className="font-semibold text-lg">Next Collection</h3>
              <Badge variant="neutral">{data.nextCollection.status}</Badge>
            </div>
            <p className="text-xs text-muted" style={{ marginBottom: "0.75rem" }}>
              Ensure your waste bins are positioned correctly at the curb before scheduled pickup times.
            </p>
            <div className="flex items-center gap-3" style={{ padding: "1.5rem 0" }}>
              <div style={{ background: "var(--color-primary-bg)", padding: "0.75rem", borderRadius: "50%", color: "var(--color-primary)" }}>
                <Calendar size={24} />
              </div>
              <div>
                <p className="font-bold text-lg">{data.nextCollection.date}</p>
                <p className="text-xs text-muted">Route: {data.nextCollection.route}</p>
              </div>
            </div>
          </div>
          <div className="divider" style={{ margin: "0.5rem 0" }} />
          <Link href="/resident/collections" className="btn btn-ghost w-full justify-center text-xs">
            <span>View Collection History</span>
            <ArrowRight size={14} />
          </Link>
        </div>

      </div>
    </div>
  );
}

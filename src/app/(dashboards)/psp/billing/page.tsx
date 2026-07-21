"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatNaira } from "@/lib/utils";
import { FileText, Download, Check, AlertCircle, DollarSign, RefreshCw, Wallet } from "lucide-react";

import { MOCK_INVOICES, type Invoice, MOCK_PSP_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";
import { AdvancePaymentModal } from "@/components/psp/AdvancePaymentModal";

export default function PSPBillingPage() {
  const { user } = useSession();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingCash, setPendingCash] = useState<any[]>([]);
  const [notificationCosts, setNotificationCosts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);

  const fetchInvoices = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    const data = await repo.getInvoices();
    setInvoices(data);

    if (config.isMockMode) {
      setNotificationCosts(480.00); // Mock cost
      setPendingCash([]);
    } else {
      try {
        const [resCosts, resCash] = await Promise.all([
          fetch("/api/v1/psp/notification-costs"),
          fetch("/api/v1/psp/cash-verify")
        ]);
        if (resCosts.ok) {
          const costData = await resCosts.json() as any;
          setNotificationCosts(costData.totalCost || 0);
        }
        if (resCash.ok) {
          const cashData = await resCash.json();
          setPendingCash(cashData as any);
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    }
    setLoading(false);
  };

  const handleVerifyCash = async (transactionId: string) => {
    if (config.isMockMode) {
      alert("Cash verified in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/psp/cash-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      if (res.ok) {
        alert("Cash payment verified successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        alert(`Failed to verify cash: ${text}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReconcile = async (invoiceId: string) => {
    if (config.isMockMode) {
      alert("Reconcile simulated in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (res.ok) {
        alert("Payment reconciled successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        alert(`Failed to reconcile: ${text}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = async (invoiceId: string) => {
    if (config.isMockMode) {
      alert("Cancellation simulated in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/billing/cancel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (res.ok) {
        alert("Invoice cancelled successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        alert(`Failed to cancel: ${text}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [user]);

  const filteredInvoices = invoices.filter((inv) => {
    if (filterStatus === "all") return true;
    return inv.status === filterStatus;
  });

  const handleRequestPayout = async () => {
    const amountStr = prompt("Enter payout amount (NGN):", "10000");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount) || amount <= 0) {
      alert("Invalid amount.");
      return;
    }

    if (config.isMockMode) {
      alert(`Payout of ${formatNaira(amount)} simulated in mock mode.`);
      return;
    }

    try {
      const res = await fetch("/api/v1/psp/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        alert("Payout initiated successfully!");
      } else {
        const text = await res.text();
        alert(`Failed to initiate payout: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error initiating payout.");
    }
  };

  // Calculate dynamic metrics
  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalCollected = invoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalCommission = invoices.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + inv.platformFee, 0);
  const totalOutstanding = invoices.filter((inv) => inv.status !== "paid" && inv.status !== "cancelled").reduce((sum, inv) => sum + inv.totalAmount, 0);

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Billing & Invoices</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Monitor resident invoices, collections, and Saziate platform commissions.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdvanceModal(true)}>
            <Wallet size={16} />
            Log Advance Payment
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRequestPayout}>
            <DollarSign size={16} />
            Request Payout
          </button>
          <a href="/psp/billing/reconciliation" className="btn btn-secondary btn-sm">
            <AlertCircle size={16} />
            Manual Reconciliation
          </a>
          <button className="btn btn-secondary btn-sm" onClick={fetchInvoices}>
            <RefreshCw size={16} />
            Refresh Feed
          </button>
        </div>
      </div>

      {showAdvanceModal && (
        <AdvancePaymentModal 
          onClose={() => setShowAdvanceModal(false)}
          onSuccess={() => {
            setShowAdvanceModal(false);
            alert("Advance payment logged successfully!");
            fetchInvoices();
          }}
        />
      )}

      {/* Summary Cards */}
      <div className="metrics-grid" style={{ marginBottom: "2rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
        <div className="metric-card">
          <p className="metric-label">Total Invoiced (This Month)</p>
          <p className="metric-value">{formatNaira(totalInvoiced)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Total Collected</p>
          <p className="metric-value" style={{ color: "var(--color-success)" }}>{formatNaira(totalCollected)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Saziate Commission (5%)</p>
          <p className="metric-value" style={{ color: "var(--color-primary)" }}>{formatNaira(totalCommission)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">SMS Notification Costs</p>
          <p className="metric-value" style={{ color: "var(--color-warning)" }}>{formatNaira(notificationCosts)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Outstanding Revenue</p>
          <p className="metric-value" style={{ color: "var(--color-danger)" }}>{formatNaira(totalOutstanding)}</p>
        </div>
      </div>

      {/* Pending Cash Verification Section */}
      {pendingCash.length > 0 && (
        <div className="card" style={{ marginBottom: "2rem", borderLeft: "4px solid var(--color-warning)" }}>
          <div style={{ padding: "1.25rem", borderBottom: "1px solid var(--color-border)" }}>
            <h3 style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <AlertCircle size={18} color="var(--color-warning)" />
              Pending Cash Verification
            </h3>
            <p className="text-muted text-sm" style={{ marginTop: "0.25rem" }}>
              Field agents have collected physical cash. Verify receipt to settle the invoices.
            </p>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Amount</th>
                  <th>Date Logged</th>
                  <th>Agent ID</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {pendingCash.map((cash) => (
                  <tr key={cash.id}>
                    <td style={{ fontFamily: "monospace" }}>{cash.reference}</td>
                    <td className="font-semibold">{formatNaira(cash.amount)}</td>
                    <td className="text-sm">{new Date(cash.paidAt).toLocaleString()}</td>
                    <td className="text-sm text-muted">{cash.loggedById}</td>
                    <td>
                      <button 
                        className="btn btn-primary btn-sm"
                        onClick={() => handleVerifyCash(cash.id)}
                      >
                        <Check size={14} /> Verify Cash
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {["all", "pending", "paid", "overdue", "cancelled"].map((status) => (
          <button
            key={status}
            className={`btn btn-sm ${filterStatus === status ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterStatus(status)}
            style={{ textTransform: "capitalize" }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Invoices Table */}
      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : filteredInvoices.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <p className="text-muted text-sm">No invoices found matching status &ldquo;{filterStatus}&rdquo;.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Resident</th>
                <th>Period</th>
                <th>PSP Base Rate</th>
                <th>Platform Fee (5%)</th>
                <th>Total Resident Bill</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={inv.id}>
                  <td>
                    <div>
                      <p className="font-medium">{inv.residentName}</p>
                      <p className="text-muted text-xs" style={{ fontFamily: "monospace" }}>
                        {inv.referenceCode}
                      </p>
                    </div>
                  </td>
                  <td className="text-sm">{inv.billingPeriod}</td>
                  <td className="text-sm">{formatNaira(inv.baseAmount)}</td>
                  <td className="text-sm text-muted">{formatNaira(inv.platformFee)}</td>
                  <td className="font-semibold text-sm">{formatNaira(inv.totalAmount)}</td>
                  <td className="text-sm">{inv.dueDate}</td>
                  <td>
                    <Badge
                      variant={
                        inv.status === "paid"
                          ? "success"
                          : inv.status === "cancelled"
                          ? "neutral"
                          : inv.status === "overdue"
                          ? "danger"
                          : "warning"
                      }
                    >
                      {inv.status.toUpperCase()}
                    </Badge>
                  </td>
                  <td>
                    {inv.status === "paid" ? (
                      <button className="btn btn-ghost btn-sm">
                        View Receipt
                      </button>
                    ) : inv.status === "cancelled" ? (
                      <span className="text-muted text-xs">Cancelled</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleReconcile(inv.id)}
                        >
                          Reconcile
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-danger"
                          onClick={() => handleCancel(inv.id)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { FileText, Download, Check, AlertCircle, DollarSign, RefreshCw, Wallet, Search, ChevronLeft, ChevronRight } from "lucide-react";

import { MOCK_INVOICES, type Invoice, MOCK_ORG_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";
import { AdvancePaymentModal } from "@/components/org/AdvancePaymentModal";
import { AlertModal } from "@/components/ui/Modal";
import { PayoutModal } from "@/components/org/PayoutModal";

export default function OrgBillingPage() {
  const { user } = useSession();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [pendingCash, setPendingCash] = useState<any[]>([]);
  const [notificationCosts, setNotificationCosts] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  
  const [alertState, setAlertState] = useState<{isOpen: boolean, title: string, message: string}>({isOpen: false, title: "", message: ""});
  const [showPayoutModal, setShowPayoutModal] = useState(false);

  const [totalInvoiced, setTotalInvoiced] = useState(0);
  const [totalCollected, setTotalCollected] = useState(0);
  const [totalCommission, setTotalCommission] = useState(0);
  const [totalOutstanding, setTotalOutstanding] = useState(0);

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const showAlert = (title: string, message: string) => {
    setAlertState({ isOpen: true, title, message });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchInvoices = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.orgId!);
    const res = await repo.getInvoices(page, limit, debouncedSearch);
    
    // Support either old array format or new paginated object format
    let currentInvoicesList: Invoice[] = [];
    if (Array.isArray(res)) {
      setInvoices(res);
      currentInvoicesList = res;
    } else {
      setInvoices(res.data);
      setTotalPages(res.totalPages);
      setTotalCount(res.totalCount);
      currentInvoicesList = res.data;
    }

    if (config.isMockMode) {
      setNotificationCosts(480.00); // Mock cost
      setPendingCash([]);
      setTotalInvoiced(currentInvoicesList.reduce((sum, inv) => sum + (inv as any).totalAmount, 0));
      setTotalCollected(currentInvoicesList.filter((inv) => (inv as any).status === "paid").reduce((sum, inv) => sum + (inv as any).totalAmount, 0));
      setTotalCommission(currentInvoicesList.filter((inv) => (inv as any).status === "paid").reduce((sum, inv) => sum + (inv as any).platformFee, 0));
      setTotalOutstanding(currentInvoicesList.filter((inv) => (inv as any).status !== "paid" && (inv as any).status !== "cancelled").reduce((sum, inv) => sum + (inv as any).totalAmount, 0));
    } else {
      try {
        const [resCosts, resCash, resMetrics] = await Promise.all([
          fetch("/api/v1/org/notification-costs"),
          fetch("/api/v1/org/cash-verify"),
          fetch("/api/v1/org/metrics")
        ]);
        if (resCosts.ok) {
          const costData = await resCosts.json() as any;
          setNotificationCosts(costData.totalCost || 0);
        }
        if (resCash.ok) {
          const cashData = await resCash.json();
          setPendingCash(cashData as any);
        }
        if (resMetrics.ok) {
          const metricsData = await resMetrics.json() as any;
          if (metricsData.raw) {
            const raw = metricsData.raw;
            setTotalCollected(raw.totalPaidSum || 0);
            setTotalCommission(Math.round(raw.totalPaidSum * 0.05 * 100) / 100);
            setTotalOutstanding(raw.totalUnpaidSum || 0);
            setTotalInvoiced((raw.totalPaidSum || 0) + (raw.totalUnpaidSum || 0));
          }
        }
      } catch (error) {
        console.error("Failed to fetch data:", error);
      }
    }
    setLoading(false);
  };

  const handleVerifyCash = async (transactionId: string) => {
    if (config.isMockMode) {
      showAlert("Mock Mode", "Cash verified in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/org/cash-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId }),
      });
      if (res.ok) {
        showAlert("Success", "Cash payment verified successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        showAlert("Verification Failed", text || "Failed to verify cash.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleReconcile = async (invoiceId: string) => {
    if (config.isMockMode) {
      showAlert("Mock Mode", "Reconcile simulated in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/billing/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (res.ok) {
        showAlert("Success", "Payment reconciled successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        showAlert("Reconciliation Failed", text || "Failed to reconcile invoice.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancel = async (invoiceId: string) => {
    if (config.isMockMode) {
      showAlert("Mock Mode", "Cancellation simulated in mock mode.");
      return;
    }
    try {
      const res = await fetch("/api/v1/billing/cancel", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      if (res.ok) {
        showAlert("Success", "Invoice cancelled successfully!");
        fetchInvoices();
      } else {
        const text = await res.text();
        showAlert("Cancellation Failed", text || "Failed to cancel invoice.");
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [user, page, limit, debouncedSearch]);

  const filteredInvoices = invoices.filter((inv) => {
    if (filterStatus === "all") return true;
    return (inv as any).status === filterStatus;
  });

  const handleRequestPayout = () => {
    setShowPayoutModal(true);
  };



  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Revenue & Billing</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Monitor automated services, active revenue, and platform growth metrics.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdvanceModal(true)}>
            <Wallet size={16} />
            Log Advance Payment
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleRequestPayout}>
            <DollarSign size={16} />
            Accelerate Payout
          </button>
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
            showAlert("Success", "Advance payment logged successfully!");
            fetchInvoices();
          }}
        />
      )}

      {/* Summary Cards */}
      <div className="metrics-grid" style={{ marginBottom: "2rem", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "1rem" }}>
        <div className="metric-card">
          <p className="metric-label">Total Invoiced (This Month)</p>
          <p className="metric-value">{formatCurrency(totalInvoiced)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Total Collected</p>
          <p className="metric-value" style={{ color: "var(--color-success)" }}>{formatCurrency(totalCollected)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Saziate Commission (5%)</p>
          <p className="metric-value" style={{ color: "var(--color-primary)" }}>{formatCurrency(totalCommission)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">SMS Notification Costs</p>
          <p className="metric-value" style={{ color: "var(--color-warning)" }}>{formatCurrency(notificationCosts)}</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Outstanding Revenue</p>
          <p className="metric-value" style={{ color: "var(--color-danger)" }}>{formatCurrency(totalOutstanding)}</p>
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
                    <td className="font-semibold">{formatCurrency(cash.amount)}</td>
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
            <div className="flex items-center justify-between" style={{ padding: "1rem", borderTop: "1px solid var(--color-border)" }}>
              <p className="text-sm text-muted">
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} invoices
              </p>
              <div className="flex gap-2">
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={page === 1}
                  onClick={() => setPage(p => p - 1)}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={page === totalPages}
                  onClick={() => setPage(p => p + 1)}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
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
                <th>Org Base Rate</th>
                <th>Platform Fee (5%)</th>
                <th>Total Resident Bill</th>
                <th>Due Date</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.map((inv) => (
                <tr key={(inv as any).id}>
                  <td>
                    <div>
                      <p className="font-medium">{(inv as any).residentName}</p>
                      <p className="text-muted text-xs" style={{ fontFamily: "monospace" }}>
                        {(inv as any).referenceCode}
                      </p>
                    </div>
                  </td>
                  <td className="text-sm">{(inv as any).billingPeriod}</td>
                  <td className="text-sm">{formatCurrency((inv as any).baseAmount)}</td>
                  <td className="text-sm text-muted">{formatCurrency((inv as any).platformFee)}</td>
                  <td className="font-semibold text-sm">{formatCurrency((inv as any).totalAmount)}</td>
                  <td className="text-sm">{(inv as any).dueDate}</td>
                  <td>
                    <Badge
                      variant={
                        (inv as any).status === "paid"
                          ? "success"
                          : (inv as any).status === "cancelled"
                          ? "neutral"
                          : (inv as any).status === "overdue"
                          ? "danger"
                          : "warning"
                      }
                    >
                      {(inv as any).status.toUpperCase()}
                    </Badge>
                  </td>
                  <td>
                    {(inv as any).status === "paid" ? (
                      <button className="btn btn-ghost btn-sm">
                        View Receipt
                      </button>
                    ) : (inv as any).status === "cancelled" ? (
                      <span className="text-muted text-xs">Cancelled</span>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleReconcile((inv as any).id)}
                        >
                          Reconcile
                        </button>
                        <button
                          className="btn btn-ghost btn-xs text-danger"
                          onClick={() => handleCancel((inv as any).id)}
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

      <AlertModal
        isOpen={alertState.isOpen}
        onClose={() => setAlertState((prev) => ({ ...prev, isOpen: false }))}
        title={alertState.title}
        message={alertState.message}
      />

      <PayoutModal
        isOpen={showPayoutModal}
        onClose={() => setShowPayoutModal(false)}
        onSuccess={fetchInvoices}
        showAlert={showAlert}
      />
    </div>
  );
}

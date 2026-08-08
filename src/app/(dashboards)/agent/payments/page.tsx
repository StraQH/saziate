"use client";

import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/components/ui/Toast";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { Search, DollarSign, CheckCircle2, User, Landmark, HelpCircle } from "lucide-react";
import { config } from "@/lib/config";

// --- Types ---
interface ResidentPaymentStatus {
  residentId: string;
  name: string;
  lastPaymentAmount: number;
  lastPaymentDate: string | null;
  outstandingBalance: number;
  status: "paid" | "unpaid" | "overdue";
}

// --- Mock Resident Payment Statuses ---
const MOCK_STATUSES: ResidentPaymentStatus[] = [
  {
    residentId: "r1",
    name: "John Doe",
    lastPaymentAmount: 0,
    lastPaymentDate: null,
    outstandingBalance: 6300,
    status: "unpaid",
  },
  {
    residentId: "r2",
    name: "Jane Smith",
    lastPaymentAmount: 7875,
    lastPaymentDate: "15 Jul 2026",
    outstandingBalance: 0,
    status: "paid",
  },
  {
    residentId: "r3",
    name: "St. Nicholas Clinic",
    lastPaymentAmount: 31500,
    lastPaymentDate: "28 May 2026",
    outstandingBalance: 31500,
    status: "overdue",
  },
];

export default function AgentPaymentsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ResidentPaymentStatus[]>(config.isMockMode ? MOCK_STATUSES : []);
  const [selectedResident, setSelectedResident] = useState<ResidentPaymentStatus | null>(null);
  const [cashAmount, setCashAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (config.isMockMode) return;
    try {
      const resRes = await fetch("/api/v1/residents");
      if (resRes.ok) {
        const json = await resRes.json() as any;
        const body = Array.isArray(json) ? json : (json.data || []);
        const mapped: ResidentPaymentStatus[] = body.map((r: any) => ({
          residentId: r.id,
          name: r.name,
          lastPaymentAmount: r.lastPaymentAmount || 0,
          lastPaymentDate: r.lastPaymentDate || null,
          outstandingBalance: r.outstandingBalance || 0,
          status: r.status || "unpaid",
          activeInvoiceId: r.activeInvoiceId || null,
        }));
        setStatuses(mapped);
      }
    } catch (err) {
      console.error("Failed to load agent payments data:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search) return;
    const match = statuses.find(
      (s) => s.name.toLowerCase().includes(search.toLowerCase())
    );
    if (match) {
      setSelectedResident(match);
      setMessage(null);
    } else {
      setSelectedResident(null);
      setMessage("No resident found matching query.");
    }
  };

  const handleLogCash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResident || !cashAmount) return;

    setIsSubmitting(true);

    if (config.isMockMode) {
      const amountNum = parseFloat(cashAmount) || 0;
      setTimeout(() => {
        setStatuses((prev) =>
          prev.map((s) =>
            s.residentId === selectedResident.residentId
              ? {
                  ...s,
                  outstandingBalance: Math.max(0, s.outstandingBalance - amountNum),
                  lastPaymentAmount: amountNum,
                  lastPaymentDate: "Today (Cash)",
                  status: s.outstandingBalance - amountNum <= 0 ? "paid" : s.status,
                }
              : s
          )
        );
        setMessage(`Logged cash payment of ${formatCurrency(amountNum)} for ${selectedResident.name}`);
        setSelectedResident(null);
        setCashAmount("");
        setIsSubmitting(false);
      }, 1000);
      return;
    }

    try {
      const res = await fetch("/api/v1/payments/log-cash", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invoiceId: config.isMockMode ? "inv-001" : (selectedResident as any).activeInvoiceId,
          residentId: selectedResident.residentId,
          amount: cashAmount,
          idemKey: crypto.randomUUID(),
        }),
      });

      if (res.ok) {
        toast("Cash payment logged successfully!", "success");
        loadData();
        setSelectedResident(null);
        setCashAmount("");
      } else {
        const text = await res.text();
        toast(`Failed to log payment: ${text}`, "error");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Verify Payments & Log Cash</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Search a resident's payment status, check their virtual bank details, or log cash services on the field.
          </p>
        </div>
      </div>

      {message && (
        <div
          className="card"
          style={{
            background: "var(--color-primary-light)",
            borderColor: "var(--color-primary)",
            padding: "0.875rem 1.25rem",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
            color: "var(--color-primary)",
            fontWeight: 500,
          }}
        >
          {message}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: selectedResident ? "1fr 1fr" : "1fr", gap: "2rem", alignItems: "start" }}>
        {/* Search Panel */}
        <div className="card">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Resident Look-up</h2>
          <form onSubmit={handleSearch} style={{ display: "flex", gap: "0.75rem", marginBottom: "1.5rem" }}>
            <input
              type="text"
              className="input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Enter resident name"
              required
            />
            <button type="submit" className="btn btn-primary">
              <Search size={18} />
              Find
            </button>
          </form>

          <h3 style={{ fontSize: "0.9375rem", fontWeight: 600, marginBottom: "0.75rem", color: "var(--color-text-muted)" }}>
            Quick Resident List
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {statuses.map((s) => (
              <div
                key={s.residentId}
                onClick={() => setSelectedResident(s)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.875rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  backgroundColor: selectedResident?.residentId === s.residentId ? "var(--color-bg)" : "var(--color-surface)",
                }}
              >
                <div style={{ flex: 1 }}>
                  <div className="font-semibold text-foreground">
                    {s.name}
                  </div>
                </div>
                <Badge variant={s.status === "paid" ? "success" : s.status === "overdue" ? "danger" : "warning"}>
                  {s.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Payment Verification / Cash Log Action Panel */}
        {selectedResident && (
          <div className="card">
            <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem" }}>Resident Payment Profile</h2>
            <p className="text-muted text-xs" style={{ marginBottom: "1.5rem" }}>
              Selected: <span className="font-semibold text-text">{selectedResident.name}</span>
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Status details */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div style={{ background: "var(--color-bg)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <p className="text-xs text-muted">Outstanding Balance</p>
                  <p className="font-semibold text-sm" style={{ marginTop: "0.15rem", color: selectedResident.outstandingBalance > 0 ? "var(--color-danger)" : "var(--color-success)" }}>
                    {formatCurrency(selectedResident.outstandingBalance)}
                  </p>
                </div>
                <div style={{ background: "var(--color-bg)", padding: "0.875rem", borderRadius: "var(--radius-sm)" }}>
                  <p className="text-xs text-muted">Last Recorded Payment</p>
                  <p className="font-semibold text-sm" style={{ marginTop: "0.15rem" }}>
                    {selectedResident.lastPaymentDate ? `${formatCurrency(selectedResident.lastPaymentAmount)} (${selectedResident.lastPaymentDate})` : "None"}
                  </p>
                </div>
              </div>

              {/* Log Cash Form */}
              {selectedResident.outstandingBalance > 0 && (
                <form onSubmit={handleLogCash} style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <h4 style={{ fontSize: "0.9375rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <DollarSign size={18} style={{ color: "var(--color-success)" }} />
                    Log Field Cash Payment
                  </h4>
                  <div className="form-group">
                    <label className="label">Amount Collected ({config.locality.symbol})</label>
                    <input
                      type="number"
                      className="input"
                      value={cashAmount}
                      onChange={(e) => setCashAmount(e.target.value)}
                      placeholder={`e.g. ${selectedResident.outstandingBalance}`}
                      max={selectedResident.outstandingBalance}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-3" style={{ marginTop: "0.5rem" }}>
                    <button type="button" className="btn btn-ghost" onClick={() => setSelectedResident(null)}>
                      Close
                    </button>
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? "Logging..." : "Log Cash Received"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

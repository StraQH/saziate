"use client";

import { useState, useEffect } from "react";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { FileText, Download, CheckCircle, AlertCircle, RefreshCw, Printer, DollarSign } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";

interface Invoice {
  id: string;
  baseAmount: number;
  platformFee: number;
  totalAmount: number;
  dueDate: string;
  status: string;
  billingPeriod: string;
  referenceCode: string;
}

export default function ResidentInvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { user } = useSession();
  const serviceType = user?.orgServiceType || "utility";

  const fetchInvoices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resident/invoices");
      if (res.ok) {
        const body = await res.json() as any as Invoice[];
        setInvoices(body);
      }
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const filtered = invoices.filter((inv) => {
    if (filterStatus === "all") return true;
    return (inv as any).status === filterStatus;
  });

  const handlePrint = () => {
    window.print();
  };

  const handlePay = async (invoiceIds: string[]) => {
    if (invoiceIds.length === 0) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/resident/invoices/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceIds }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Payment initialization failed");
      }
      const data = await res.json() as any;
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error("No checkout URL returned");
      }
    } catch (err: any) {
      setError(err.message || "Failed to initialize payment.");
    } finally {
      setPaying(false);
    }
  };

  const pendingInvoices = invoices.filter(i => i.status === "pending" || i.status === "overdue");

  return (
    <div>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Your Invoices</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track past {serviceType} bills and print payment receipts.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}>
          {pendingInvoices.length > 0 && (
            <button 
              className="btn btn-primary btn-sm" 
              onClick={() => handlePay(pendingInvoices.map(i => i.id))}
              disabled={paying}
            >
              <CheckCircle size={16} />
              {paying ? "Processing..." : `Pay All (${pendingInvoices.length})`}
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={fetchInvoices}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "1.5rem" }}>
          <AlertCircle size={18} />
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {["all", "pending", "overdue", "paid"].map((status) => (
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

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <p className="text-muted text-sm">No invoices found matching status &ldquo;{filterStatus}&rdquo;.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
          {filtered.map((inv) => (
            <div key={(inv as any).id} className="card" style={{ padding: "1.25rem" }}>
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div style={{ background: "var(--color-bg)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                    <FileText className="text-muted" size={20} />
                  </div>
                  <div>
                    <p className="font-semibold">{(inv as any).billingPeriod} <span style={{textTransform: "capitalize"}}>{serviceType}</span> Bill</p>
                    <p className="text-muted text-xs">Reference: {(inv as any).referenceCode}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="text-right">
                    <p className="font-bold">{formatCurrency((inv as any).totalAmount)}</p>
                    <p className="text-xs text-muted">Due {(inv as any).dueDate}</p>
                  </div>

                  <Badge variant={(inv as any).status === "paid" ? "success" : (inv as any).status === "overdue" ? "danger" : "warning"}>
                    {(inv as any).status.toUpperCase()}
                  </Badge>

                  <button
                    className="btn btn-secondary btn-xs"
                    onClick={() => setSelectedInvoice(inv)}
                  >
                    Details / Receipt
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invoice Detail Modal */}
      {selectedInvoice && (
        <div className="modal-backdrop" style={{ display: "flex", alignItems: "center", justifyContent: "center", position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(0,0,0,0.4)", zIndex: 1000 }}>
          <div className="card" style={{ width: "100%", maxWidth: "500px", position: "relative", padding: "2rem" }}>
            
            {/* Header / Printable Section */}
            <div id="receipt-print-area">
              <div className="text-center" style={{ marginBottom: "1.5rem" }}>
                <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--color-primary)", textTransform: "capitalize" }}>Saziate {serviceType} Bill</h2>
                <p className="text-xs text-muted" style={{ marginTop: "0.25rem" }}>Official Payment Summary</p>
              </div>

              <div className="divider" style={{ margin: "1rem 0" }} />

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
                <div className="flex justify-between">
                  <span className="text-muted">Invoice ID</span>
                  <span className="font-mono">{selectedInvoice.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Billing Period</span>
                  <span>{selectedInvoice.billingPeriod}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Payment Reference</span>
                  <span className="font-mono font-semibold text-primary">{selectedInvoice.referenceCode}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Due Date</span>
                  <span>{selectedInvoice.dueDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Invoice Status</span>
                  <Badge variant={selectedInvoice.status === "paid" ? "success" : "warning"}>
                    {selectedInvoice.status.toUpperCase()}
                  </Badge>
                </div>

                <div className="divider" style={{ margin: "1rem 0" }} />

                <div className="flex justify-between">
                  <span className="text-muted">Org Base Rate</span>
                  <span>{formatCurrency(selectedInvoice.baseAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Platform Fee (5%)</span>
                  <span>{formatCurrency(selectedInvoice.platformFee)}</span>
                </div>
                
                <div className="divider" style={{ margin: "0.5rem 0" }} />

                <div className="flex justify-between" style={{ fontSize: "1.125rem", fontWeight: 700 }}>
                  <span>Total Amount</span>
                  <span className="text-primary">{formatCurrency(selectedInvoice.totalAmount)}</span>
                </div>
              </div>

              {selectedInvoice.status === "paid" && (
                <div className="text-center" style={{ marginTop: "2rem", padding: "1rem", background: "var(--color-success-bg)", border: "1px solid var(--color-success)", borderRadius: "var(--radius-md)", color: "var(--color-success)" }}>
                  <p className="font-semibold text-sm">Payment Verified Successfully</p>
                  <p className="text-xs" style={{ marginTop: "0.15rem" }}>Thank you for keeping your neighborhood clean.</p>
                </div>
              )}
            </div>

            <div className="divider" style={{ margin: "1.5rem 0" }} />

            <div className="flex justify-end gap-3 print-hide">
              {selectedInvoice.status !== "paid" && (
                <button 
                  className="btn btn-primary" 
                  onClick={() => handlePay([selectedInvoice.id])}
                  disabled={paying}
                >
                  <span>{paying ? "Processing..." : "Pay Now"}</span>
                </button>
              )}
              <button className="btn btn-secondary" onClick={handlePrint}>
                <Printer size={16} />
                <span>Print</span>
              </button>
              <button className="btn btn-ghost" onClick={() => setSelectedInvoice(null)}>
                Close
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}

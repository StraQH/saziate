"use client";

import { useState, useEffect } from "react";
import { formatNaira } from "@/lib/utils";
import { Check, Search, AlertTriangle } from "lucide-react";

export default function ManualReconciliationPage() {
  const [unmatchedDeposits, setUnmatchedDeposits] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // In a real implementation, we would fetch unmatched deposits from an API endpoint
  // where residentId === "unmatched"
  const fetchReconciliationData = async () => {
    setLoading(true);
    // Mocking API fetch
    setTimeout(() => {
      setUnmatchedDeposits([
        { id: "tx_123", reference: "SZ-PAY-901", amount: 15000, date: "2023-11-01", status: "initiated" },
        { id: "tx_124", reference: "SZ-PAY-902", amount: 6000, date: "2023-11-02", status: "initiated" }
      ]);
      setInvoices([
        { id: "inv_001", residentName: "John Doe", totalAmount: 15000, status: "pending" },
        { id: "inv_002", residentName: "Jane Smith", totalAmount: 6000, status: "pending" }
      ]);
      setLoading(false);
    }, 1000);
  };

  useEffect(() => {
    fetchReconciliationData();
  }, []);

  const handleMatch = (depositId: string, invoiceId: string) => {
    alert(`Matched deposit ${depositId} to invoice ${invoiceId}`);
    setUnmatchedDeposits(unmatchedDeposits.filter(d => d.id !== depositId));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Manual Reconciliation</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Match unrecognized bank deposits to pending resident invoices.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : unmatchedDeposits.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <Check size={48} className="mx-auto text-success mb-4" />
          <h3>All Caught Up!</h3>
          <p className="text-muted text-sm mt-2">No unmatched deposits requiring manual reconciliation.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {unmatchedDeposits.map(deposit => (
            <div key={deposit.id} className="card flex items-center justify-between" style={{ padding: "1.5rem" }}>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle size={16} className="text-warning" />
                  <h3 className="font-semibold">{formatNaira(deposit.amount)}</h3>
                </div>
                <p className="text-sm text-muted">
                  Ref: <span className="font-mono">{deposit.reference}</span> • {deposit.date}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <select className="input" defaultValue="">
                  <option value="" disabled>Select Invoice to Match...</option>
                  {invoices.filter(i => i.totalAmount === deposit.amount).map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.residentName} - {formatNaira(inv.totalAmount)}
                    </option>
                  ))}
                </select>
                <button 
                  className="btn btn-primary"
                  onClick={() => handleMatch(deposit.id, "selected_invoice")}
                >
                  Confirm Match
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

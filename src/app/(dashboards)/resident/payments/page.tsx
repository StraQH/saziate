"use client";

import { useState, useEffect } from "react";
import { formatNaira } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, CheckCircle, RefreshCw, Landmark, CircleDollarSign } from "lucide-react";

interface Transaction {
  id: string;
  reference: string;
  amount: number;
  status: string;
  paymentMethod: string;
  paidAt: string;
}

export default function ResidentPaymentsPage() {
  const [payments, setPayments] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPayments = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resident/payments");
      if (res.ok) {
        const body = await res.json() as Transaction[];
        setPayments(body);
      }
    } catch (err) {
      console.error("Failed to fetch payments:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPayments();
  }, []);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Payment History</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            View history of all bank transfers and cash collections registered to your reference.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchPayments}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : payments.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <p className="text-muted text-sm">No payment history found.</p>
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Amount</th>
                <th>Payment Method</th>
                <th>Paid Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((tx) => (
                <tr key={tx.id}>
                  <td>
                    <div>
                      <p className="font-semibold">{tx.reference}</p>
                      <p className="text-xs text-muted font-mono">{tx.id}</p>
                    </div>
                  </td>
                  <td className="font-bold">{formatNaira(tx.amount)}</td>
                  <td>
                    <div className="flex items-center gap-1.5 text-sm">
                      {tx.paymentMethod === "bank_transfer" ? (
                        <>
                          <Landmark size={16} className="text-muted" />
                          <span>Bank Transfer</span>
                        </>
                      ) : (
                        <>
                          <CircleDollarSign size={16} className="text-muted" />
                          <span>Cash Collection</span>
                        </>
                      )}
                    </div>
                  </td>
                  <td className="text-sm">{tx.paidAt}</td>
                  <td>
                    <Badge variant={tx.status === "success" ? "success" : "neutral"}>
                      {tx.status.toUpperCase()}
                    </Badge>
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

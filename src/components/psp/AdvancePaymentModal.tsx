"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { config } from "@/lib/config";

interface AdvancePaymentModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AdvancePaymentModal({ onClose, onSuccess }: AdvancePaymentModalProps) {
  const [residentId, setResidentId] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!residentId || !amount) return;
    setError("");
    setLoading(true);

    try {
      if (config.isMockMode) {
        // Mock delay
        await new Promise(r => setTimeout(r, 1000));
        onSuccess();
        return;
      }

      const response = await fetch("/api/v1/psp/advance-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residentId,
          amount: parseFloat(amount),
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to log advance payment.");
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "400px",
          position: "relative",
          animation: "toast-in 0.2s ease",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "none",
            border: "none",
            color: "var(--color-text-muted)",
            cursor: "pointer",
          }}
        >
          <X size={20} />
        </button>

        <h3 style={{ marginBottom: "1.5rem" }}>Log Advance Payment</h3>

        {error && (
          <div style={{ padding: "0.75rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "0.5rem", marginBottom: "1rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="form-group">
            <label className="label">Resident ID (User ID)</label>
            <input
              type="text"
              className="input"
              value={residentId}
              onChange={(e) => setResidentId(e.target.value)}
              placeholder="e.g. res_12345"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Advance Amount (₦)</label>
            <input
              type="number"
              className="input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g., 18000 for 3 months"
              required
            />
          </div>
          
          <div style={{ background: "var(--color-primary-light)", padding: "0.875rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary)", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <span style={{ color: "var(--color-primary)" }}>ℹ️</span>
            <p style={{ fontSize: "0.875rem", color: "var(--color-primary)", margin: 0, fontWeight: 500 }}>
              This balance will automatically be consumed during the next monthly billing cycle to settle their invoices.
            </p>
          </div>

          <div className="flex justify-end gap-3" style={{ marginTop: "1rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Logging..." : "Log Payment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

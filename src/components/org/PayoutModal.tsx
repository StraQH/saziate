"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { config } from "@/lib/config";
import { formatCurrency } from "@/lib/utils";

interface PayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  showAlert: (title: string, message: string) => void;
}

export function PayoutModal({ isOpen, onClose, onSuccess, showAlert }: PayoutModalProps) {
  const [amount, setAmount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(amount);
    if (isNaN(val) || val <= 0) {
      setError("Please enter a valid amount.");
      return;
    }
    if (!password) {
      setError("Account password is required to authorize payouts.");
      return;
    }

    setError("");
    setLoading(true);

    if (config.isMockMode) {
      await new Promise((r) => setTimeout(r, 1000));
      onSuccess();
      showAlert("Mock Payout Initiated", `Payout of ${formatCurrency(val)} simulated successfully.`);
      onClose();
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/org/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, password }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to initiate payout.");
      }

      onSuccess();
      showAlert("Payout Initiated", "Your payout request has been successfully processed.");
      onClose();
    } catch (err: any) {
      setError(err.message || "Error initiating payout.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Request Payout">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        <p className="text-muted text-sm" style={{ marginBottom: "0.5rem" }}>
          Transfer funds from your available digital services to your settlement bank account.
        </p>
        
        {error && (
          <div style={{ padding: "0.75rem", background: "#fef2f2", color: "#b91c1c", borderRadius: "0.5rem", fontSize: "0.875rem" }}>
            {error}
          </div>
        )}

        <div className="form-group">
          <label className="label">Amount (NGN)</label>
          <input
            type="number"
            className="input"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 10000"
            min="100"
            step="0.01"
            required
            autoFocus
          />
        </div>

        <div className="form-group">
          <label className="label">Account Password</label>
          <input
            type="password"
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password to authorize"
            required
          />
        </div>

        <div className="flex gap-2 justify-end" style={{ marginTop: "0.5rem" }}>
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? "Processing..." : "Initiate Payout"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

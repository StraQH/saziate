"use client";

import { useState } from "react";
import { ShieldAlert, CheckCircle2, Lock } from "lucide-react";

export function ForceChangePasswordModal() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/v1/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: password }),
      });

      if (res.ok) {
        setSuccess("Password updated successfully! Reloading dashboard...");
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        const txt = await res.text();
        setError(txt || "Failed to update password.");
      }
    } catch (err: any) {
      setError(err.message || "Failed to update password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(0, 0, 0, 0.75)",
      backdropFilter: "blur(4px)",
      zIndex: 99999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1.5rem",
    }}>
      <div style={{
        backgroundColor: "var(--color-bg-card, #ffffff)",
        border: "1px solid var(--color-border, #e5e7eb)",
        borderRadius: "var(--radius-lg, 12px)",
        maxWidth: "450px",
        width: "100%",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
        padding: "2rem",
      }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: "1.5rem" }}>
          <div style={{
            width: "48px",
            height: "48px",
            borderRadius: "50%",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "1rem",
            color: "var(--color-primary, #3b82f6)",
          }}>
            <Lock size={24} />
          </div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.5rem 0", color: "var(--color-text, #111827)" }}>
            First Time Password Change
          </h2>
          <p style={{ fontSize: "0.875rem", color: "var(--color-text-secondary, #6b7280)", margin: 0, lineHeight: 1.5 }}>
            To secure your Saziate account, you must update your temporary password before proceeding to the dashboard.
          </p>
        </div>

        {error && (
          <div style={{
            background: "rgba(239, 68, 68, 0.1)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "6px",
            padding: "0.75rem",
            color: "#ef4444",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.25rem",
          }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{
            background: "rgba(16, 185, 129, 0.1)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "6px",
            padding: "0.75rem",
            color: "#10b981",
            fontSize: "0.8125rem",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.25rem",
          }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary, #4b5563)", marginBottom: "0.375rem" }}>
              New Password
            </label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 6 characters"
              required
              disabled={isSubmitting}
              style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--color-border, #d1d5db)", borderRadius: "6px" }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, color: "var(--color-text-secondary, #4b5563)", marginBottom: "0.375rem" }}>
              Confirm Password
            </label>
            <input
              type="password"
              className="input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              required
              disabled={isSubmitting}
              style={{ width: "100%", padding: "0.625rem", border: "1px solid var(--color-border, #d1d5db)", borderRadius: "6px" }}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isSubmitting}
            style={{ width: "100%", padding: "0.75rem", fontWeight: 600, marginTop: "0.5rem" }}
          >
            {isSubmitting ? "Updating..." : "Update Password & Continue"}
          </button>
        </form>
      </div>
    </div>
  );
}

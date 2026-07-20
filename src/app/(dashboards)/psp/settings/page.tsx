"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Key, CreditCard, ShieldAlert, CheckCircle2 } from "lucide-react";
import { config } from "@/lib/config";

export default function PSPSettingsPage() {
  const [pspName, setPspName] = useState("Lekki Green Cleaners Ltd");
  const [phone, setPhone] = useState("+2348021234567");
  const [email, setEmail] = useState("ops@lekkigreenclean.com");
  const [address, setAddress] = useState("Plot 15, Admiralty Way, Lekki");

  // DVA config
  const [dvaBankName, setDvaBankName] = useState("Wema Bank");
  const [dvaAccountNumber, setDvaAccountNumber] = useState("9920192834");
  const [dvaAccountName, setDvaAccountName] = useState("Saziate - Lekki Green Cleaners Ltd");

  // Payout Settings
  const [bankCode, setBankCode] = useState("035");
  const [accountNumber, setAccountNumber] = useState("0123456789");
  const [accountName, setAccountName] = useState("Lekki Green Cleaners Ltd");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadSettings = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/psp/settings");
      if (res.ok) {
        const body = await res.json() as any;
        setPspName(body.name || "");
        setEmail(body.contactEmail || "");
        setPhone(body.contactPhone || "");
        setAddress(body.address || "");
        setDvaBankName(body.dvaBankName || "Not provisioned yet");
        setDvaAccountNumber(body.dvaAccountNumber || "Not provisioned yet");
        setDvaAccountName(body.dvaAccountName || "Not provisioned yet");
        setBankCode(body.settlementBankCode || "035");
        setAccountNumber(body.settlementAccountNumber || "");
        setAccountName(body.settlementAccountName || "");
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (config.isMockMode) {
      setSuccess("Mock settings updated successfully.");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/psp/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementBankCode: bankCode,
          settlementAccountNumber: accountNumber,
          settlementAccountName: accountName,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update settings.");
      }

      setSuccess("Payout account details updated successfully.");
    } catch (err: any) {
      setError(err.message || "Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Operator Settings</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Manage company profile, dedicated virtual accounts, and payout settlements.
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "2rem", maxWidth: "800px" }}>
        
        {error && (
          <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "0.875rem", color: "var(--color-danger)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldAlert size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success)", borderRadius: "var(--radius-sm)", padding: "0.875rem", color: "var(--color-success)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        {/* Profile Card */}
        <div className="card">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Company Profile</h2>
          <form style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Company Legal Name</label>
              <input
                type="text"
                className="input"
                value={pspName}
                onChange={(e) => setPspName(e.target.value)}
                disabled
              />
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">Contact Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled
                />
              </div>
              <div className="form-group">
                <label className="label">Contact Phone</label>
                <input
                  type="tel"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled
                />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Office Address</label>
              <input
                type="text"
                className="input"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled
              />
            </div>
          </form>
        </div>

        {/* Dedicated Virtual Account Card */}
        <div className="card">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
            <CreditCard size={20} style={{ color: "var(--color-primary)" }} />
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Provisioned DVA</h2>
          </div>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Your Paystack Dedicated Virtual Account. Residents transfer payments directly to this account for automated reconciliation.
          </p>

          <div
            style={{
              background: "var(--color-bg)",
              padding: "1rem 1.25rem",
              borderRadius: "var(--radius-md)",
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1.5rem",
            }}
          >
            <div>
              <p className="text-xs text-muted">Bank Name</p>
              <p className="font-semibold" style={{ fontSize: "1rem", marginTop: "0.15rem" }}>{dvaBankName}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Account Number</p>
              <p className="font-semibold" style={{ fontSize: "1rem", marginTop: "0.15rem", fontFamily: "monospace" }}>
                {dvaAccountNumber}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">Account Name</p>
              <p className="font-semibold" style={{ fontSize: "1.025rem", marginTop: "0.15rem" }}>{dvaAccountName}</p>
            </div>
          </div>
        </div>

        {/* Bank Account Payout details */}
        <div className="card">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Settlement Destination</h2>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Configure the bank account where platform revenue payouts will be sent.
          </p>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">Bank Name</label>
                <select className="select" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
                  <option value="035">Wema Bank</option>
                  <option value="058">GTBank</option>
                  <option value="011">First Bank</option>
                  <option value="044">Access Bank</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Account Number</label>
                <input
                  type="text"
                  className="input"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value)}
                  maxLength={10}
                  required
                />
              </div>
            </div>
            <div className="form-group">
              <label className="label">Account Name</label>
              <input
                type="text"
                className="input"
                value={accountName}
                onChange={(e) => setAccountName(e.target.value)}
                placeholder="Enter Settlement Account Name"
                required
              />
            </div>
            <div className="flex justify-end" style={{ marginTop: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Updating..." : "Update Payout Account"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { Settings, Save, Key, CreditCard, ShieldAlert, CheckCircle2 } from "lucide-react";
import { config } from "@/lib/config";
import { PromptModal } from "@/components/ui/Modal";

export default function PSPSettingsPage() {
  const [pspName, setPspName] = useState(config.isMockMode ? "Lekki Green Cleaners Ltd" : "");
  const [phone, setPhone] = useState(config.isMockMode ? "+2348021234567" : "");
  const [email, setEmail] = useState(config.isMockMode ? "ops@lekkigreenclean.com" : "");
  const [address, setAddress] = useState(config.isMockMode ? "Plot 15, Admiralty Way, Lekki" : "");

  // DVA config
  const [dvaBankName, setDvaBankName] = useState(config.isMockMode ? "Wema Bank" : "");
  const [dvaAccountNumber, setDvaAccountNumber] = useState(config.isMockMode ? "9920192834" : "");
  const [dvaAccountName, setDvaAccountName] = useState(config.isMockMode ? "Saziate - Lekki Green Cleaners Ltd" : "");

  // Payout Settings
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [bvn, setBvn] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksLoadingError, setBanksLoadingError] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

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
        setBankCode(body.settlementBankCode || "");
        setAccountNumber(body.settlementAccountNumber || "");
        setAccountName(body.settlementAccountName || "");
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    }
  };

  const loadBanks = async () => {
    try {
      const res = await fetch("/api/v1/banks");
      if (res.ok) {
        const data = await res.json() as any[];
        setBanks(data);
      } else {
        const text = await res.text();
        setBanksLoadingError(text || "Failed to load settlement banks.");
      }
    } catch (err: any) {
      setBanksLoadingError((err as Error).message || "Failed to load settlement banks.");
    }
  };

  useEffect(() => {
    loadSettings();
    loadBanks();
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setShowPasswordPrompt(true);
  };

  const executeSave = async (password: string) => {
    if (!password) {
      setError("Password confirmation is required to save settlement details.");
      return;
    }

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
          bvn,
          password,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update settings.");
      }

      setSuccess("Payout account details updated successfully.");
      await loadSettings();
    } catch (err: any) {
      setError((err as Error).message || "Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  const isDvaPending = !dvaAccountNumber || dvaAccountNumber === "Not provisioned yet";

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Growth Settings & Payout Configuration</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Configure your growth engine: manage your business identity, automated collection accounts, and daily payout destination.
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

        {isDvaPending && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "var(--radius-sm)", padding: "1rem", color: "#92400e", fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
              <ShieldAlert size={18} />
              <span>DVA Provisioning Required</span>
            </div>
            <p style={{ margin: 0, opacity: 0.9, lineHeight: 1.4 }}>
              You must configure your settlement bank account details below to validate your profile and generate your Dedicated Virtual Account (DVA) before you can receive resident payments.
            </p>
          </div>
        )}

        {/* Profile Card */}
        <div className="card">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Business Identity</h2>
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
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>Automated Collection Engine (DVA)</h2>
          </div>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Your automated growth engine. Saziate provisions this dedicated account to instantly capture, verify, and reconcile resident payments with zero manual effort.
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
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Payout Destination</h2>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Tell us where to send your funds. Saziate accelerates your cash flow with rapid, reliable payouts to this account.
          </p>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">Bank Name</label>
                <select className="select" value={bankCode} onChange={(e) => setBankCode(e.target.value)} required>
                  <option value="" disabled>Select Bank</option>
                  {banks.length === 0 ? (
                    <option value="" disabled>{banksLoadingError || "Loading banks..."}</option>
                  ) : (
                    banks.map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))
                  )}
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
            <div className="form-group">
              <label className="label">Bank Verification Number (BVN)</label>
              <input
                type="text"
                className="input"
                value={bvn}
                onChange={(e) => setBvn(e.target.value)}
                placeholder="11-digit BVN"
                maxLength={11}
              />
                <p className="mt-1 text-xs text-base-content/60">
                  Required by Monnify to provision a Dedicated Virtual Account for your payout details. This is securely passed to Monnify and not stored on our servers.
                </p>
            </div>
            <div className="flex justify-end" style={{ marginTop: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Updating..." : "Update Payout Account"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <PromptModal
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSubmit={executeSave}
        title="Authorization Required"
        message="Enter your account password to authorize changing settlement details:"
        inputType="password"
        placeholder="Your Password"
        submitText="Authorize & Save"
      />
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { ShieldAlert, CheckCircle2 } from "lucide-react";
import { PromptModal } from "@/components/ui/Modal";
import { config } from "@/lib/config";

export default function OrgSettingsPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [orgName, setOrgName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const [unit1Name, setUnit1Name] = useState(config.isMockMode ? "Water Gallon" : "Primary Unit");
  const [unit2Name, setUnit2Name] = useState(config.isMockMode ? "Drum" : "Secondary Unit");

  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");

  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksLoadingError, setBanksLoadingError] = useState("");
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);

  const loadSettings = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/org/settings");
      if (res.ok) {
        const body = await res.json() as any;
        setOrgName(body.name || "");
        setEmail(body.contactEmail || "");
        setPhone(body.contactPhone || "");
        setAddress(body.address || "");
        setUnit1Name(body.unit1Name || "");
        setUnit2Name(body.unit2Name || "");
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
      setError("Password is required to save changes.");
      return;
    }
    setError("");
    setSuccess("");
    setLoading(true);
    setShowPasswordPrompt(false);
    try {
      const res = await fetch("/api/v1/org/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          settlementBankCode: bankCode,
          settlementAccountNumber: accountNumber,
          settlementAccountName: accountName,
          unit1Name,
          unit2Name,
          password,
        }),
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to update settings.");
      }

      setSuccess("Organization settings updated successfully.");
      await loadSettings();
    } catch (err: any) {
      setError((err as Error).message || "Failed to save settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Growth Settings & Payout Configuration</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Configure your growth engine: manage your business identity, on-demand units, and daily payout destination.
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
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Business Identity</h2>
          <form style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Company Legal Name</label>
              <input
                type="text"
                className="input"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
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

        {/* Bank Account Payout details & Billing Units form */}
        <div className="card">
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>Billing & Payout Details</h2>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Configure your on-demand service units and where to send your funds. Saziate accelerates your cash flow with rapid payouts to this account.
          </p>
          <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">Primary On-Demand Unit Name (e.g. 240L Bin)</label>
                <input
                  type="text"
                  className="input"
                  value={unit1Name}
                  onChange={(e) => setUnit1Name(e.target.value)}
                  placeholder="240L Bin"
                />
              </div>
              <div className="form-group">
                <label className="label">Secondary On-Demand Unit Name (e.g. 120L Bin)</label>
                <input
                  type="text"
                  className="input"
                  value={unit2Name}
                  onChange={(e) => setUnit2Name(e.target.value)}
                  placeholder="120L Bin"
                />
              </div>
            </div>

            <div className="divider" style={{ margin: "0.5rem 0" }} />

            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">Settlement Bank Name</label>
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
            <div className="flex justify-end" style={{ marginTop: "0.5rem" }}>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? "Saving..." : "Save Settings"}
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
        message="Enter your account password to authorize changing these secure settings:"
        inputType="password"
        placeholder="Your Password"
        submitText="Authorize & Save"
      />
    </div>
  );
}

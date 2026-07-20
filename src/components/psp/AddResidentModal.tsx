"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { config } from "@/lib/config";
import { generateId, generateResidentReference } from "@/lib/utils";

type BillingCategory = "residential" | "commercial" | "industrial" | "health";

interface Resident {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  route: string;
  billingCategory: BillingCategory;
  baseRate: number;
  isOverride: boolean;
  referenceCode: string;
  status: "active" | "suspended";
}

interface AddResidentModalProps {
  onClose: () => void;
  onSuccess: (newResident: Resident) => void;
}

export function AddResidentModal({ onClose, onSuccess }: AddResidentModalProps) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [route, setRoute] = useState("Lekki Res Zone A");
  const [billingCategory, setBillingCategory] = useState<BillingCategory>("residential");
  const [baseRate, setBaseRate] = useState("6000");
  const [isOverride, setIsOverride] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName || !lastName || !email || !phone || !address) return;
    setError("");
    setLoading(true);

    try {
      const rateNum = parseFloat(baseRate) || 0;

      if (config.isMockMode) {
        const newResident: Resident = {
          id: generateId(),
          firstName,
          lastName,
          name: `${firstName} ${lastName}`,
          email,
          phone,
          address,
          route,
          billingCategory,
          baseRate: rateNum,
          isOverride,
          referenceCode: generateResidentReference("LEK", Math.floor(Math.random() * 900) + 100),
          status: "active",
        };
        onSuccess(newResident);
        return;
      }

      // Live mode POST database write
      const response = await fetch("/api/v1/residents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          address,
          billingCategory,
          baseRate: rateNum,
          isOverride,
          route,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to create resident profile.");
      }

      const resBody = await response.json() as any;
      onSuccess(resBody.resident);
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
          maxWidth: "500px",
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

        <h3 style={{ marginBottom: "1.5rem" }}>Add Resident</h3>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="label">First Name</label>
              <input
                type="text"
                className="input"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="e.g., Aliko"
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Last Name</label>
              <input
                type="text"
                className="input"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="e.g., Dangote"
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label">Email Address</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g., aliko@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Phone Number</label>
            <input
              type="tel"
              className="input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g., +2348030000000"
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Address</label>
            <input
              type="text"
              className="input"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g., 10 Kingsway Road, Ikoyi"
              required
            />
          </div>

          <div className="grid" style={{ gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div className="form-group">
              <label className="label">Route</label>
              <select className="select" value={route} onChange={(e) => setRoute(e.target.value)}>
                <option value="Lekki Res Zone A">Lekki Res Zone A</option>
                <option value="Lekki Comm Zone B">Lekki Comm Zone B</option>
                <option value="Lekki Res Zone C">Lekki Res Zone C</option>
              </select>
            </div>

            <div className="form-group">
              <label className="label">Billing Category</label>
              <select
                className="select"
                value={billingCategory}
                onChange={(e) => setBillingCategory(e.target.value as BillingCategory)}
              >
                <option value="residential">Residential</option>
                <option value="commercial">Commercial</option>
                <option value="industrial">Industrial</option>
                <option value="health">Health</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="label">Monthly Base Rate (₦)</label>
            <input
              type="number"
              className="input"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
              required
            />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <input
              type="checkbox"
              id="isOverride"
              checked={isOverride}
              onChange={(e) => setIsOverride(e.target.checked)}
              style={{ width: "16px", height: "16px" }}
            />
            <label htmlFor="isOverride" className="label" style={{ cursor: "pointer" }}>
              Apply custom rate override for this resident
            </label>
          </div>

          <div style={{ background: "var(--color-primary-light)", padding: "0.875rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-primary)", display: "flex", alignItems: "flex-start", gap: "0.5rem" }}>
            <span style={{ color: "var(--color-primary)" }}>ℹ️</span>
            <p style={{ fontSize: "0.875rem", color: "var(--color-primary)", margin: 0, fontWeight: 500 }}>
              Termii SMS Notification Cost: Standard rates apply per resident added (approx. ₦5.00/SMS) for account setup notifications.
            </p>
          </div>

          <div className="divider" style={{ margin: "0.5rem 0" }} />

          <div className="flex justify-end gap-3">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create Profile
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

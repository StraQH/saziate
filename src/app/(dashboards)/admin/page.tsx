"use client";

import { useState, useEffect } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { Landmark, ArrowRight, UserPlus, CheckCircle } from "lucide-react";
import { config } from "@/lib/config";

// --- Types ---
interface OnboardedPSP {
  id: string;
  name: string;
  rcNumber: string;
  contactEmail: string;
  contactPhone: string;
  totalSettlementVolume: number;
  status: "verified" | "pending_verification";
}

const INITIAL_PSPS: OnboardedPSP[] = [
  {
    id: "psp1",
    name: "Lekki Green Cleaners Ltd",
    rcNumber: "RC-1029384",
    contactEmail: "ops@lekkigreenclean.com",
    contactPhone: "+2348021234567",
    totalSettlementVolume: 1240000,
    status: "verified",
  },
  {
    id: "psp2",
    name: "Ikoyi Waste Solutions",
    rcNumber: "RC-9830291",
    contactEmail: "solutions@ikoyiwaste.org",
    contactPhone: "+2348029830291",
    totalSettlementVolume: 0,
    status: "pending_verification",
  },
];

export default function AdminDashboardPage() {
  const [psps, setPsps] = useState<OnboardedPSP[]>(INITIAL_PSPS);
  const [showAddForm, setShowAddForm] = useState(false);

  // New PSP fields
  const [name, setName] = useState("");
  const [rcNumber, setRcNumber] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  const fetchPSPs = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/admin/psps");
      if (res.ok) {
        const body = await res.json() as any[];
        const mapped: OnboardedPSP[] = body.map((item) => ({
          id: item.id,
          name: item.name,
          rcNumber: item.rcNumber || "N/A",
          contactEmail: item.contactEmail,
          contactPhone: item.contactPhone || "",
          totalSettlementVolume: 0,
          status: item.dvaAccountNumber ? "verified" : "pending_verification",
        }));
        setPsps(mapped);
      }
    } catch (err) {
      console.error("Failed to load operators:", err);
    }
  };

  useEffect(() => {
    fetchPSPs();
  }, []);

  const handleCreatePSP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !rcNumber || !email) return;

    if (config.isMockMode) {
      const newPsp: OnboardedPSP = {
        id: crypto.randomUUID(),
        name,
        rcNumber,
        contactEmail: email,
        contactPhone: phone || "+2348020000000",
        totalSettlementVolume: 0,
        status: "pending_verification",
      };

      setPsps((prev) => [...prev, newPsp]);
      setName("");
      setRcNumber("");
      setEmail("");
      setPhone("");
      setShowAddForm(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/admin/psps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rcNumber,
          contactEmail: email,
          contactPhone: phone || "+2348020000000",
          address: "Lagos, Nigeria",
        }),
      });

      if (res.ok) {
        alert("Waste Operator registered successfully!");
        fetchPSPs();
        setName("");
        setRcNumber("");
        setEmail("");
        setPhone("");
        setShowAddForm(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (pspId: string) => {
    if (config.isMockMode) {
      setPsps((prev) =>
        prev.map((p) => (p.id === pspId ? { ...p, status: "verified" } : p))
      );
      return;
    }

    try {
      const res = await fetch("/api/v1/admin/psps/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pspId }),
      });

      if (res.ok) {
        alert("Operator verified and Virtual Bank Account provisioned successfully!");
        fetchPSPs();
      } else {
        const text = await res.text();
        alert(`Failed to verify: ${text}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Saziate Platform Admin</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Monitor onboarding, platform volume, and verify PSP operations.
          </p>
        </div>
        {!showAddForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            <UserPlus size={16} />
            Onboard Operator
          </button>
        )}
      </div>

      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <MetricCard label="Active Operators" value={psps.filter((p) => p.status === "verified").length.toString()} />
        <MetricCard label="Total Platform Volume" value="₦1,240,000" />
        <MetricCard label="Saziate Revenue (5%)" value="₦62,000" />
      </div>

      {showAddForm && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Onboard Waste Operator</h3>
          <form onSubmit={handleCreatePSP} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Operator Legal Name</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lekki Green Cleaners Ltd"
                required
              />
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">CAC RC Number</label>
                <input
                  type="text"
                  className="input"
                  value={rcNumber}
                  onChange={(e) => setRcNumber(e.target.value)}
                  placeholder="e.g. RC-1234567"
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Primary Email</label>
                <input
                  type="email"
                  className="input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ops@operator.com"
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Primary Phone</label>
                <input
                  type="text"
                  className="input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +2348021234567"
                  required
                />
              </div>
            </div>
            <div className="flex justify-end gap-3" style={{ marginTop: "0.5rem" }}>
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary">
                Register Operator
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Onboarded operators list */}
      <div className="card">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.25rem" }}>Registered Operators</h2>
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>RC Number</th>
                <th>Email</th>
                <th>Settled Volume</th>
                <th>Verification Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {psps.map((p) => (
                <tr key={p.id}>
                  <td className="font-semibold text-sm">{p.name}</td>
                  <td className="text-sm">{p.rcNumber}</td>
                  <td className="text-sm">{p.contactEmail}</td>
                  <td className="text-sm font-semibold">{p.totalSettlementVolume > 0 ? `₦${p.totalSettlementVolume.toLocaleString()}` : "₦0"}</td>
                  <td>
                    <Badge variant={p.status === "verified" ? "success" : "warning"}>
                      {p.status === "verified" ? "VERIFIED" : "PENDING"}
                    </Badge>
                  </td>
                  <td>
                    {p.status === "pending_verification" && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleVerify(p.id)}
                        style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}
                      >
                        <CheckCircle size={14} />
                        Verify
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

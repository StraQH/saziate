"use client";

import { useState, useEffect } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { Badge } from "@/components/ui/Badge";
import { Landmark, ArrowRight, UserPlus, CheckCircle, ChevronLeft, ChevronRight, Search } from "lucide-react";
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

interface AuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  meta: string;
  createdAt: number;
  actorName: string | null;
  actorEmail: string | null;
  actorRole: string | null;
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
  const [psps, setPsps] = useState<OnboardedPSP[]>(config.isMockMode ? INITIAL_PSPS : []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"operators" | "audit">("operators");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Audit Log Pagination
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotalCount, setAuditTotalCount] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [debouncedAuditSearch, setDebouncedAuditSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAuditSearch(auditSearch);
      setAuditPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [auditSearch]);

  // New PSP fields|  const [psps, setPsps] = useState<OnboardedPSP[]>(config.isMockMode ? INITIAL_PSPS : []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"operators" | "audit">("operators");
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Audit Log Pagination
  const [auditPage, setAuditPage] = useState(1);
  const [auditLimit, setAuditLimit] = useState(50);
  const [auditTotalPages, setAuditTotalPages] = useState(1);
  const [auditTotalCount, setAuditTotalCount] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [debouncedAuditSearch, setDebouncedAuditSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAuditSearch(auditSearch);
      setAuditPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [auditSearch]);

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
      console.error(err);
    }
  };

  const fetchAuditLogs = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch(`/api/v1/admin/audit-logs?page=${auditPage}&limit=${auditLimit}&search=${encodeURIComponent(debouncedAuditSearch)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
           setAuditLogs(data as AuditLog[]);
        } else {
           setAuditLogs(data.data as AuditLog[]);
           setAuditTotalPages(data.totalPages);
           setAuditTotalCount(data.totalCount);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPSPs();
  }, []);

  useEffect(() => {
    if (activeTab === "audit") {
      fetchAuditLogs();
    }
  }, [activeTab, auditPage, auditLimit, debouncedAuditSearch]);

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
        {!showAddForm && activeTab === "operators" && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            <UserPlus size={16} />
            Onboard Operator
          </button>
        )}
      </div>

      <div className="tabs" style={{ display: "flex", gap: "1rem", marginBottom: "2rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "1rem" }}>
        <button 
          className={`btn ${activeTab === "operators" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("operators")}
        >
          Operators
        </button>
        <button 
          className={`btn ${activeTab === "audit" ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setActiveTab("audit")}
        >
          Audit Logs
        </button>
      </div>

      {activeTab === "operators" ? (
        <>
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
        </>
      ) : (
        <div className="card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>System Audit Logs</h2>
            <div style={{ position: "relative" }}>
              <Search size={16} className="text-muted" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
              <input 
                type="text" 
                placeholder="Search action..." 
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="input"
                style={{ paddingLeft: "32px", width: "250px", height: "36px" }}
              />
            </div>
          </div>
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity Type</th>
                  <th>Entity ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: "center", padding: "2rem" }}>No audit logs found.</td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{log.actorName || "System"}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{log.actorEmail || log.actorRole || "Automated"}</div>
                      </td>
                      <td>
                        <Badge variant="neutral">{log.action}</Badge>
                      </td>
                      <td>{log.entityType}</td>
                      <td><code style={{ fontSize: "0.8rem", background: "var(--surface-hover)", padding: "0.2rem 0.4rem", borderRadius: "4px" }}>{log.entityId}</code></td>
                      <td style={{ maxWidth: "200px" }}>
                        {log.meta && (
                          <details>
                            <summary style={{ cursor: "pointer", fontSize: "0.85rem", color: "var(--primary-color)" }}>View JSON</summary>
                            <pre style={{ fontSize: "0.75rem", background: "var(--surface-hover)", padding: "0.5rem", borderRadius: "4px", marginTop: "0.5rem", overflowX: "auto" }}>
                              {log.meta}
                            </pre>
                          </details>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          
          {auditLogs.length > 0 && (
            <div className="flex items-center justify-between" style={{ padding: "1rem", marginTop: "1rem", borderTop: "1px solid var(--border-color)" }}>
              <p className="text-sm text-muted">
                Showing {(auditPage - 1) * auditLimit + 1} to {Math.min(auditPage * auditLimit, auditTotalCount)} of {auditTotalCount} logs
              </p>
              <div className="flex gap-2">
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={auditPage === 1}
                  onClick={() => setAuditPage(p => p - 1)}
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <button 
                  className="btn btn-secondary btn-sm" 
                  disabled={auditPage === auditTotalPages}
                  onClick={() => setAuditPage(p => p + 1)}
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

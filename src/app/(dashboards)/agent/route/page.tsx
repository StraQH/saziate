"use client";

import { useState, useEffect } from "react";
import { MOCK_COLLECTIONS, type CollectionRun, MOCK_PSP_ID, MOCK_ROUTE_ID } from "@/lib/mockdata";
import { Badge } from "@/components/ui/Badge";
import { MapPin, Navigation, CheckCircle2, XCircle, AlertCircle, Camera, Check } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";

export default function AgentRoutePage() {
  const { user } = useSession();
  const [collections, setCollections] = useState<CollectionRun[]>(config.isMockMode ? MOCK_COLLECTIONS : []);
  const [selectedTask, setSelectedTask] = useState<CollectionRun | null>(null);
  const [status, setStatus] = useState<"collected" | "no_access" | "no_waste">("collected");
  const [notes, setNotes] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchCollections = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    const res = await repo.getCollections();
    if (Array.isArray(res)) {
      setCollections(res);
    } else {
      setCollections(res.data);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCollections();
  }, [user]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    setIsSyncing(true);

    if (config.isMockMode) {
      setTimeout(() => {
        setCollections((prev) =>
          prev.map((c) =>
            c.id === selectedTask.id
              ? {
                  ...c,
                  status,
                  loggedBy: "Field Agent Johnson",
                  loggedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today",
                }
              : c
          )
        );
        setSelectedTask(null);
        setNotes("");
        setIsSyncing(false);
      }, 800);
      return;
    }

    try {
      const res = await fetch("/api/v1/collections/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          routeId: config.isMockMode ? "route_lekki_1" : "", // TODO: Pass actual routeId from context or task
          residentId: selectedTask.id,
          status,
          notes,
          loggedAt: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        alert("Collection logged successfully!");
        fetchCollections();
        setSelectedTask(null);
        setNotes("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmTransfer = async () => {
    const reference = prompt("Enter the Paystack Transfer Reference provided by the resident:");
    if (!reference) return;

    if (config.isMockMode) {
      alert("Transfer verified in mock mode.");
      return;
    }

    try {
      const res = await fetch("/api/v1/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      if (res.ok) {
        alert("Transfer verified and invoice reconciled successfully!");
        fetchCollections();
      } else {
        const text = await res.text();
        alert(`Verification failed: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert("An error occurred during verification.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Active Route Streets</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            {config.isMockMode ? "Lekki Res Zone A \u2022 assigned today \u2022 Schedule: Mondays & Thursdays" : "Active Route"}
          </p>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: selectedTask ? "1fr 1fr" : "1fr", gap: "2rem", alignItems: "start" }}>
        {/* Task list */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Resident Collection Queue</h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
            {collections.map((item) => (
              <div
                key={item.id}
                onClick={() => setSelectedTask(item)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "1rem",
                  border: selectedTask?.id === item.id ? "2px solid var(--color-primary)" : "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  cursor: "pointer",
                  background: selectedTask?.id === item.id ? "var(--color-primary-light)" : "var(--color-surface)",
                  transition: "all 0.15s",
                }}
              >
                <div>
                  <p className="font-semibold">{item.residentName}</p>
                  <p className="text-xs text-muted flex items-center gap-1" style={{ marginTop: "0.25rem" }}>
                    <MapPin size={12} /> {item.address}
                  </p>
                </div>
                <Badge
                  variant={
                    item.status === "collected"
                      ? "success"
                      : item.status === "pending"
                      ? "neutral"
                      : "warning"
                  }
                >
                  {item.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Log Status Action panel */}
        {selectedTask && (
          <div className="card">
            <h3 style={{ marginBottom: "0.25rem" }}>Log Collection Status</h3>
            <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
              Selected: <span className="font-semibold text-text">{selectedTask.residentName}</span>
            </p>

            <form onSubmit={handleLogSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="form-group">
                <label className="label">Status Result</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.875rem",
                      border: "1.5px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      backgroundColor: status === "collected" ? "var(--color-primary-light)" : "transparent",
                      borderColor: status === "collected" ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="collected"
                      checked={status === "collected"}
                      onChange={() => setStatus("collected")}
                      style={{ display: "none" }}
                    />
                    <CheckCircle2 size={20} style={{ color: "var(--color-success)" }} />
                    <div>
                      <p className="font-medium text-sm">Collected</p>
                      <p className="text-xs text-muted">Waste collected successfully.</p>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.875rem",
                      border: "1.5px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      backgroundColor: status === "no_waste" ? "var(--color-primary-light)" : "transparent",
                      borderColor: status === "no_waste" ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="no_waste"
                      checked={status === "no_waste"}
                      onChange={() => setStatus("no_waste")}
                      style={{ display: "none" }}
                    />
                    <XCircle size={20} style={{ color: "var(--color-warning)" }} />
                    <div>
                      <p className="font-medium text-sm">No Waste Set Out</p>
                      <p className="text-xs text-muted">No bin or waste visible outside the residence.</p>
                    </div>
                  </label>

                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      padding: "0.875rem",
                      border: "1.5px solid var(--color-border)",
                      borderRadius: "var(--radius-sm)",
                      cursor: "pointer",
                      backgroundColor: status === "no_access" ? "var(--color-primary-light)" : "transparent",
                      borderColor: status === "no_access" ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="no_access"
                      checked={status === "no_access"}
                      onChange={() => setStatus("no_access")}
                      style={{ display: "none" }}
                    />
                    <AlertCircle size={20} style={{ color: "var(--color-danger)" }} />
                    <div>
                      <p className="font-medium text-sm">No Access</p>
                      <p className="text-xs text-muted">Gate locked or access blocked by vehicles.</p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Photo Proof (Optional for verification)</label>
                <div
                  style={{
                    border: "2px dashed var(--color-border)",
                    borderRadius: "var(--radius-sm)",
                    padding: "1.5rem",
                    textAlign: "center",
                    cursor: "pointer",
                  }}
                >
                  <Camera size={24} style={{ color: "var(--color-text-muted)", marginBottom: "0.5rem" }} />
                  <p className="text-xs text-muted">Tap to snap or upload a photo</p>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Notes / Remarks</label>
                <input
                  type="text"
                  className="input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. resident was not home"
                />
              </div>

              <div className="divider" style={{ margin: "0.5rem 0" }} />

              <div className="flex justify-end gap-3">
                <button type="button" className="btn btn-ghost" onClick={() => setSelectedTask(null)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSyncing}>
                  {isSyncing ? "Saving Log..." : "Log Drop"}
                </button>
              </div>
            </form>

            <div className="divider" style={{ margin: "1.5rem 0" }} />
            
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Payment Actions</h4>
              <p className="text-xs text-muted" style={{ marginBottom: "0.5rem" }}>
                Use these options if the resident has an unpaid bill and wishes to pay on the spot.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => alert("Redirecting to Cash Logging...")}>
                  Receive Cash Payment
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleConfirmTransfer}>
                  Confirm Transfer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

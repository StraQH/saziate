"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { MOCK_SERVICES, type ServiceRun } from "@/lib/mockdata";
import { Badge } from "@/components/ui/Badge";
import { MapPin, CheckCircle2, XCircle, AlertCircle, Camera } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { PromptModal, AlertModal } from "@/components/ui/Modal";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";

export default function AgentRoutePage() {
  const { user } = useSession();
  const [unit1Label, setUnit1Label] = useState("Primary Unit");
  const [unit2Label, setUnit2Label] = useState("Secondary Unit");
  const { toast } = useToast();
  const [services, setServices] = useState<ServiceRun[]>([]);
  const [activeZones, setActiveZones] = useState<{id: string, name: string, residentCount: number}[]>([]);
  const [viewMode, setViewMode] = useState<"zones" | "residents">("zones");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedTask, setSelectedTask] = useState<ServiceRun | null>(null);
  const [status, setStatus] = useState<"completed" | "no_access" | "no_service">("completed");
  const [notes, setNotes] = useState("");
  const [isSyncing, setIsSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignedZone, setAssignedZone] = useState("Active Zone");
  const [serviceSchedule, setServiceSchedule] = useState("");
  const [unit1Count, setUnit1Count] = useState(0);
  const [unit2Count, setUnit2Count] = useState(0);
  const [promptModal, setPromptModal] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: "info" | "success" | "warning" | "danger" }>({ isOpen: false, title: "", message: "", type: "info" });

  useEffect(() => {
    setStatus("completed");
    setNotes("");
    setUnit1Count(0);
    setUnit2Count(0);
  }, [selectedTask]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchServices = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.orgId!);
    try {
      const res = await repo.getServices(1, 100, debouncedSearch, "agent") as any;
      if (res.view === "zones") {
        setActiveZones(res.data);
        setViewMode("zones");
      } else {
        setServices(res.data);
        setViewMode("residents");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAgentRoute = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/agent/zone");
      if (res.ok) {
        const body = await res.json() as any;
        setAssignedZone(body.zone || "Active Zone");
        setServiceSchedule(body.schedule || "");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOrgUnitLabels = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/org/settings");
      if (res.ok) {
        const body = await res.json() as any;
        if (body.unit1Name) setUnit1Label(body.unit1Name);
        if (body.unit2Name) setUnit2Label(body.unit2Name);
      }
    } catch (err) {
      console.error("Failed to fetch unit labels:", err);
    }
  };

  useEffect(() => {
    fetchServices();
  }, [debouncedSearch, user]);

  useEffect(() => {
    fetchAgentRoute();
    fetchOrgUnitLabels();
  }, [user]);

  const handleLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;
    setIsSyncing(true);

    if (config.isMockMode) {
      setTimeout(() => {
        setServices((prev) =>
          prev.map((c) =>
            c.id === selectedTask.id
              ? { ...c, status, loggedBy: "Field Agent", loggedAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " Today" }
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
      const res = await fetch("/api/v1/services/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId: (selectedTask as any).zoneId,
          residentId: selectedTask.id,
          status,
          notes,
          unit1Count: (selectedTask as any).billingModel === "on_demand" ? unit1Count : 0,
          unit2Count: (selectedTask as any).billingModel === "on_demand" ? unit2Count : 0,
          loggedAt: new Date().toISOString(),
        }),
      });

      if (res.ok) {
        setAlertModal({ isOpen: true, title: "Success", message: "Service logged successfully!", type: "success" });
        fetchServices();
        setSelectedTask(null);
        setNotes("");
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConfirmTransferClick = () => {
    setPromptModal(true);
  };

  const executeConfirmTransfer = async (reference: string) => {
    if (!reference) return;

    if (config.isMockMode) {
      setAlertModal({ isOpen: true, title: "Mock Mode", message: "Transfer verified in mock mode.", type: "success" });
      return;
    }

    try {
      const res = await fetch("/api/v1/payments/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference }),
      });
      if (res.ok) {
        setAlertModal({ isOpen: true, title: "Verified", message: "Transfer verified and invoice reconciled successfully!", type: "success" });
        fetchServices();
      } else {
        const text = await res.text();
        setAlertModal({ isOpen: true, title: "Verification Failed", message: `Verification failed: ${text}`, type: "danger" });
      }
    } catch (err) {
      console.error(err);
      setAlertModal({ isOpen: true, title: "Error", message: "An error occurred during verification.", type: "danger" });
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Log Services</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Log service collections for residents.
          </p>
        </div>
      </div>

      <div style={{ marginBottom: "2rem" }}>
        <input 
          type="text" 
          placeholder="Search for a resident by name or address to log a service..." 
          className="input" 
          style={{ width: "100%", maxWidth: "600px", padding: "0.75rem 1rem", fontSize: "1rem" }}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <p className="text-xs text-muted" style={{ marginTop: "0.5rem" }}>
          Use the search bar to log collections for any resident, even if they are not scheduled for today.
        </p>
      </div>

      <div className="grid" style={{ gridTemplateColumns: selectedTask ? "1fr 1fr" : "1fr", gap: "2rem", alignItems: "start" }}>
        {/* Task list or Zones list */}
        <div className="card" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600 }}>
            {viewMode === "zones" ? "Zones Scheduled Today" : "Search Results"}
          </h2>
          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
            {loading && !config.isMockMode && <p className="text-muted text-sm">Loading...</p>}
            
            {viewMode === "zones" && !loading && (
              activeZones.length === 0 ? (
                <p className="text-muted text-sm">No zones scheduled for service today.</p>
              ) : (
                activeZones.map(zone => (
                  <div key={zone.id} style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "1rem",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-md)",
                    background: "var(--color-surface)",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <MapPin size={16} style={{ color: "var(--color-primary)" }} />
                      <p className="font-semibold">{zone.name}</p>
                    </div>
                    <Badge variant="neutral">{zone.residentCount} residents</Badge>
                  </div>
                ))
              )
            )}

            {viewMode === "residents" && !loading && (
              services.length === 0 ? (
                <p className="text-muted text-sm">No residents found.</p>
              ) : (
                services.map((item) => (
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
                        item.status === "completed"
                          ? "success"
                          : item.status === "pending"
                          ? "neutral"
                          : "warning"
                      }
                    >
                      {item.status.toUpperCase()}
                    </Badge>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* Log Status Action panel */}
        {selectedTask && (
          <div className="card">
            <h3 style={{ marginBottom: "0.25rem" }}>Log Service Status</h3>
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
                      backgroundColor: status === "completed" ? "var(--color-primary-light)" : "transparent",
                      borderColor: status === "completed" ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="completed"
                      checked={status === "completed"}
                      onChange={() => setStatus("completed")}
                      style={{ display: "none" }}
                    />
                    <CheckCircle2 size={20} style={{ color: "var(--color-success)" }} />
                    <div>
                      <p className="font-medium text-sm">Completed</p>
                      <p className="text-xs text-muted">Service completed successfully.</p>
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
                      backgroundColor: status === "no_service" ? "var(--color-primary-light)" : "transparent",
                      borderColor: status === "no_service" ? "var(--color-primary)" : "var(--color-border)",
                    }}
                  >
                    <input
                      type="radio"
                      name="status"
                      value="no_service"
                      checked={status === "no_service"}
                      onChange={() => setStatus("no_service")}
                      style={{ display: "none" }}
                    />
                    <XCircle size={20} style={{ color: "var(--color-warning)" }} />
                    <div>
                      <p className="font-medium text-sm">No Service</p>
                      <p className="text-xs text-muted">Service could not be rendered at this address.</p>
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
                      <p className="text-xs text-muted">Gate locked or access blocked.</p>
                    </div>
                  </label>
                </div>
              </div>

              {(selectedTask as any).billingModel === "on_demand" && status === "completed" && (
                <div style={{ background: "var(--color-primary-light)", border: "1px solid var(--color-primary)", borderRadius: "var(--radius-sm)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                  <h4 style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-primary)", margin: 0 }}>On-Demand Quantities</h4>
                  <p className="text-xs text-muted" style={{ margin: 0, lineHeight: 1.4 }}>
                    Specify the number of units. Rates:{" "}
                    <strong>{unit1Label}: {config.locality.symbol}{(selectedTask as any).onDemandUnit1Rate || 0}</strong>,{" "}
                    <strong>{unit2Label}: {config.locality.symbol}{(selectedTask as any).onDemandUnit2Rate || 0}</strong>.
                  </p>
                  <div style={{ display: "flex", gap: "1.5rem" }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.375rem" }}>{unit1Label}s</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", minWidth: "32px" }} onClick={() => setUnit1Count(prev => Math.max(0, prev - 1))}>-</button>
                        <span style={{ fontWeight: 600, fontSize: "1rem", minWidth: "24px", textAlign: "center" }}>{unit1Count}</span>
                        <button type="button" className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", minWidth: "32px" }} onClick={() => setUnit1Count(prev => prev + 1)}>+</button>
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, marginBottom: "0.375rem" }}>{unit2Label}s</label>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <button type="button" className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", minWidth: "32px" }} onClick={() => setUnit2Count(prev => Math.max(0, prev - 1))}>-</button>
                        <span style={{ fontWeight: 600, fontSize: "1rem", minWidth: "24px", textAlign: "center" }}>{unit2Count}</span>
                        <button type="button" className="btn btn-secondary" style={{ padding: "0.25rem 0.75rem", minWidth: "32px" }} onClick={() => setUnit2Count(prev => prev + 1)}>+</button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="label">Photo Proof (Optional)</label>
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
                  {isSyncing ? "Saving Log..." : "Log Service"}
                </button>
              </div>
            </form>

            <div className="divider" style={{ margin: "1.5rem 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <h4 style={{ fontSize: "0.875rem", fontWeight: 600 }}>Payment Actions</h4>
              <p className="text-xs text-muted" style={{ marginBottom: "0.5rem" }}>
                Use these options if the customer wishes to pay on the spot.
              </p>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => toast("Redirecting to Cash Logging...", "info")}>
                  Receive Cash Payment
                </button>
                <button className="btn btn-secondary btn-sm" onClick={handleConfirmTransferClick}>
                  Verify Transfer
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <PromptModal
        isOpen={promptModal}
        onClose={() => setPromptModal(false)}
        onSubmit={executeConfirmTransfer}
        title="Verify Transfer"
        message="Enter the Payment Reference provided by the customer:"
        placeholder="e.g. T49929291"
        submitText="Verify"
      />

      <AlertModal
        isOpen={alertModal.isOpen}
        onClose={() => setAlertModal({ ...alertModal, isOpen: false })}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
    </div>
  );
}

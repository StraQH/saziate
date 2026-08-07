"use client";

import { useState, useEffect } from "react";
import { PlusCircle, MapPin, DollarSign, User, ShieldAlert, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatCurrency } from "@/lib/utils";
import { MOCK_ZONES, type Zone, MOCK_ORG_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";
import { AlertModal } from "@/components/ui/Modal";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

const formatScheduleString = (days: string[]) => {
  if (days.length === 0) return "No service scheduled";
  const mapped = days.map((d) => `${d}s`);
  if (mapped.length === 1) return mapped[0];
  if (mapped.length === 2) return `${mapped[0]} & ${mapped[1]}`;
  return mapped.slice(0, -1).join(", ") + " & " + mapped[mapped.length - 1];
};

export default function OrgRoutesPage() {
  const { user } = useSession();
  const [zones, setZones] = useState<Zone[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: "info" | "success" | "warning" | "danger" }>({ isOpen: false, title: "", message: "", type: "info" });
  const [error, setError] = useState("");
  const [editZoneId, setEditZoneId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Monday", "Thursday"]);
  const [assignedAgent, setAssignedAgent] = useState("");
  const [residentialRate, setResidentialRate] = useState(config.locality.rates.general.residential.toString());
  const [commercialRate, setCommercialRate] = useState(config.locality.rates.general.commercial.toString());
  const [industrialRate, setIndustrialRate] = useState(config.locality.rates.general.industrial.toString());
  const [healthRate, setHealthRate] = useState(config.locality.rates.general.health.toString());

  const fetchRoutes = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.orgId!);
    repo.getZones().then((data) => {
      setZones(data as any);
      setLoading(false);
    });
  };

  const fetchAgents = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/v1/org/agents");
      if (res.ok) {
        const data = await res.json() as any[];
        setAgents(data as any);
        if (data.length > 0) {
          setAssignedAgent(data[0].id as any);
        }
      }
    } catch (err) {
      console.error("Failed to load agents:", err);
    }
  };

  useEffect(() => {
    fetchRoutes();
    fetchAgents();
  }, [user]);

  const handleUpdateAgent = async (routeId: string, agentId: string) => {
    try {
      const res = await fetch("/api/v1/zones", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zoneId: routeId, agentId: agentId || null }),
      });
      if (!res.ok) {
        throw new Error("Failed to reassign agent");
      }
      fetchRoutes();
    } catch (err) {
      console.error(err);
      setAlertModal({ isOpen: true, title: "Reassignment Failed", message: "Failed to reassign agent.", type: "danger" });
    }
  };

  const handleEdit = (zone: any) => {
    setName(zone.name);
    setDescription(zone.description || "");
    if (zone.serviceSchedule && zone.serviceSchedule !== "No service scheduled") {
      const parts = zone.serviceSchedule.replace(/s\b/g, '').split(/, | & /);
      setSelectedDays(parts.filter((p: string) => WEEKDAYS.includes(p)));
    } else {
      setSelectedDays([]);
    }
    setAssignedAgent(zone.assignedAgentId || "");
    setResidentialRate(zone.rates?.find((r: any) => r.category === "residential")?.monthlyRate?.toString() || config.locality.rates.general.residential.toString());
    setCommercialRate(zone.rates?.find((r: any) => r.category === "commercial")?.monthlyRate?.toString() || config.locality.rates.general.commercial.toString());
    setIndustrialRate(zone.rates?.find((r: any) => r.category === "industrial")?.monthlyRate?.toString() || config.locality.rates.general.industrial.toString());
    setHealthRate(zone.rates?.find((r: any) => r.category === "health")?.monthlyRate?.toString() || config.locality.rates.general.health.toString());
    
    setEditZoneId(zone.id);
    setShowAddForm(true);
  };

  const resetForm = () => {
    setName("");
    setDescription("");
    setSelectedDays(["Monday", "Thursday"]);
    setAssignedAgent(agents.length > 0 ? agents[0].id : "");
    setResidentialRate(config.locality.rates.general.residential.toString());
    setCommercialRate(config.locality.rates.general.commercial.toString());
    setIndustrialRate(config.locality.rates.general.industrial.toString());
    setHealthRate(config.locality.rates.general.health.toString());
    setEditZoneId(null);
    setShowAddForm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    setError("");
    setSubmitLoading(true);

    try {
      const resRate = parseFloat(residentialRate) || 0;
      const commRate = parseFloat(commercialRate) || 0;
      const indRate = parseFloat(industrialRate) || 0;
      const hRate = parseFloat(healthRate) || 0;

      const computedSchedule = formatScheduleString(selectedDays);

      if (config.isMockMode) {
        const newZone: Zone = {
          id: crypto.randomUUID(),
          name,
          description,
          serviceSchedule: computedSchedule,
          assignedAgent: agents.find((a) => a.id === assignedAgent)?.name || "Unassigned",
          rates: [
            { category: "residential", monthlyRate: resRate },
            { category: "commercial", monthlyRate: commRate },
            { category: "industrial", monthlyRate: indRate },
            { category: "health", monthlyRate: hRate }
          ],
        };
        setZones((prev) => [...prev, newZone]);
        setName("");
        setDescription("");
        setSelectedDays(["Monday", "Thursday"]);
        setShowAddForm(false);
        return;
      }

      // Live POST or PATCH to database
      const method = editZoneId ? "PATCH" : "POST";
      const payload: any = {
        name,
        description,
        serviceSchedule: computedSchedule,
        agentId: assignedAgent || undefined,
        rates: [
          { category: "residential", monthlyRate: resRate },
          { category: "commercial", monthlyRate: commRate },
          { category: "industrial", monthlyRate: indRate },
          { category: "health", monthlyRate: hRate }
        ],
      };
      
      if (editZoneId) {
        payload.zoneId = editZoneId;
      }

      const response = await fetch("/api/v1/zones", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to create zone.");
      }

      const resBody = await response.json() as any;
      const newZone: Zone = {
        id: String(resBody.routeId),
        name,
        description,
        serviceSchedule: computedSchedule,
        assignedAgent: "",
        assignedAgentName: agents.find((a) => a.id === assignedAgent)?.name || "Unassigned",
        rates: [
          { category: "residential", monthlyRate: resRate },
          { category: "commercial", monthlyRate: commRate },
          { category: "industrial", monthlyRate: indRate },
          { category: "health", monthlyRate: hRate }
        ],
      };

      if (editZoneId) {
        setZones((prev) => prev.map((z) => (z.id === editZoneId ? newZone : z)));
      } else {
        setZones((prev) => [...prev, newZone]);
      }
      resetForm();
    } catch (err: any) {
      setError((err as Error).message || "An error occurred.");
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Zones & Batch Rates</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Configure default billing rates for different categories per zone.
          </p>
        </div>
        {!showAddForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            <PlusCircle size={16} />
            Create Zone
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>{editZoneId ? "Edit Zone" : "Create New Zone"}</h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Zone Name</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. South Residential Zone"
                required
              />
            </div>

            <div className="form-group">
              <label className="label">Description</label>
              <input
                type="text"
                className="input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Street listings or area coverage notes..."
              />
            </div>

            <div className="form-group">
              <label className="label" style={{ marginBottom: "0.5rem" }}>Service Schedule</label>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                {WEEKDAYS.map((day, index) => {
                  const isSelected = selectedDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => {
                        setSelectedDays((prev) =>
                          prev.includes(day)
                            ? prev.filter((d) => d !== day)
                            : [...prev, day].sort((a, b) => WEEKDAYS.indexOf(a) - WEEKDAYS.indexOf(b))
                        );
                      }}
                      style={{
                        width: "36px",
                        height: "36px",
                        borderRadius: "50%",
                        border: isSelected ? "1px solid var(--color-primary, #2563eb)" : "1px solid var(--color-border, #334155)",
                        backgroundColor: isSelected ? "var(--color-primary, #2563eb)" : "transparent",
                        color: isSelected ? "#ffffff" : "var(--color-text-muted, #94a3b8)",
                        fontSize: "0.875rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                      }}
                    >
                      {WEEKDAYS_SHORT[index]}
                    </button>
                  );
                })}
              </div>
              <p className="text-muted text-xs" style={{ marginTop: "0.25rem" }}>
                Generated Schedule: <span className="font-semibold text-primary" style={{ color: "var(--color-primary, #2563eb)" }}>{formatScheduleString(selectedDays)}</span>
              </p>
            </div>

            <div className="form-group">
              <label className="label">Assigned Field Agent</label>
              <select
                className="select"
                value={assignedAgent}
                onChange={(e) => setAssignedAgent(e.target.value)}
              >
                <option value="">Unassigned</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <h4 style={{ margin: "1rem 0 0.5rem" }}>Default Rates (₦ / month)</h4>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem" }}>
                <div className="form-group">
                  <label className="label">Residential</label>
                  <input
                    type="number"
                    className="input"
                    value={residentialRate}
                    onChange={(e) => setResidentialRate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">Commercial</label>
                  <input
                    type="number"
                    className="input"
                    value={commercialRate}
                    onChange={(e) => setCommercialRate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">Industrial</label>
                  <input
                    type="number"
                    className="input"
                    value={industrialRate}
                    onChange={(e) => setIndustrialRate(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="label">Health Facilities</label>
                  <input
                    type="number"
                    className="input"
                    value={healthRate}
                    onChange={(e) => setHealthRate(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {error && (
              <div 
                style={{ 
                  background: "var(--color-danger-bg)", 
                  border: "1px solid var(--color-danger)",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.875rem",
                  color: "var(--color-danger)",
                  fontSize: "0.875rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem"
                }}
              >
                <ShieldAlert size={16} />
                <span>{error}</span>
              </div>
            )}

            <div className="divider" style={{ margin: "0.5rem 0" }} />

            <div className="flex justify-end gap-3">
              <button type="button" className="btn btn-ghost" onClick={resetForm} disabled={submitLoading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitLoading}>
                {submitLoading ? "Saving Zone..." : (editZoneId ? "Update Zone" : "Save Zone")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Zones Grid */}
      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Zone Name</th>
                <th>Description</th>
                <th>Service Schedule</th>
                <th>Assigned Agent</th>
                <th>Default Billing Rates (NGN)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => (
                <tr key={zone.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <MapPin size={16} style={{ color: "var(--color-primary)" }} />
                      <span className="font-medium">{zone.name}</span>
                    </div>
                  </td>
                  <td className="text-sm text-muted">{zone.description}</td>
                  <td className="text-sm">
                    {zone.serviceSchedule ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Calendar size={14} style={{ color: "var(--color-primary)" }} />
                        <span>{zone.serviceSchedule}</span>
                      </div>
                    ) : "Not Set"}
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", height: "32px", minWidth: "150px" }}
                      value={zone.assignedAgentId || ""}
                      onChange={(e) => handleUpdateAgent(zone.id, e.target.value)}
                    >
                      <option value="">-- Unassigned --</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", fontSize: "0.75rem" }}>
                      <Badge variant="neutral">Res: {formatCurrency(zone.rates?.find((r: any) => r.category === "residential")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Com: {formatCurrency(zone.rates?.find((r: any) => r.category === "commercial")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Ind: {formatCurrency(zone.rates?.find((r: any) => r.category === "industrial")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Hlt: {formatCurrency(zone.rates?.find((r: any) => r.category === "health")?.monthlyRate || 0)}</Badge>
                    </div>
                  </td>
                  <td>
                    <button className="btn btn-secondary btn-sm" onClick={() => handleEdit(zone)}>
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

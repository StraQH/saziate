"use client";

import { useState, useEffect } from "react";
import { PlusCircle, MapPin, DollarSign, User, ShieldAlert, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatNaira } from "@/lib/utils";
import { MOCK_ROUTES, type Route, MOCK_PSP_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAYS_SHORT = ["M", "T", "W", "T", "F", "S", "S"];

const formatScheduleString = (days: string[]) => {
  if (days.length === 0) return "No collection scheduled";
  const mapped = days.map((d) => `${d}s`);
  if (mapped.length === 1) return mapped[0];
  if (mapped.length === 2) return `${mapped[0]} & ${mapped[1]}`;
  return mapped.slice(0, -1).join(", ") + " & " + mapped[mapped.length - 1];
};

export default function PSPRoutesPage() {
  const { user } = useSession();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Monday", "Thursday"]);
  const [assignedAgent, setAssignedAgent] = useState("");
  const [residentialRate, setResidentialRate] = useState(config.DEFAULT_MONTHLY_RATE_NGN.toString());
  const [commercialRate, setCommercialRate] = useState(config.DEFAULT_COMMERCIAL_RATE_NGN.toString());
  const [industrialRate, setIndustrialRate] = useState(config.DEFAULT_INDUSTRIAL_RATE_NGN.toString());
  const [healthRate, setHealthRate] = useState(config.DEFAULT_HEALTH_RATE_NGN.toString());

  const fetchRoutes = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    repo.getRoutes().then((data) => {
      setRoutes(data as any);
      setLoading(false);
    });
  };

  const fetchAgents = async () => {
    if (!user) return;
    try {
      const res = await fetch("/api/v1/psp/agents");
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
      const res = await fetch("/api/v1/routes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeId, agentId: agentId || null }),
      });
      if (!res.ok) {
        throw new Error("Failed to reassign agent");
      }
      fetchRoutes();
    } catch (err) {
      console.error(err);
      alert("Failed to reassign agent.");
    }
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
        const newRoute: Route = {
          id: crypto.randomUUID(),
          name,
          description,
          collectionSchedule: computedSchedule,
          assignedAgent: agents.find((a) => a.id === assignedAgent)?.name || "Unassigned",
          rates: [
            { category: "residential", monthlyRate: resRate },
            { category: "commercial", monthlyRate: commRate },
            { category: "industrial", monthlyRate: indRate },
            { category: "health", monthlyRate: hRate }
          ],
        };
        setRoutes((prev) => [...prev, newRoute]);
        setName("");
        setDescription("");
        setSelectedDays(["Monday", "Thursday"]);
        setShowAddForm(false);
        return;
      }

      // Live POST write to D1 database
      const response = await fetch("/api/v1/routes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          collectionSchedule: computedSchedule,
          agentId: assignedAgent || undefined,
          rates: [
            { category: "residential", monthlyRate: resRate },
            { category: "commercial", monthlyRate: commRate },
            { category: "industrial", monthlyRate: indRate },
            { category: "health", monthlyRate: hRate }
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to create route.");
      }

      const resBody = await response.json() as any;
      const newRoute: Route = {
        id: String(resBody.routeId),
        name,
        description,
        collectionSchedule: computedSchedule,
        assignedAgent: "",
        assignedAgentName: agents.find((a) => a.id === assignedAgent)?.name || "Unassigned",
        rates: [
          { category: "residential", monthlyRate: resRate },
          { category: "commercial", monthlyRate: commRate },
          { category: "industrial", monthlyRate: indRate },
          { category: "health", monthlyRate: hRate }
        ],
      };

      setRoutes((prev) => [...prev, newRoute]);
      setName("");
      setDescription("");
      setSelectedDays(["Monday", "Thursday"]);
      setShowAddForm(false);
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
          <h1>Routes & Batch Rates</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Configure default billing rates for different categories per route zone.
          </p>
        </div>
        {!showAddForm && (
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddForm(true)}>
            <PlusCircle size={16} />
            Create Route
          </button>
        )}
      </div>

      {showAddForm && (
        <div className="card" style={{ marginBottom: "2rem" }}>
          <h3 style={{ marginBottom: "1rem" }}>Create New Route</h3>
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Route Name</label>
              <input
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Lekki Res Zone D"
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
              <label className="label" style={{ marginBottom: "0.5rem" }}>Collection Schedule</label>
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
              <button type="button" className="btn btn-ghost" onClick={() => setShowAddForm(false)} disabled={submitLoading}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitLoading}>
                {submitLoading ? "Saving Route..." : "Save Route"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Routes Grid */}
      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Route Name</th>
                <th>Description</th>
                <th>Collection Schedule</th>
                <th>Assigned Agent</th>
                <th>Default Billing Rates (NGN)</th>
              </tr>
            </thead>
            <tbody>
              {routes.map((route) => (
                <tr key={route.id}>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <MapPin size={16} style={{ color: "var(--color-primary)" }} />
                      <span className="font-medium">{route.name}</span>
                    </div>
                  </td>
                  <td className="text-sm text-muted">{route.description}</td>
                  <td className="text-sm">
                    {route.collectionSchedule ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <Calendar size={14} style={{ color: "var(--color-primary)" }} />
                        <span>{route.collectionSchedule}</span>
                      </div>
                    ) : "Not Set"}
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ padding: "0.25rem 0.5rem", fontSize: "0.875rem", height: "32px", minWidth: "150px" }}
                      value={route.assignedAgentId || ""}
                      onChange={(e) => handleUpdateAgent(route.id, e.target.value)}
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
                      <Badge variant="neutral">Res: {formatNaira(route.rates?.find((r: any) => r.category === "residential")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Com: {formatNaira(route.rates?.find((r: any) => r.category === "commercial")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Ind: {formatNaira(route.rates?.find((r: any) => r.category === "industrial")?.monthlyRate || 0)}</Badge>
                      <Badge variant="neutral">Hlt: {formatNaira(route.rates?.find((r: any) => r.category === "health")?.monthlyRate || 0)}</Badge>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

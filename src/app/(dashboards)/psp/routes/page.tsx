"use client";

import { useState, useEffect } from "react";
import { PlusCircle, MapPin, DollarSign, User, ShieldAlert, Calendar } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { formatNaira } from "@/lib/utils";
import { MOCK_ROUTES, type Route, MOCK_PSP_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";

export default function PSPRoutesPage() {
  const { user } = useSession();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState("");

  // Form states
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [collectionSchedule, setCollectionSchedule] = useState("Mondays & Thursdays");
  const [assignedAgent, setAssignedAgent] = useState("Field Agent Johnson");
  const [residentialRate, setResidentialRate] = useState("6000");
  const [commercialRate, setCommercialRate] = useState("15000");
  const [industrialRate, setIndustrialRate] = useState("45000");
  const [healthRate, setHealthRate] = useState("30000");

  const fetchRoutes = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    repo.getRoutes().then((data) => {
      setRoutes(data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchRoutes();
  }, [user]);

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

      if (config.isMockMode) {
        const newRoute: Route = {
          id: crypto.randomUUID(),
          name,
          description,
          collectionSchedule,
          assignedAgent,
          rates: {
            residential: resRate,
            commercial: commRate,
            industrial: indRate,
            health: hRate,
          },
        };
        setRoutes((prev) => [...prev, newRoute]);
        setName("");
        setDescription("");
        setCollectionSchedule("Mondays & Thursdays");
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
          collectionSchedule,
          assignedAgentId: "ag_johnson", // Field Agent Johnson
          rates: {
            residential: resRate,
            commercial: commRate,
            industrial: indRate,
            health: hRate,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Failed to create route.");
      }

      const resBody = await response.json() as any;
      const newRoute: Route = {
        id: resBody.routeId,
        name,
        description,
        collectionSchedule,
        assignedAgent,
        rates: {
          residential: resRate,
          commercial: commRate,
          industrial: indRate,
          health: hRate,
        },
      };

      setRoutes((prev) => [...prev, newRoute]);
      setName("");
      setDescription("");
      setCollectionSchedule("Mondays & Thursdays");
      setShowAddForm(false);
    } catch (err: any) {
      setError(err.message || "An error occurred.");
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
              <label className="label">Collection Schedule</label>
              <input
                type="text"
                className="input"
                value={collectionSchedule}
                onChange={(e) => setCollectionSchedule(e.target.value)}
                placeholder="e.g. Mondays & Thursdays"
                required
              />
            </div>

            <div className="form-group">
              <label className="label">Assigned Field Agent</label>
              <select
                className="select"
                value={assignedAgent}
                onChange={(e) => setAssignedAgent(e.target.value)}
              >
                <option value="Field Agent Johnson">Field Agent Johnson</option>
                <option value="Field Agent Musa">Field Agent Musa</option>
                <option value="Field Agent Okon">Field Agent Okon</option>
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
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1.5rem" }}>
          {routes.map((route) => (
            <div key={route.id} className="card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  flexWrap: "wrap",
                  gap: "1rem",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <MapPin size={20} style={{ color: "var(--color-primary)" }} />
                    <h2 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{route.name}</h2>
                  </div>
                  <p className="text-muted text-sm" style={{ marginTop: "0.25rem" }}>
                    {route.description}
                  </p>
                  {route.collectionSchedule && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
                      <Calendar size={16} style={{ color: "var(--color-primary)" }} />
                      <span className="text-sm font-medium">{route.collectionSchedule}</span>
                    </div>
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--color-bg)",
                    padding: "0.5rem 0.875rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.875rem",
                  }}
                >
                  <User size={16} style={{ color: "var(--color-text-muted)" }} />
                  <span className="font-medium">{route.assignedAgent}</span>
                </div>
              </div>

              <div className="divider" style={{ margin: "1rem 0" }} />

              <div>
                <p className="font-semibold text-xs text-muted" style={{ textTransform: "uppercase", marginBottom: "0.75rem" }}>
                  Default Billing Rates
                </p>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  <div
                    style={{
                      background: "var(--color-bg)",
                      padding: "0.875rem",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <p className="text-xs text-muted">Residential</p>
                    <p className="font-semibold" style={{ fontSize: "1.125rem", marginTop: "0.25rem" }}>
                      {formatNaira(route.rates.residential)}
                    </p>
                  </div>

                  <div
                    style={{
                      background: "var(--color-bg)",
                      padding: "0.875rem",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <p className="text-xs text-muted">Commercial</p>
                    <p className="font-semibold" style={{ fontSize: "1.125rem", marginTop: "0.25rem" }}>
                      {formatNaira(route.rates.commercial)}
                    </p>
                  </div>

                  <div
                    style={{
                      background: "var(--color-bg)",
                      padding: "0.875rem",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <p className="text-xs text-muted">Industrial</p>
                    <p className="font-semibold" style={{ fontSize: "1.125rem", marginTop: "0.25rem" }}>
                      {formatNaira(route.rates.industrial)}
                    </p>
                  </div>

                  <div
                    style={{
                      background: "var(--color-bg)",
                      padding: "0.875rem",
                      borderRadius: "var(--radius-md)",
                    }}
                  >
                    <p className="text-xs text-muted">Health Facilities</p>
                    <p className="font-semibold" style={{ fontSize: "1.125rem", marginTop: "0.25rem" }}>
                      {formatNaira(route.rates.health)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

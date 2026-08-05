"use client";

import { useState, useEffect } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { MOCK_SERVICES, type ServiceRun, MOCK_ORG_ID } from "@/lib/mockdata";
import { Badge } from "@/components/ui/Badge";
import { MapPin, RefreshCw } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";

export default function AgentDashboardPage() {
  const { user } = useSession();
  const [logs, setLogs] = useState<ServiceRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedZone, setAssignedZone] = useState(config.isMockMode ? "North Residential Zone" : "Unassigned");
  const [serviceSchedule, setServiceSchedule] = useState(config.isMockMode ? "Mondays & Thursdays" : "-");

  const fetchAgentLogs = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.orgId!);
    const res = await repo.getServices();
    if (Array.isArray(res)) {
      setLogs(res);
    } else {
      setLogs(res.data);
    }
    setLoading(false);
  };

  const fetchAgentRoute = async () => {
    if (config.isMockMode) return;
    try {
      const res = await fetch("/api/v1/agent/zone");
      if (res.ok) {
        const body = await res.json() as any;
        setAssignedZone(body.zone || "Unassigned");
        setServiceSchedule(body.schedule || "-");
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAgentLogs();
    fetchAgentRoute();
  }, [user]);

  const agentServices = logs.filter((c) => c.status !== "pending");
  const pendingCount = logs.filter((c) => c.status === "pending").length;
  const completedCount = agentServices.length;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Agent Command Center</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track your daily zone progress and active services.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchAgentLogs}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <MetricCard label="Completed Operations" value={completedCount.toString()} />
        <MetricCard label="Remaining Operations" value={pendingCount.toString()} />
        <MetricCard label="Today's assigned zone" value={assignedZone} />
        <MetricCard label="Service Schedule" value={serviceSchedule} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>Today's Activity Log</h2>
        {loading ? (
          <div className="flex justify-center" style={{ padding: "2rem" }}>
            <div className="spinner" />
          </div>
        ) : agentServices.length === 0 ? (
          <p className="text-muted text-sm">No services logged by you today yet.</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
            {agentServices.map((col) => (
              <div key={col.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.75rem" }}>
                <div>
                  <p className="font-semibold">{col.residentName}</p>
                  <p className="text-xs text-muted flex items-center gap-1" style={{ marginTop: "0.25rem" }}>
                    <MapPin size={12} /> {col.address}
                  </p>
                </div>
                <Badge variant={col.status === "completed" ? "success" : "warning"}>
                  {col.status.toUpperCase()}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { MetricCard } from "@/components/ui/MetricCard";
import { MOCK_COLLECTIONS, type CollectionRun, MOCK_PSP_ID } from "@/lib/mockdata";
import { Badge } from "@/components/ui/Badge";
import { MapPin, RefreshCw } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";

export default function AgentDashboardPage() {
  const { user } = useSession();
  const [logs, setLogs] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAgentLogs = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    const data = await repo.getCollections();
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchAgentLogs();
  }, [user]);

  const agentCollections = logs.filter((c) => c.status !== "pending");
  const pendingCount = logs.filter((c) => c.status === "pending").length;
  const completedCount = agentCollections.length;

  return (
    <div>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Field Agent Dashboard</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track collections logged by you today.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchAgentLogs}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <MetricCard label="My Completed Logs" value={completedCount.toString()} />
        <MetricCard label="Pending route tasks" value={pendingCount.toString()} />
        <MetricCard label="Today's assigned zone" value={config.isMockMode ? "Lekki Res Zone A" : "Unassigned"} />
        <MetricCard label="Collection Schedule" value={config.isMockMode ? "Mondays & Thursdays" : "-"} />
      </div>

      <div className="card">
        <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>My Logs Today</h2>
        {loading ? (
          <div className="flex justify-center" style={{ padding: "2rem" }}>
            <div className="spinner" />
          </div>
        ) : agentCollections.length === 0 ? (
          <p className="text-muted text-sm">No collections logged by you today yet.</p>
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
            {agentCollections.map((col) => (
              <div key={col.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.75rem" }}>
                <div>
                  <p className="font-semibold">{col.residentName}</p>
                  <p className="text-xs text-muted flex items-center gap-1" style={{ marginTop: "0.25rem" }}>
                    <MapPin size={12} /> {col.address}
                  </p>
                </div>
                <Badge variant={col.status === "collected" ? "success" : "warning"}>
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

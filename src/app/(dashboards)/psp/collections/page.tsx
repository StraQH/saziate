"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Truck, Check, MapPin, AlertTriangle, RefreshCw } from "lucide-react";

import { MOCK_COLLECTIONS, type CollectionRun, MOCK_PSP_ID } from "@/lib/mockdata";
import { SaziateRepository } from "@/lib/repository";
import { config } from "@/lib/config";
import { useSession } from "@/components/providers/SessionProvider";

export default function PSPCollectionsPage() {
  const { user } = useSession();
  const [collections, setCollections] = useState<CollectionRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const fetchCollections = async () => {
    if (!user) return;
    setLoading(true);
    const repo = new SaziateRepository(user.pspId!);
    const data = await repo.getCollections();
    setCollections(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchCollections();
  }, [user]);

  const filteredCollections = collections.filter((c) => {
    if (filterStatus === "all") return true;
    return c.status === filterStatus;
  });

  const completedCount = collections.filter((c) => c.status === "collected").length;
  const missedCount = collections.filter((c) => c.status === "no_access" || c.status === "no_waste").length;

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div>
          <h1>Collections & Dispatch</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track real-time waste collection status logged by field agents.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchCollections}>
          <RefreshCw size={16} />
          Refresh Feed
        </button>
      </div>

      {/* Summary Row */}
      <div className="metrics-grid" style={{ marginBottom: "2rem" }}>
        <div className="metric-card">
          <p className="metric-label">Assigned Routes</p>
          <p className="metric-value">3</p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Completed Drops</p>
          <p className="metric-value" style={{ color: "var(--color-success)" }}>
            {completedCount} / {collections.length}
          </p>
        </div>
        <div className="metric-card">
          <p className="metric-label">Missed / No Access</p>
          <p className="metric-value" style={{ color: "var(--color-warning)" }}>
            {missedCount}
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        {["all", "collected", "no_waste", "no_access", "pending"].map((status) => (
          <button
            key={status}
            className={`btn btn-sm ${filterStatus === status ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setFilterStatus(status)}
            style={{ textTransform: "capitalize" }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Collections Logs */}
      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : filteredCollections.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <p className="text-muted text-sm">No collection drops found matching status &ldquo;{filterStatus}&rdquo;.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
          {filteredCollections.map((col) => (
            <div key={col.id} className="card" style={{ padding: "1.25rem" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div>
                  <p className="font-semibold" style={{ fontSize: "1rem" }}>{col.residentName}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.25rem", color: "var(--color-text-muted)", fontSize: "0.8125rem" }}>
                    <MapPin size={14} />
                    <span>{col.address}</span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
                  <div className="text-right" style={{ fontSize: "0.8125rem" }}>
                    <p className="font-medium text-muted">Route: {col.route}</p>
                    {col.loggedAt && (
                      <p className="text-xs text-muted" style={{ marginTop: "0.15rem" }}>
                        Logged by {col.loggedBy} ({col.loggedAt})
                      </p>
                    )}
                  </div>

                  <Badge
                    variant={
                      col.status === "collected"
                        ? "success"
                        : col.status === "pending"
                        ? "neutral"
                        : "warning"
                    }
                  >
                    {col.status.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

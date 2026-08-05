"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Briefcase, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";

interface Service {
  id: string;
  status: string;
  notes: string;
  loggedAt: string;
  loggedBy: string;
}

export default function ResidentServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useSession();
  const serviceType = user?.orgServiceType || "utility";

  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/resident/services");
      if (res.ok) {
        const body = await res.json() as any as Service[];
        setServices(body);
      }
    } catch (err) {
      console.error("Failed to fetch services:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServices();
  }, []);

  return (
    <div>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1 style={{textTransform: "capitalize"}}>{serviceType} Service Logs</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Track {serviceType} service runs performed at your address by assigned field agents.
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={fetchServices}>
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : services.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <p className="text-muted text-sm">No service logs registered yet.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr", gap: "1rem" }}>
          {services.map((col) => (
            <div key={col.id} className="card" style={{ padding: "1.25rem" }}>
              <div className="flex justify-between items-center flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div style={{ background: "var(--color-bg)", padding: "0.75rem", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border)" }}>
                    <Briefcase className="text-muted" size={20} />
                  </div>
                  <div>
                    <p className="font-semibold">{col.loggedAt}</p>
                    <p className="text-muted text-xs">Notes: {col.notes}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={col.status === "completed" ? "success" : "warning"}>
                    {col.status.toUpperCase()}
                  </Badge>
                  <p className="text-xs text-muted">Logged by {col.loggedBy}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

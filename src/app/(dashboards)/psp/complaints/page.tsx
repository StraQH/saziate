"use client";

import { useState, useEffect } from "react";
import { MessageSquare, AlertCircle, Clock, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { config } from "@/lib/config";

export default function PSPComplaintsPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchComplaints = async () => {
    setLoading(true);
    if (config.isMockMode) {
      setComplaints([
        { id: "comp_1", description: "Waste wasn't collected this week.", status: "submitted", date: "2023-11-20", residentId: "res_123" },
        { id: "comp_2", description: "Bin was damaged during pickup.", status: "investigating", date: "2023-10-15", residentId: "res_456" }
      ]);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/v1/complaints");
      if (res.ok) {
        const data = await res.json();
        setComplaints(data as any);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, []);

  const handleUpdateStatus = async (complaintId: string, newStatus: string) => {
    if (config.isMockMode) {
      alert(`Status updated to ${newStatus} in mock mode.`);
      setComplaints(complaints.map(c => c.id === complaintId ? { ...c, status: newStatus } : c));
      return;
    }

    try {
      const res = await fetch("/api/v1/complaints", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complaintId, status: newStatus }),
      });
      if (res.ok) {
        alert("Complaint status updated.");
        fetchComplaints();
      } else {
        const text = await res.text();
        alert(`Error: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to update status.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Resident Complaints</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Manage and resolve support tickets from residents.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : complaints.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <CheckCircle size={48} className="mx-auto text-success mb-4" />
          <h3>All Clear!</h3>
          <p className="text-muted text-sm mt-2">No active complaints from residents.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {complaints.map(comp => (
            <div key={comp.id} className="card" style={{ padding: "1.5rem" }}>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-medium">{comp.description}</h3>
                  <div className="flex items-center gap-2 mt-2 text-sm text-muted">
                    <Clock size={14} />
                    <span>{comp.date || new Date(comp.createdAt).toLocaleDateString()}</span>
                    <span>•</span>
                    <span className="font-mono">Resident ID: {comp.residentId}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge
                    variant={
                      comp.status === "resolved" ? "success" :
                      comp.status === "rejected" ? "danger" :
                      comp.status === "investigating" ? "primary" : "warning"
                    }
                  >
                    {comp.status.toUpperCase()}
                  </Badge>
                  <select 
                    className="input input-sm mt-2" 
                    value={comp.status}
                    onChange={(e) => handleUpdateStatus(comp.id, e.target.value)}
                  >
                    <option value="submitted">Submitted</option>
                    <option value="investigating">Investigating</option>
                    <option value="resolved">Resolved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

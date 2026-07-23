"use client";

import { useState, useEffect } from "react";
import { MessageSquare, Plus, AlertCircle, Clock, CheckCircle, ChevronLeft, ChevronRight, Search, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { config } from "@/lib/config";

export default function ResidentSupportPage() {
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchComplaints = async () => {
    setLoading(true);
    if (config.isMockMode) {
      setComplaints([
        { id: "comp_1", description: "Waste wasn't collected this week.", status: "submitted", date: "2023-11-20" },
        { id: "comp_2", description: "Bin was damaged during pickup.", status: "resolved", date: "2023-10-15" }
      ]);
      setTotalPages(1);
      setTotalCount(2);
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/v1/complaints?page=${page}&limit=${limit}&search=${encodeURIComponent(debouncedSearch)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
           setComplaints(data);
        } else {
           setComplaints(data.data);
           setTotalPages(data.totalPages);
           setTotalCount(data.totalCount);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [page, limit, debouncedSearch]);

  const handleSubmitComplaint = async () => {
    const description = prompt("Describe your issue:");
    if (!description || description.length < 5) {
      alert("Description must be at least 5 characters.");
      return;
    }

    if (config.isMockMode) {
      alert("Complaint submitted in mock mode.");
      return;
    }

    try {
      const res = await fetch("/api/v1/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      if (res.ok) {
        alert("Complaint submitted successfully.");
        fetchComplaints();
      } else {
        const text = await res.text();
        alert(`Error: ${text}`);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to submit complaint.");
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Support & Complaints</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Report issues and track their resolution status.
          </p>
        </div>
        <div className="flex gap-3 items-center">
          <div style={{ position: "relative" }}>
            <Search size={16} className="text-muted" style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)" }} />
            <input 
              type="text" 
              placeholder="Search complaints..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input"
              style={{ paddingLeft: "32px", width: "250px", height: "36px" }}
            />
          </div>
          <button className="btn btn-secondary btn-sm" onClick={fetchComplaints}>
            <RefreshCw size={16} />
            Refresh
          </button>
          <button className="btn btn-primary btn-sm" onClick={handleSubmitComplaint}>
            <Plus size={16} />
            New Complaint
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card flex items-center justify-center" style={{ padding: "4rem" }}>
          <div className="spinner" />
        </div>
      ) : complaints.length === 0 ? (
        <div className="card text-center" style={{ padding: "3rem" }}>
          <MessageSquare size={48} className="mx-auto text-muted mb-4" />
          <h3>No Complaints Yet</h3>
          <p className="text-muted text-sm mt-2">If you have an issue, submit a new complaint.</p>
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
                  </div>
                </div>
                <Badge
                  variant={
                    comp.status === "resolved" ? "success" :
                    comp.status === "rejected" ? "danger" :
                    comp.status === "investigating" ? "primary" : "warning"
                  }
                >
                  {comp.status.toUpperCase()}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && complaints.length > 0 && (
        <div className="flex items-center justify-between" style={{ padding: "1rem", marginTop: "1rem", background: "var(--color-bg-elevated)", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" }}>
          <p className="text-sm text-muted">
            Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount} complaints
          </p>
          <div className="flex gap-2">
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={page === 1}
              onClick={() => setPage(p => p - 1)}
            >
              <ChevronLeft size={16} /> Prev
            </button>
            <button 
              className="btn btn-secondary btn-sm" 
              disabled={page === totalPages}
              onClick={() => setPage(p => p + 1)}
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

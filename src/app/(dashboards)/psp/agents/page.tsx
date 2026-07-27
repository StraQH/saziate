"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Mail, Plus, ShieldCheck, Phone, Calendar, User, X, Trash2 } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { config } from "@/lib/config";
import { ConfirmModal, AlertModal } from "@/components/ui/Modal";

export default function PSPAgentsPage() {
  const { user } = useSession();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);

  // Modal states
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: "", name: "" });
  const [alertModal, setAlertModal] = useState<{ isOpen: boolean; title: string; message: string; type: "info" | "success" | "warning" | "danger" }>({ isOpen: false, title: "", message: "", type: "info" });


  useEffect(() => {
    if (user?.pspId) {
      fetchAgents();
    }
  }, [user]);

  const fetchAgents = async () => {
    setLoading(true);
    if (config.isMockMode) {
      setAgents([
        { id: "1", name: "Johnson Alabi", email: "johnson@saziate.com", phone: "+2348039281234", createdAt: Date.now() - 360000000 },
        { id: "2", name: "Chinedu Okafor", email: "chinedu@saziate.com", phone: "+2348123456789", createdAt: Date.now() - 720000000 },
      ]);
      setLoading(false);
      return;
    }
    try {
      const res = await fetch("/api/v1/psp/agents");
      if (res.ok) {
        const data = await res.json() as any[];
        setAgents(data);
      }
    } catch (err) {
      console.error("Failed to load active agents:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivateClick = (id: string, name: string) => {
    setConfirmModal({ isOpen: true, id, name });
  };

  const executeDeactivate = async () => {
    const { id } = confirmModal;
    setDeactivatingId(id);
    
    if (config.isMockMode) {
      setTimeout(() => {
        setAgents((prev) => prev.filter(a => a.id !== id));
        setDeactivatingId(null);
      }, 500);
      return;
    }

    try {
      const res = await fetch(`/api/v1/psp/agents/${id}`, { method: "DELETE" });
      if (res.ok) {
        setAgents((prev) => prev.filter(a => a.id !== id));
      } else {
        const err = await res.text();
        setAlertModal({ isOpen: true, title: "Deactivation Failed", message: err, type: "danger" });
      }
    } catch (err) {
      setAlertModal({ isOpen: true, title: "Error", message: "An unexpected error occurred while deactivating the agent.", type: "danger" });
    } finally {
      setDeactivatingId(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || !inviteName) return;

    setIsInviting(true);
    setMessage(null);
    try {
      if (config.isMockMode) {
        setTimeout(() => {
          const newAgent = {
            id: crypto.randomUUID(),
            name: inviteName,
            email: inviteEmail,
            phone: "+2348000000000",
            createdAt: Date.now(),
          };
          setAgents((prev) => [...prev, newAgent]);
          setMessage({ text: "Field agent onboarded successfully!", type: "success" });
          setInviteEmail("");
          setInviteName("");
          setShowModal(false);
          setIsInviting(false);
        }, 800);
        return;
      }

      const res = await fetch("/api/v1/psp/agents/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, name: inviteName }),
      });
      
      const text = await res.text();
      if (res.ok) {
        setMessage({ text: "Field agent onboarded successfully!", type: "success" });
        setInviteEmail("");
        setInviteName("");
        setShowModal(false);
        fetchAgents();
      } else {
        setMessage({ text: `Failed to onboard: ${text}`, type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: `Error: ${(err as Error).message}`, type: "error" });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <div>
          <h1>Field Agents</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Coordinate and manage your active field agents in the system.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => { setMessage(null); setShowModal(true); }}>
          <Plus size={16} /> Invite Agent
        </button>
      </div>

      {message && (
        <div
          className="card"
          style={{
            background: message.type === "success" ? "var(--color-success-light)" : "var(--color-danger-light)",
            borderColor: message.type === "success" ? "var(--color-success)" : "var(--color-danger)",
            padding: "0.875rem 1.25rem",
            marginBottom: "1.5rem",
            fontSize: "0.875rem",
            color: message.type === "success" ? "var(--color-success)" : "var(--color-danger)",
            fontWeight: 500,
          }}
        >
          {message.text}
        </div>
      )}

      {/* Main Agent List Table */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "1.25rem 1.5rem", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={18} style={{ color: "var(--color-success)" }} />
            Active Field Operators
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="spinner" />
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-12" style={{ padding: "3rem" }}>
            <div style={{ display: "inline-flex", padding: "1rem", background: "var(--color-primary-light)", borderRadius: "50%", marginBottom: "1rem", color: "var(--color-primary)" }}>
              <User size={32} />
            </div>
            <h3 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.25rem" }}>No Agents Yet</h3>
            <p className="text-muted text-sm" style={{ maxWidth: "320px", margin: "0 auto 1.5rem" }}>
              Invite field agents to assign them trash collection routes and start coordinating pickups.
            </p>
            <button className="btn btn-primary" onClick={() => { setMessage(null); setShowModal(true); }}>
              <Plus size={16} /> Onboard First Agent
            </button>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Agent Name</th>
                  <th>Email</th>
                  <th>Phone Number</th>
                  <th>Joined Date</th>
                  <th>Status</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "0.75rem", borderBottom: "none" }}>
                      <div style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        backgroundColor: "var(--color-primary-light)",
                        color: "var(--color-primary)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.875rem",
                        fontWeight: 700
                      }}>
                        {agent.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <span>{agent.name}</span>
                    </td>
                    <td>{agent.email}</td>
                    <td className="text-muted" style={{ fontSize: "0.875rem" }}>{agent.phone || "-"}</td>
                    <td className="text-muted" style={{ fontSize: "0.875rem" }}>
                      {new Date(agent.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td>
                      <Badge variant="success">Active</Badge>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button 
                        className="btn btn-secondary" 
                        style={{ padding: "0.4rem", color: "var(--color-danger)", borderColor: "var(--color-danger)" }}
                        onClick={() => handleDeactivateClick(agent.id, agent.name)}
                        disabled={deactivatingId === agent.id}
                        title="Deactivate Agent"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Modal */}
      {showModal && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: "rgba(15, 23, 42, 0.6)",
          backdropFilter: "blur(4px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000,
          animation: "fadeIn 0.2s ease",
        }}>
          <div className="card" style={{
            width: "100%",
            maxWidth: "480px",
            padding: "2rem",
            position: "relative",
            boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)"
          }}>
            <button
              onClick={() => setShowModal(false)}
              style={{
                position: "absolute",
                top: "1.25rem",
                right: "1.25rem",
                background: "none",
                border: "none",
                color: "var(--color-text-muted)",
                cursor: "pointer"
              }}
            >
              <X size={20} />
            </button>
            
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Invite Field Agent</h2>
            <p className="text-muted text-sm" style={{ marginBottom: "1.5rem", lineHeight: 1.4 }}>
              Enter details to onboard a new operator. They will receive an email invitation to log into the field application.
            </p>
            <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="form-group">
                <label className="label">Agent Name</label>
                <input
                  type="text"
                  className="input"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  placeholder="e.g. Samuel Ade"
                  required
                />
              </div>
              <div className="form-group">
                <label className="label">Email Address</label>
                <input
                  type="email"
                  className="input"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="e.g. samuel.ade@company.com"
                  required
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setShowModal(false)}
                  style={{
                    backgroundColor: "transparent",
                    border: "1px solid var(--color-border)",
                    color: "var(--color-text)",
                  }}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isInviting}>
                  {isInviting ? "Onboarding..." : "Onboard Agent"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        onConfirm={executeDeactivate}
        title="Deactivate Agent"
        message={`Are you sure you want to deactivate ${confirmModal.name}? They will lose access to all your routes.`}
        confirmText="Deactivate"
        isDestructive={true}
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

"use client";

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/Badge";
import { Mail, Plus, ShieldCheck } from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { SaziateRepository } from "@/lib/repository";

export default function PSPAgentsPage() {
  const { user } = useSession();
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [message, setMessage] = useState<{ text: string, type: "success" | "error" } | null>(null);

  useEffect(() => {
    if (user?.pspId) {
      fetchAgents();
    }
  }, [user]);

  const fetchAgents = async () => {
    setLoading(true);
    // Since we don't have a dedicated getAgents endpoint in the mock repository yet, 
    // we would fetch users where pspId == user.pspId AND role == field_agent
    // For now, it will be empty in mock mode, or we can just show empty state
    setAgents([]);
    setLoading(false);
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;

    setIsInviting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/psp/agents/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail }),
      });
      
      const text = await res.text();
      if (res.ok) {
        setMessage({ text: "Invitation sent successfully!", type: "success" });
        setInviteEmail("");
      } else {
        setMessage({ text: `Failed to invite: ${text}`, type: "error" });
      }
    } catch (err: any) {
      setMessage({ text: `Error: ${err.message}`, type: "error" });
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Field Agents</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Manage your field operators and invite new agents to your company.
          </p>
        </div>
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

      <div className="grid" style={{ gridTemplateColumns: "1fr 2fr", gap: "2rem", alignItems: "start" }}>
        
        {/* Invite Panel */}
        <div className="card">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Mail size={18} style={{ color: "var(--color-primary)" }} />
            Invite New Agent
          </h2>
          <p className="text-muted text-sm" style={{ marginBottom: "1.5rem" }}>
            Enter the email address of the field agent you want to invite. They will receive a magic link to create their account and set their password.
          </p>
          <form onSubmit={handleInvite} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="form-group">
              <label className="label">Agent Email</label>
              <input
                type="email"
                className="input"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="agent@example.com"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={isInviting}>
              {isInviting ? "Sending..." : "Send Invitation"}
            </button>
          </form>
        </div>

        {/* Active Agents List */}
        <div className="card">
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={18} style={{ color: "var(--color-success)" }} />
            Active Agents
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="spinner" />
            </div>
          ) : agents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted text-sm">No agents have joined your company yet.</p>
              <p className="text-muted text-sm" style={{ marginTop: "0.5rem" }}>Use the panel on the left to invite someone.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {agents.map((agent, i) => (
                <div key={i} style={{ borderBottom: "1px solid var(--color-border)", paddingBottom: "1rem" }}>
                  <p className="font-semibold text-sm">{agent.name}</p>
                  <p className="text-xs text-muted">{agent.email}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/components/providers/SessionProvider";
import { User, ShieldAlert, CheckCircle2, Lock } from "lucide-react";

export default function ResidentProfilePage() {
  const { user } = useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [pspInfo, setPspInfo] = useState<{ name: string; email: string; phone: string } | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ name: string } | null>(null);

  const fetchProfile = async () => {
    try {
      const res = await fetch("/api/v1/resident/profile");
      if (res.ok) {
        const body = await res.json() as any;
        setName(body.name || "");
        setEmail(body.email || "");
        setPspInfo(body.psp || null);
        setRouteInfo(body.route || null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password && password !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/v1/resident/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          newPassword: password || undefined,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update profile.");
      }

      setSuccess("Profile settings saved successfully.");
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: "600px" }}>
      <div className="page-header" style={{ marginBottom: "2rem" }}>
        <div>
          <h1>Profile Settings</h1>
          <p className="text-muted" style={{ marginTop: "0.25rem" }}>
            Manage your personal login credentials and email notifications.
          </p>
        </div>
      </div>

      <div className="card" style={{ padding: "2rem" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          
          {error && (
            <div style={{ background: "var(--color-danger-bg)", border: "1px solid var(--color-danger)", borderRadius: "var(--radius-sm)", padding: "0.875rem", color: "var(--color-danger)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div style={{ background: "var(--color-success-bg)", border: "1px solid var(--color-success)", borderRadius: "var(--radius-sm)", padding: "0.875rem", color: "var(--color-success)", fontSize: "0.875rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <div className="form-group">
            <label className="label">Full Name</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="label">Email Address</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="divider" style={{ margin: "0.5rem 0" }} />

          <div>
            <h3 className="font-semibold text-base" style={{ marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Lock size={16} />
              <span>Change Password</span>
            </h3>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div className="form-group">
                <label className="label">New Password</label>
                <input
                  type="password"
                  className="input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>

              <div className="form-group">
                <label className="label">Confirm New Password</label>
                <input
                  type="password"
                  className="input"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                />
              </div>
            </div>
          </div>

          <div className="divider" style={{ margin: "0.5rem 0" }} />

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ alignSelf: "flex-end" }}>
            {loading ? "Saving..." : "Save Settings"}
          </button>

        </form>
      </div>

      {/* PSP & Route Details Card */}
      {pspInfo && (
        <div className="card" style={{ marginTop: "2rem", padding: "1.5rem" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>Your Waste Service Provider</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.875rem" }}>
            <div>
              <span className="text-muted">Operator:</span> <strong className="text-text" style={{ marginLeft: "0.5rem" }}>{pspInfo.name}</strong>
            </div>
            <div>
              <span className="text-muted">Contact Phone:</span> <strong className="text-text" style={{ marginLeft: "0.5rem" }}>{pspInfo.phone}</strong>
            </div>
            <div>
              <span className="text-muted">Contact Email:</span> <strong className="text-text" style={{ marginLeft: "0.5rem" }}>{pspInfo.email}</strong>
            </div>
            {routeInfo && (
              <div>
                <span className="text-muted">Assigned Route:</span> <strong className="text-text" style={{ marginLeft: "0.5rem" }}>{routeInfo.name}</strong>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

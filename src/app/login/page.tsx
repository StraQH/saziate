"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Lock, ShieldAlert, Sparkles, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { config } from "@/lib/config";
import { normalizePhoneNumber } from "@/lib/utils";

export default function LoginPage() {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const lower = identifier.toLowerCase().trim();
    if (lower.startsWith("sz-")) {
      setError("Reference codes cannot be used for sign in. Please enter your email address or registered phone number.");
      setLoading(false);
      return;
    }

    if (config.isMockMode) {
      setTimeout(() => {
        if (lower.includes("admin")) router.push("/admin");
        else if (lower.includes("agent") || lower.includes("johnson")) router.push("/agent");
        else if (lower.startsWith("config.locality.code") || lower.startsWith("08") || lower.startsWith("07") || lower.startsWith("09") || lower.includes("resident") || lower.includes("john")) router.push("/resident");
        else router.push("/org");
        setLoading(false);
      }, 300);
      return;
    }

    try {
      const emailValue = lower.includes("@") ? lower : `${normalizePhoneNumber(lower)}@saziate.com`;
      const { data, error: signInError } = await authClient.signIn.email({
        email: emailValue,
        password,
      });

      if (signInError || !data?.user) {
        throw new Error(signInError?.message || "Invalid credentials");
      }

      const role = (data.user as { role?: string }).role || "org_admin";
      if (role === "admin") window.location.href = "/admin";
      else if (role === "field_agent") window.location.href = "/agent";
      else if (role === "resident") window.location.href = "/resident";
      else window.location.href = "/org";
    } catch (err: any) {
      const message = err instanceof Error ? (err as Error).message : "Sign in failed. Check credentials.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = (role: "admin" | "org_admin" | "field_agent" | "resident") => {
    if (role === "admin") window.location.href = "/admin";
    else if (role === "field_agent") window.location.href = "/agent";
    else if (role === "resident") window.location.href = "/resident";
    else window.location.href = "/org";
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--color-bg, #0f172a)" }}>
      {/* Brand Side Panel */}
      <div
        style={{
          flex: 1,
          background: "linear-gradient(135deg, var(--color-primary, #2563eb) 0%, var(--color-primary-dark, #1d4ed8) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "4rem",
          color: "#fff",
          position: "relative",
          overflow: "hidden",
        }}
        className="hide-mobile"
      >
        <div style={{ position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "3rem" }}>
            <span style={{ fontWeight: 800, fontSize: "3.5rem", color: "#ffffff", letterSpacing: "-0.03em", fontFamily: "var(--fh)", lineHeight: 1 }}>Saziate</span>
          </div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2, marginBottom: "1.5rem" }}>
            Welcome to the future of waste management.
          </h1>
          <p style={{ fontSize: "1.125rem", opacity: 0.9, maxWidth: "480px", lineHeight: 1.6 }}>
            Your centralised operational hub for streamlined fleet routing, transparent collections, and effortless bill recovery.
          </p>
        </div>
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-10%",
            width: "50%",
            height: "50%",
            background: "rgba(255,255,255,0.05)",
            borderRadius: "50%",
          }}
        />
      </div>

      {/* Form Container */}
      <div
        style={{
          flex: 1.2,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: "2rem",
        }}
      >
        <div style={{ width: "100%", maxWidth: "440px" }} className="card">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text, #f8fafc)" }}>Sign In</h2>
            <p className="text-muted" style={{ marginTop: "0.25rem" }}>
              Access your personalized Saziate dashboard.
            </p>
          </div>

          {error && (
            <div
              style={{
                background: "var(--color-danger-bg, rgba(239, 68, 68, 0.1))",
                border: "1px solid var(--color-danger, #ef4444)",
                borderRadius: "var(--radius-sm, 6px)",
                padding: "0.875rem",
                color: "var(--color-danger, #ef4444)",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1.5rem",
              }}
            >
              <ShieldAlert size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            <div className="form-group">
              <label className="label">Email Address or Phone Number</label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  className="input"
                  style={{ paddingLeft: "2.5rem" }}
                  placeholder="ops@metro-waste.com or 08021111111"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
                <User size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted, #94a3b8)" }} />
              </div>
            </div>

            <div className="form-group">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label className="label">Password</label>
                <Link href="/forgot-password" style={{ fontSize: "0.875rem", color: "var(--color-primary, #2563eb)", textDecoration: "none" }}>Forgot password?</Link>
              </div>
              <div style={{ position: "relative" }}>
                <input
                  type="password"
                  className="input"
                  style={{ paddingLeft: "2.5rem" }}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <Lock size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted, #94a3b8)" }} />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              style={{ marginTop: "0.5rem" }}
              disabled={loading}
            >
              {loading ? "Authenticating..." : "Sign In"}
              <ArrowRight size={16} />
            </button>
          </form>

          {/* Render Mock Access Panel only after client hydration */}
          {mounted && config.isMockMode && (
            <div
              style={{
                marginTop: "2rem",
                padding: "1.25rem",
                background: "var(--color-primary-light, rgba(37, 99, 235, 0.1))",
                borderRadius: "var(--radius-md, 8px)",
                border: "1px dashed var(--color-primary, #2563eb)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem", color: "var(--color-primary, #2563eb)" }}>
                <Sparkles size={16} />
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Mock Mode Quick Access</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button className="btn btn-secondary btn-sm w-full" onClick={() => handleQuickLogin("org_admin")}>
                  Enter as Operator
                </button>
                <button className="btn btn-secondary btn-sm w-full" onClick={() => handleQuickLogin("field_agent")}>
                  Enter as Field Agent
                </button>
                <button className="btn btn-secondary btn-sm w-full" onClick={() => handleQuickLogin("resident")}>
                  Enter as Resident Portal
                </button>
                <button className="btn btn-secondary btn-sm w-full" onClick={() => handleQuickLogin("admin")}>
                  Enter as Platform Admin
                </button>
              </div>
            </div>
          )}

          <p className="text-muted" style={{ textAlign: "center", marginTop: "1.5rem" }}>
            New waste management operator?{" "}
            <Link href="/signup" style={{ color: "var(--color-primary, #2563eb)", fontWeight: 500 }}>
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
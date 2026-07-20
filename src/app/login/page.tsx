"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Landmark, ArrowRight, Lock, Mail, ShieldAlert, Sparkles, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { config } from "@/lib/config";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

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
        else if (lower.startsWith("+234") || lower.startsWith("08") || lower.startsWith("07") || lower.startsWith("09") || lower.includes("resident") || lower.includes("sanwo")) router.push("/resident");
        else router.push("/psp");
        setLoading(false);
      }, 300);
      return;
    }

    try {
      const emailValue = identifier.includes("@") ? identifier : `${identifier}@saziate.com`;
      const { data, error: signInError } = await authClient.signIn.email({
        email: emailValue,
        password,
      });

      if (signInError || !data?.user) {
        throw new Error(signInError?.message || "Invalid credentials");
      }

      // Route based on role
      const role = (data.user as any).role || "psp_operator";
      if (role === "admin") router.push("/admin");
      else if (role === "field_agent") router.push("/agent");
      else if (role === "resident") router.push("/resident");
      else router.push("/psp");
    } catch (err: any) {
      setError(err.message || "Sign in failed. Check credentials.");
    } finally {
      setLoading(false);
    }
  };

  // Fast login helpers in Mock Mode
  const handleQuickLogin = (role: "admin" | "psp_operator" | "field_agent" | "resident") => {
    if (role === "admin") router.push("/admin");
    else if (role === "field_agent") router.push("/agent");
    else if (role === "resident") router.push("/resident");
    else router.push("/psp");
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--color-bg)" }}>
      {/* Brand Side Panel */}
      <div 
        style={{ 
          flex: 1, 
          background: "linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "4rem",
          color: "#fff",
          position: "relative",
          overflow: "hidden"
        }}
        className="hide-mobile"
      >
        <div style={{ position: "relative", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "3rem" }}>
            <img src="/logo.svg" alt="Saziate Logo" style={{ height: "40px", objectFit: "contain", filter: "brightness(0) invert(1)" }} />
          </div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2, marginBottom: "1.5rem" }}>
            Waste management, simplified.
          </h1>
          <p style={{ fontSize: "1.125rem", opacity: 0.9, maxWidth: "480px", lineHeight: 1.6 }}>
            A unified platform for communities and service providers. Track collection schedules, manage operations seamlessly, and collaborate for a cleaner environment.
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
            borderRadius: "50%" 
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
          padding: "2rem" 
        }}
      >
        <div style={{ width: "100%", maxWidth: "440px" }} className="card">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)" }}>Welcome Back</h2>
            <p className="text-muted" style={{ marginTop: "0.25rem" }}>
              Sign in to manage your collection operations
            </p>
          </div>

          {error && (
            <div 
              style={{ 
                background: "var(--color-danger-bg)", 
                border: "1px solid var(--color-danger)",
                borderRadius: "var(--radius-sm)",
                padding: "0.875rem",
                color: "var(--color-danger)",
                fontSize: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "1.5rem"
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
                  placeholder="ops@lekkigreenclean.com or +2348021111111"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  autoComplete="username"
                  required
                />
                <User size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
              </div>
            </div>

            <div className="form-group">
              <label className="label">Password</label>
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
                <Lock size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
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

          {/* Quick Mock Login panel */}
          {config.isMockMode && (
            <div 
              style={{ 
                marginTop: "2rem", 
                padding: "1.25rem", 
                background: "var(--color-primary-light)", 
                borderRadius: "var(--radius-md)",
                border: "1px dashed var(--color-primary)" 
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.875rem", color: "var(--color-primary)" }}>
                <Sparkles size={16} />
                <span style={{ fontSize: "0.875rem", fontWeight: 600 }}>Mock Mode Quick Access</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <button 
                  className="btn btn-secondary btn-sm w-full"
                  onClick={() => handleQuickLogin("psp_operator")}
                >
                  Enter as PSP Operator
                </button>
                <button 
                  className="btn btn-secondary btn-sm w-full"
                  onClick={() => handleQuickLogin("field_agent")}
                >
                  Enter as Field Agent
                </button>
                <button 
                  className="btn btn-secondary btn-sm w-full"
                  onClick={() => handleQuickLogin("resident")}
                >
                  Enter as Resident Portal
                </button>
                <button 
                  className="btn btn-secondary btn-sm w-full"
                  onClick={() => handleQuickLogin("admin")}
                >
                  Enter as Platform Admin
                </button>
              </div>
            </div>
          )}

          <p className="text-muted" style={{ textAlign: "center", marginTop: "1.5rem" }}>
            New waste operator?{" "}
            <Link href="/signup" style={{ color: "var(--color-primary)", fontWeight: 500 }}>
              Create Account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

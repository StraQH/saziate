"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { toast } = useToast();
  
  const [step, setStep] = useState<1 | 2>(1);
  const [identifier, setIdentifier] = useState("");
  const [token, setToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier) {
      toast("Please enter your email or phone number", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier }),
      });

      const data = await res.json() as any;
      if (!res.ok) {
        throw new Error(String(data.error || "Failed to request reset"));
      }

      toast("If an account exists, a reset code has been sent", "success");
      setStep(2);
    } catch (err: any) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !newPassword) {
      toast("Please fill in all fields", "error");
      return;
    }
    if (newPassword.length < 8) {
      toast("Password must be at least 8 characters", "error");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/v1/auth/forgot-password", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, token, newPassword }),
      });

      const data = await res.json() as any;
      if (!res.ok) {
        throw new Error(String(data.error || "Failed to reset password"));
      }

      toast("Password reset successfully! You can now log in.", "success");
      router.push("/login");
    } catch (err: any) {
      toast((err as Error).message, "error");
    } finally {
      setLoading(false);
    }
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
            <span style={{ fontWeight: 800, fontSize: "2.25rem", color: "#ffffff", letterSpacing: "-0.03em", fontFamily: "var(--fh)", lineHeight: 1 }}>Saziate</span>
          </div>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 700, lineHeight: 1.2, marginBottom: "1.5rem" }}>
            Regain access instantly.
          </h1>
          <p style={{ fontSize: "1.125rem", opacity: 0.9, maxWidth: "400px", lineHeight: 1.6 }}>
            Securely reset your password and get back to managing your services, collections, and growth.
          </p>
        </div>

        {/* Decorative elements */}
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-10%",
            width: "500px",
            height: "500px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0) 70%)",
            zIndex: 1,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "20%",
            right: "10%",
            width: "300px",
            height: "300px",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 70%)",
            zIndex: 1,
          }}
        />
      </div>

      {/* Form Side Panel */}
      <div
        style={{
          flex: "0 0 480px",
          backgroundColor: "#fff",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "3rem",
          boxShadow: "-10px 0 25px rgba(0,0,0,0.05)",
          position: "relative",
          zIndex: 20,
        }}
        className="form-panel"
      >
        <Link 
          href="/login" 
          style={{ 
            display: "inline-flex", 
            alignItems: "center", 
            gap: "0.5rem", 
            color: "var(--color-text-muted)", 
            textDecoration: "none",
            marginBottom: "2rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            width: "fit-content"
          }}
        >
          <ArrowLeft size={16} />
          Back to Login
        </Link>
        
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ width: "48px", height: "48px", backgroundColor: "rgba(37, 99, 235, 0.1)", color: "var(--color-primary)", borderRadius: "12px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
            <KeyRound size={24} />
          </div>
          <h2 style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--color-text)", marginBottom: "0.5rem", letterSpacing: "-0.025em" }}>
            Reset Password
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "0.9375rem" }}>
            {step === 1 ? "Enter your email or phone number to receive a reset code." : "Enter the 6-digit code and your new password."}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleRequestReset} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="form-group">
              <label className="label">Email or Phone Number</label>
              <input
                type="text"
                className="input"
                style={{ padding: "0.875rem 1rem", fontSize: "1rem" }}
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter email or +234..."
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", padding: "0.875rem", fontSize: "1rem", marginTop: "1rem" }}
              disabled={loading}
            >
              {loading ? "Sending Code..." : "Send Reset Code"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword} style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            <div className="form-group">
              <label className="label">Reset Code</label>
              <input
                type="text"
                className="input"
                style={{ padding: "0.875rem 1rem", fontSize: "1rem", letterSpacing: "2px", textAlign: "center" }}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="label">New Password</label>
              <input
                type="password"
                className="input"
                style={{ padding: "0.875rem 1rem", fontSize: "1rem" }}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: "100%", padding: "0.875rem", fontSize: "1rem", marginTop: "1rem" }}
              disabled={loading}
            >
              {loading ? "Resetting..." : "Reset Password"}
            </button>
          </form>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @media (max-width: 768px) {
          .hide-mobile {
            display: none !important;
          }
          .form-panel {
            flex: 1 !important;
            padding: 2rem !important;
            box-shadow: none !important;
          }
        }
      `}} />
    </div>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Landmark, ArrowRight, UserPlus, Lock, Mail, Phone, MapPin, Building, ShieldAlert } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export default function SignupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Operator user states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  // Company / PSP details states
  const [pspName, setPspName] = useState("");
  const [rcNumber, setRcNumber] = useState("");
  const [address, setAddress] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // 1. Sign up user via Better Auth
      const { data, error: signUpError } = await authClient.signUp.email({
        email,
        password,
        name,
      });

      if (signUpError || !data?.user) {
        throw new Error(signUpError?.message || "Auth signup failed");
      }

      // 2. Onboard Operator details & create PSP organization profile
      const onboardResponse = await fetch("/api/v1/auth/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: data.user.id,
          phone,
          role: "psp_operator",
          pspName,
          rcNumber,
          address,
        }),
      });

      if (!onboardResponse.ok) {
        const onboardErrText = await onboardResponse.text();
        throw new Error(onboardErrText || "PSP Onboarding database sync failed");
      }

      // Sign in user automatically and route to dashboard
      router.push("/psp");
    } catch (err: any) {
      setError(err.message || "An unexpected signup error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", backgroundColor: "var(--color-bg)" }}>
      {/* Visual Brand Panel */}
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
            Digitize your waste operations today.
          </h1>
          <p style={{ fontSize: "1.125rem", opacity: 0.9, maxWidth: "480px" }}>
            Manage residents, automate recurring monthly invoicing, collect bills with <span style={{ fontWeight: 600 }}>Dedicated Virtual Accounts</span>, coordinate field agents, and secure automated settlements.
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

      {/* Signup Form Panel */}
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
        <div style={{ width: "100%", maxWidth: "520px" }} className="card">
          <div style={{ textAlign: "center", marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--color-text)" }}>Get Started</h2>
            <p className="text-muted" style={{ marginTop: "0.25rem" }}>
              Register your PSP waste operator account on Saziate
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
            <div>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.875rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.375rem" }}>
                1. Operator Profile
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }} className="grid-cols-1">
                <div className="form-group">
                  <label className="label">Full Name</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="Jane Doe"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                    <UserPlus size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Phone Number</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="tel"
                      className="input"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="e.g. 08012345678"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      required
                    />
                    <Phone size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem" }} className="grid-cols-1">
                <div className="form-group">
                  <label className="label">Email Address</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="email"
                      className="input"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="jane@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <Mail size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">Password</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="password"
                      className="input"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="Min. 8 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                    <Lock size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "0.5rem" }}>
              <h3 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "0.875rem", borderBottom: "1px solid var(--color-border)", paddingBottom: "0.375rem" }}>
                2. Business Details
              </h3>
              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "1rem" }} className="grid-cols-1">
                <div className="form-group">
                  <label className="label">Company Name</label>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      className="input"
                      style={{ paddingLeft: "2.5rem" }}
                      placeholder="Lekki Cleaners Ltd"
                      value={pspName}
                      onChange={(e) => setPspName(e.target.value)}
                      required
                    />
                    <Building size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="label">RC Number</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="RC-123456"
                    value={rcNumber}
                    onChange={(e) => setRcNumber(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group" style={{ marginTop: "1rem" }}>
                <label className="label">Business Address</label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    className="input"
                    style={{ paddingLeft: "2.5rem" }}
                    placeholder="Plot 12, Admiralty Way, Lekki Phase 1, Lagos"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    required
                  />
                  <MapPin size={16} style={{ position: "absolute", left: "0.875rem", top: "14px", color: "var(--color-text-muted)" }} />
                </div>
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary w-full"
              style={{ marginTop: "1rem" }}
              disabled={loading}
            >
              {loading ? "Creating Account..." : "Create Account"}
              <ArrowRight size={16} />
            </button>
          </form>

          <p className="text-muted" style={{ textAlign: "center", marginTop: "1.5rem" }}>
            Already registered?{" "}
            <Link href="/login" style={{ color: "var(--color-primary)", fontWeight: 500 }}>
              Sign In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

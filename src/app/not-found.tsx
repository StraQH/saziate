"use client";

import Link from "next/link";
import { ArrowLeft, MapPinOff } from "lucide-react";

export default function NotFoundPage() {
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
          <h1 style={{ fontSize: "3.5rem", fontWeight: 700, lineHeight: 1.1, marginBottom: "1.5rem", letterSpacing: "-0.04em" }}>
            404
          </h1>
          <p style={{ fontSize: "1.5rem", fontWeight: 500, opacity: 0.9, maxWidth: "400px", lineHeight: 1.4 }}>
            Looks like we got lost on the service zone.
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

      {/* Content Side Panel */}
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
        
        <div style={{ marginBottom: "2.5rem" }}>
          <div style={{ width: "64px", height: "64px", backgroundColor: "rgba(37, 99, 235, 0.1)", color: "var(--color-primary)", borderRadius: "16px", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
            <MapPinOff size={32} />
          </div>
          <h2 style={{ fontSize: "2.25rem", fontWeight: 700, color: "var(--color-text)", marginBottom: "0.75rem", letterSpacing: "-0.025em" }}>
            Page Not Found
          </h2>
          <p style={{ color: "var(--color-text-muted)", fontSize: "1rem", lineHeight: 1.6, marginBottom: "2rem" }}>
            The page you're looking for doesn't exist or has been moved. Let's get you back on track.
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Link 
              href="/login" 
              className="btn btn-primary"
              style={{ padding: "0.875rem", fontSize: "1rem", display: "flex", justifyContent: "center" }}
            >
              Go to Dashboard
            </Link>
            <Link 
              href="/" 
              className="btn btn-ghost"
              style={{ padding: "0.875rem", fontSize: "1rem", display: "flex", justifyContent: "center" }}
            >
              Return Home
            </Link>
          </div>
        </div>
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

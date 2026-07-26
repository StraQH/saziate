"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ResidentSidebar } from "@/components/resident/ResidentSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";
import { ForceChangePasswordModal } from "@/components/ui/ForceChangePasswordModal";

export default function ResidentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && (!user || user.role !== "resident")) {
      router.push("/login");
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full" style={{ height: "100vh" }}>
        <div className="spinner" />
      </div>
    );
  }

  if (!user || user.role !== "resident") {
    return null;
  }

  const hasDummyEmail = user.email?.endsWith("@saziate.com");

  return (
    <div className="app-shell pb-16 sm:pb-0">
      {(user as { mustChangePassword?: boolean }).mustChangePassword && <ForceChangePasswordModal />}
      <ResidentSidebar residentName={user.name || "Resident"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {hasDummyEmail && (
          <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: "var(--radius-sm)", padding: "1rem", color: "#92400e", fontSize: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem", margin: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 600 }}>
              <span>⚠️ Email Address Required</span>
            </div>
            <p style={{ margin: 0, opacity: 0.9, lineHeight: 1.4 }}>
              You do not have a valid email address configured on your account. Please <a href="/resident/profile" style={{ fontWeight: 600, textDecoration: "underline", color: "inherit" }}>update your email under Profile</a> to receive receipts, invoice statements, and billing notifications.
            </p>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

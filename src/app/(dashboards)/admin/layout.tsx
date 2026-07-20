"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && (!user || user.role !== "admin")) {
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

  if (!user || user.role !== "admin") {
    return null;
  }

  return (
    <div className="app-shell">
      <AdminSidebar adminName={user.name || "Platform Admin"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {children}
      </main>
    </div>
  );
}

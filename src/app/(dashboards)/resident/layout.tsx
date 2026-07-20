"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ResidentSidebar } from "@/components/resident/ResidentSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";

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

  return (
    <div className="app-shell pb-16 sm:pb-0">
      <ResidentSidebar residentName={user.name || "Resident"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {children}
      </main>
    </div>
  );
}

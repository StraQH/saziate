"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { PSPSidebar } from "@/components/psp/PSPSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";

export default function PSPLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && (!user || user.role !== "psp_operator")) {
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

  if (!user || user.role !== "psp_operator") {
    return null;
  }

  return (
    <div className="app-shell pb-16 sm:pb-0">
      <PSPSidebar pspName={user.name || "PSP Operator"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {children}
      </main>
    </div>
  );
}

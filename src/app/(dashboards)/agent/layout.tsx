"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AgentSidebar } from "@/components/agent/AgentSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && (!user || user.role !== "field_agent")) {
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

  if (!user || user.role !== "field_agent") {
    return null;
  }

  return (
    <div className="app-shell pb-16 sm:pb-0">
      <AgentSidebar agentName={user.name || "Field Agent"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {children}
      </main>
    </div>
  );
}

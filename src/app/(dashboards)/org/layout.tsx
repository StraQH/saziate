"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { OrgSidebar } from "@/components/org/OrgSidebar";
import { useSession } from "@/components/providers/SessionProvider";
import { OfflineSyncBanner } from "@/components/ui/OfflineSyncBanner";
import { ForceChangePasswordModal } from "@/components/ui/ForceChangePasswordModal";

export default function OrgLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, loading } = useSession();

  useEffect(() => {
    if (!loading && (!user || user.role !== "org_admin")) {
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

  if (!user || user.role !== "org_admin") {
    return null;
  }

  return (
    <div className="app-shell pb-16 sm:pb-0">
      {(user as { mustChangePassword?: boolean }).mustChangePassword && <ForceChangePasswordModal />}
      <OrgSidebar orgName={user.name || "Org Operator"} />
      <main className="main-content">
        <OfflineSyncBanner />
        {children}
      </main>
    </div>
  );
}

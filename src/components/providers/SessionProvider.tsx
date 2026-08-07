"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { config } from "@/lib/config";
import { MOCK_ORG_ID } from "@/lib/mockdata";

interface UserSession {
  id: string;
  name: string;
  email: string;
  role: "admin" | "org_admin" | "field_agent" | "resident";
  orgId: string | null;
  orgServiceType: string;
}

interface SessionContextType {
  user: UserSession | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function getMockUser(pathname: string): UserSession | null {
  if (pathname.startsWith("/org")) {
    return {
      id: "org1",
      name: "Acme Operator",
      email: "ops@metro-waste.com",
      role: "org_admin",
      orgId: MOCK_ORG_ID,
      orgServiceType: "general",
    };
  }
  if (pathname.startsWith("/agent")) {
    return {
      id: "ag_johnson",
      name: "Field Agent Johnson",
      email: "agent@metro-waste.com",
      role: "field_agent",
      orgId: MOCK_ORG_ID,
      orgServiceType: "general",
    };
  }
  if (pathname.startsWith("/admin")) {
    return {
      id: "adm1",
      name: "Platform Admin",
      email: "admin@saziate.com",
      role: "admin",
      orgId: null,
      orgServiceType: "platform",
    };
  }
  if (pathname.startsWith("/resident")) {
    return {
      id: "r1",
      name: "John Doe",
      email: "john.doe@example.com",
      role: "resident",
      orgId: MOCK_ORG_ID,
      orgServiceType: "general",
    };
  }
  return null;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [liveUser, setLiveUser] = useState<UserSession | null>(null);
  const [liveLoading, setLiveLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("Saziate Service Worker registered successfully:", reg.scope);
        })
        .catch((err) => {
          console.error("Service Worker registration failed:", err);
        });
    }
  }, []);

  useEffect(() => {
    if (config.isMockMode) return;

    // Fetch live session via Better Auth Client SDK
    const fetchSession = async () => {
      setLiveLoading(true);
      try {
        const { data, error } = await authClient.getSession();
        if (error || !data?.user) {
          setLiveUser(null);
        } else {
          setLiveUser({
            id: data.user.id,
            name: data.user.name,
            email: data.user.email,
            role: ((data.user as any).role || "org_admin") as any,
            orgId: (data.user as any).orgId || null,
            orgServiceType: (data.user as any).orgServiceType || "waste_management",
          });
        }
      } catch {
        setLiveUser(null);
      } finally {
        setLiveLoading(false);
      }
    };

    fetchSession();
  }, []);

  const user = config.isMockMode ? getMockUser(pathname) : liveUser;
  const loading = config.isMockMode ? false : liveLoading;

  const logout = async () => {
    if (config.isMockMode) {
      router.push("/login");
      return;
    }

    try {
      await authClient.signOut();
      setLiveUser(null);
      window.location.href = "/login";
    } catch (err) {
      console.error("Sign out failed:", err);
      // Fallback
      window.location.href = "/login";
    }
  };

  return (
    <SessionContext.Provider value={{ user, loading, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within a SessionProvider");
  }
  return context;
}

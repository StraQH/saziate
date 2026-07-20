"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { config } from "@/lib/config";
import { MOCK_PSP_ID } from "@/lib/mockdata";

interface UserSession {
  id: string;
  name: string;
  email: string;
  role: "admin" | "psp_operator" | "field_agent" | "resident";
  pspId: string | null;
}

interface SessionContextType {
  user: UserSession | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const SessionContext = createContext<SessionContextType | undefined>(undefined);

function getMockUser(pathname: string): UserSession | null {
  if (pathname.startsWith("/psp")) {
    return {
      id: "psp1",
      name: "Lekki Operator",
      email: "ops@lekkigreenclean.com",
      role: "psp_operator",
      pspId: MOCK_PSP_ID,
    };
  }
  if (pathname.startsWith("/agent")) {
    return {
      id: "ag_johnson",
      name: "Field Agent Johnson",
      email: "johnson@lekkigreenclean.com",
      role: "field_agent",
      pspId: MOCK_PSP_ID,
    };
  }
  if (pathname.startsWith("/admin")) {
    return {
      id: "adm1",
      name: "Platform Admin",
      email: "admin@saziate.com",
      role: "admin",
      pspId: null,
    };
  }
  if (pathname.startsWith("/resident")) {
    return {
      id: "r1",
      name: "Babajide Sanwo",
      email: "b.sanwo@gmail.com",
      role: "resident",
      pspId: MOCK_PSP_ID,
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
            role: (data.user as any).role || "psp_operator",
            pspId: (data.user as any).pspId || null,
          });
        }
      } catch {
        setLiveUser(null);
      } finally {
        setLiveLoading(false);
      }
    };

    fetchSession();
  }, [pathname]);

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
      router.push("/login");
    } catch (err) {
      console.error("Sign out failed:", err);
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShieldCheck,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSession } from "@/components/providers/SessionProvider";

const navItems = [
  { href: "/admin",             label: "Dashboard",   icon: LayoutDashboard },
];

export function AdminSidebar({ adminName }: { adminName: string }) {
  const pathname = usePathname();
  const { logout } = useSession();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <img src="/logo.svg" alt="Saziate Logo" style={{ height: "32px", objectFit: "contain" }} />
      </div>

      <div style={{ marginBottom: "1.5rem", padding: "0 0.5rem" }}>
        <p className="text-xs text-muted" style={{ marginBottom: "0.25rem" }}>
          Platform Admin
        </p>
        <p className="font-semibold" style={{ fontSize: "0.9375rem", lineHeight: 1.3 }}>
          {adminName}
        </p>
      </div>

      <nav className="sidebar-nav">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("nav-link", isActive && "active")}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <button className="nav-link" style={{ marginTop: "auto", color: "var(--color-danger)" }} onClick={logout}>
        <LogOut size={18} />
        Sign out
      </button>
    </aside>
  );
}

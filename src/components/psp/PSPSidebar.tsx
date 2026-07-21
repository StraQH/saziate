"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  MapPin,
  FileText,
  Truck,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useSession } from "@/components/providers/SessionProvider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/psp",             label: "Dashboard",   icon: LayoutDashboard },
  { href: "/psp/residents",   label: "Residents",   icon: Users },
  { href: "/psp/agents",      label: "Field Agents",icon: Users },
  { href: "/psp/routes",      label: "Routes",      icon: MapPin },
  { href: "/psp/billing",     label: "Billing",     icon: FileText },
  { href: "/psp/collections", label: "Collections Feed", icon: Truck },
  { href: "/psp/field-route", label: "Log Route",   icon: MapPin },
  { href: "/psp/field-cash",  label: "Log Cash",    icon: FileText },
  { href: "/psp/settings",    label: "Settings",    icon: Settings },
];

export function PSPSidebar({ pspName }: { pspName: string }) {
  const pathname = usePathname();
  const { logout } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="mobile-header">
        <button onClick={() => setIsOpen(true)} className="p-2 -ml-2" aria-label="Open menu">
          <Menu size={24} style={{ color: "var(--color-text)" }} />
        </button>
        <span style={{ marginLeft: "1rem" }}><img src="/logo.svg" alt="Saziate Logo" style={{ height: "24px", objectFit: "contain" }} /></span>
      </div>

      <div 
        className={cn("sidebar-overlay", isOpen && "open")} 
        onClick={() => setIsOpen(false)} 
      />

      <aside className={cn("sidebar", isOpen && "open")}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem", padding: "0 0.5rem" }}>
          <div className="sidebar-logo" style={{ margin: 0, padding: 0 }}><img src="/logo.svg" alt="Saziate Logo" style={{ height: "32px", objectFit: "contain" }} /></div>
          {isOpen && (
            <button onClick={() => setIsOpen(false)} style={{ background: "none", border: "none", color: "var(--color-text-muted)" }}>
              <X size={24} />
            </button>
          )}
        </div>

        <div style={{ marginBottom: "1.5rem", padding: "0 0.5rem" }}>
          <p className="text-xs text-muted" style={{ marginBottom: "0.25rem" }}>
            Operator
          </p>
          <p className="font-semibold" style={{ fontSize: "0.9375rem", lineHeight: 1.3 }}>
            {pspName}
          </p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/psp" ? pathname === "/psp" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                onClick={() => setIsOpen(false)}
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
    </>
  );
}

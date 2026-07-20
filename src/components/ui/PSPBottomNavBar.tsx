"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, MapPin, FileText, Truck, Settings } from "lucide-react";

export function PSPBottomNavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/psp", icon: LayoutDashboard, label: "Home" },
    { href: "/psp/residents", icon: Users, label: "Residents" },
    { href: "/psp/routes", icon: MapPin, label: "Routes" },
    { href: "/psp/billing", icon: FileText, label: "Billing" },
    { href: "/psp/collections", icon: Truck, label: "Logs" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 sm:hidden z-50 overflow-x-auto">
      <div className="flex items-center h-16 min-w-max px-2">
        {links.map((link) => {
          const isActive = pathname === link.href || (link.href !== "/psp" && pathname.startsWith(link.href));
          const Icon = link.icon;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex flex-col items-center justify-center w-16 h-full space-y-1 mx-1 ${
                isActive ? "text-[var(--color-primary)]" : "text-gray-500 hover:text-gray-900"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{link.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

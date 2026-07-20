"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Users, User } from "lucide-react";

export function AgentBottomNavBar() {
  const pathname = usePathname();

  const links = [
    { href: "/agent", icon: LayoutDashboard, label: "Home" },
    { href: "/agent/collections", icon: Users, label: "Collections" },
    { href: "/agent/profile", icon: User, label: "Profile" },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 sm:hidden z-50">
      <div className="flex justify-around items-center h-16">
        {links.map((link) => {
          const isActive = pathname === link.href;
          const Icon = link.icon;
          return (
            <Link 
              key={link.href} 
              href={link.href}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${
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

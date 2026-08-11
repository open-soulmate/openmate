"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  MessageSquare,
  BookOpen,
  Network,
  Search,
  Puzzle,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

const navItems = [
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/graph", label: "Graph", icon: Network },
  { href: "/search", label: "Search", icon: Search },
  { href: "/skills", label: "Skills", icon: Puzzle },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex h-screen flex-col border-r border-border bg-sidebar transition-all duration-200",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Header */}
      <div className="flex h-14 items-center justify-between px-4">
        {!collapsed && (
          <span className="text-sm font-semibold tracking-tight text-foreground">
            OpenMate
          </span>
        )}
        <button
          onClick={toggle}
          className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
        >
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              <item.icon size={18} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t border-border px-2 py-3">
        <div className="flex items-center gap-3 px-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            U
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground">User</span>
              <span className="text-xs text-muted-foreground">Free Plan</span>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import {
  MessageSquare,
  BookOpen,
  GraduationCap,
  Network,
  Search,
  Puzzle,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Server,
  Workflow,
  Plug,
  Users,
  GitBranch,
} from "lucide-react";
import { useState, useRef, useCallback } from "react";

export function AppShell() {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { t } = useTranslation();

  const navItems = [
    { href: "/chat", label: t("nav.chat"), icon: MessageSquare },
    { href: "/knowledge", label: t("nav.knowledge"), icon: BookOpen },
    { href: "/learn", label: t("nav.learn"), icon: GraduationCap },
    { href: "/graph", label: t("nav.graph"), icon: Network },
    { href: "/search", label: t("nav.search"), icon: Search },
    { href: "/skills", label: t("nav.skills"), icon: Puzzle },
    { href: "/mcp", label: t("nav.mcp"), icon: Plug },
    { href: "/agents", label: t("nav.agents"), icon: Server },
    { href: "/groups", label: t("nav.groups"), icon: Users },
    { href: "/workflow", label: t("nav.workflow"), icon: Workflow },
    { href: "/workflow-builder", label: t("nav.workflowBuilder"), icon: GitBranch },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const isExpanded = !collapsed || hoverExpanded;

  const handleMouseEnter = useCallback(() => {
    if (collapsed) {
      hoverTimer.current = setTimeout(() => setHoverExpanded(true), 200);
    }
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHoverExpanded(false);
  }, []);

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "hidden h-screen flex-col border-r border-border bg-sidebar transition-all duration-200 md:flex",
          isExpanded ? "w-60" : "w-16",
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          {isExpanded && (
            <span className="text-sm font-semibold tracking-tight text-foreground">
              OpenMate
            </span>
          )}
          <button
            onClick={toggle}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
              !isExpanded && "mx-auto",
            )}
          >
            {isExpanded ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-2 py-2">
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
                  !isExpanded && "justify-center",
                )}
              >
                <item.icon size={18} />
                {isExpanded && <span suppressHydrationWarning>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-border px-2 py-3">
          <div
            className={cn(
              "flex items-center gap-3 px-3",
              !isExpanded && "justify-center",
            )}
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              U
            </div>
            {isExpanded && (
              <div className="flex flex-col overflow-hidden">
                <span className="truncate text-sm font-medium text-foreground">
                  User
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  Free Plan
                </span>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-around border-t border-border bg-sidebar px-2 md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] transition-colors",
                active
                  ? "text-foreground"
                  : "text-sidebar-foreground",
              )}
            >
              <item.icon size={20} />
              <span suppressHydrationWarning>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

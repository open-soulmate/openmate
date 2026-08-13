"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, BookOpen, GraduationCap, Network, Search,
  Puzzle, Settings, PanelLeftClose, PanelLeftOpen, Server,
  Workflow, Plug, Users, GitBranch, Clock,
  User, Moon, Sun, FileText, MessageCircle, LogOut,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { getUserId } from "@/lib/api-client";
import { type ThemeId, persistTheme } from "@/lib/theme";

export function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const menuRef = useRef<HTMLDivElement>(null);
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
    { href: "/cron", label: t("nav.cron"), icon: Clock },
    { href: "/workflow", label: t("nav.workflow"), icon: Workflow },
    { href: "/workflow-builder", label: t("nav.workflowBuilder"), icon: GitBranch },
    { href: "/settings", label: t("nav.settings"), icon: Settings },
  ];

  const isExpanded = !collapsed || hoverExpanded;
  const userId = getUserId() || "User";

  const handleMouseEnter = useCallback(() => {
    if (collapsed) {
      hoverTimer.current = setTimeout(() => setHoverExpanded(true), 200);
    }
  }, [collapsed]);

  const handleMouseLeave = useCallback(() => {
    clearTimeout(hoverTimer.current);
    setHoverExpanded(false);
  }, []);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  function toggleTheme() {
    const next: ThemeId = storeTheme === "dark" ? "light" : storeTheme === "light" ? "purple" : "dark";
    persistTheme(next);
    setStoreTheme(next);
  }

  function handleLogout() {
    localStorage.removeItem("openmate-token");
    localStorage.removeItem("openmate-api-url");
    window.location.href = "/login";
  }

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "hidden h-screen flex-col border-r border-border bg-sidebar transition-all duration-200 md:flex",
          isExpanded ? "w-60" : "w-16"
        )}
      >
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between px-4">
          {isExpanded && (
            <span className="text-sm font-semibold tracking-tight text-foreground">OpenMate</span>
          )}
          <button onClick={toggle}
            className={cn("flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground", !isExpanded && "mx-auto")}>
            {isExpanded ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-0.5 px-2 py-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={cn("flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                  !isExpanded && "justify-center")}>
                <item.icon size={18} />
                {isExpanded && <span suppressHydrationWarning>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* Footer - User Account Menu */}
        <div className="border-t border-border px-2 py-3 relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)}
            className={cn("flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent", !isExpanded && "justify-center")}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
              {userId[0].toUpperCase()}
            </div>
            {isExpanded && (
              <div className="flex flex-col items-start min-w-0">
                <span className="truncate text-sm font-medium text-foreground">{userId}</span>
                <span className="text-[10px] text-muted-foreground">OpenMate v0.1.0</span>
              </div>
            )}
          </button>

          {/* Account Menu Popover - Paperclip style */}
          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50">
              {/* User header */}
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {userId[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{userId}</div>
                    <div className="text-xs text-muted-foreground">已登录</div>
                  </div>
                </div>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <MenuItem icon={User} label="查看资料" description="查看你的活动和使用记录" onClick={() => { router.push("/settings"); setMenuOpen(false); }} />
                <MenuItem icon={Settings} label="编辑资料" description="更新显示名称和头像" onClick={() => { router.push("/settings"); setMenuOpen(false); }} />
                <MenuItem icon={FileText} label="使用文档" description="打开 OpenMate 文档" onClick={() => window.open("https://github.com/open-soulmate/openmate", "_blank")} />
                <MenuItem icon={MessageCircle} label="反馈" description="分享反馈或报告问题" onClick={() => window.open("https://github.com/open-soulmate/openmate/issues", "_blank")} />

                {/* Theme toggle */}
                <button onClick={toggleTheme}
                  className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                  <div className="mt-0.5 text-muted-foreground">
                    {storeTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{storeTheme === "dark" ? "切换到浅色模式" : storeTheme === "light" ? "切换到紫色模式" : "切换到深色模式"}</div>
                    <div className="text-xs text-muted-foreground">切换界面外观</div>
                  </div>
                </button>
              </div>

              {/* Sign out */}
              <div className="border-t border-border py-1">
                <button onClick={handleLogout}
                  className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                  <div className="mt-0.5 text-muted-foreground"><LogOut size={16} /></div>
                  <div>
                    <div className="text-sm">退出登录</div>
                    <div className="text-xs text-muted-foreground">结束本次会话</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-around border-t border-border bg-sidebar px-2 md:hidden">
        {navItems.slice(0, 5).map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className={cn("flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] transition-colors",
                active ? "text-foreground" : "text-sidebar-foreground")}>
              <item.icon size={20} />
              <span suppressHydrationWarning>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

function MenuItem({ icon: Icon, label, description, onClick }: { icon: React.ElementType; label: string; description: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
      <div className="mt-0.5 text-muted-foreground"><Icon size={16} /></div>
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </button>
  );
}

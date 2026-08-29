"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, BookOpen, GraduationCap, Network, Search,
  Puzzle, Settings, Server,
  Workflow, Plug, Users, GitBranch, Clock, Download,
  User, Moon, Sun, FileText, MessageCircle, LogOut,
  LayoutDashboard, FolderKanban, Share2, ChevronDown,
  Droplets, Eye, Shield, Bone, Dna, Volume2, Layers, Link2,
  Zap, Activity, Sparkles, Brain, Bolt, Heart, Home,
  MousePointer, Mic, ImageIcon, Smile, Stethoscope, Cpu, Bot, Store,
  Camera, ScrollText, Bell,
  Pill,
  History,
  Gauge,
  BarChart3,
  Package,
  Tag,
} from "lucide-react";
import { useState, useEffect } from "react";
import { getUserId, getUserName, getApiBaseUrl } from "@/lib/api-client";
import { type ThemeId, persistTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function MobileSidebar({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [pluginGroups, setPluginGroups] = useState<NavGroup[]>([]);

  const userId = getUserName() || getUserId() || "User";

  // Close on navigation
  useEffect(() => {
    onOpenChange(false);
  }, [pathname]);

  // Fetch plugins
  useEffect(() => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    fetch(`${apiBase}/api/plugins/sidebar`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items: { group: string; label: string; href: string; icon?: string }[]) => {
        if (!Array.isArray(items) || items.length === 0) return;
        const grouped = new Map<string, NavItem[]>();
        for (const item of items) {
          const groupName = (item.group || "Plugins").toUpperCase() === "PLUGINS" ? "Plugins" : item.group || "Plugins";
          const arr = grouped.get(groupName) || [];
          arr.push({ href: item.href, label: item.label, icon: Plug });
          grouped.set(groupName, arr);
        }
        setPluginGroups(
          Array.from(grouped.entries()).map(([label, navItems]) => ({
            label: label === "Plugins" || label === "PLUGINS" ? t("nav.plugins") : label,
            items: navItems,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const navGroups: NavGroup[] = [
    {
      label: t("nav.core"),
      items: [
        { href: "/chat", label: t("nav.chat"), icon: MessageSquare },
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
        { href: "/notifications", label: t("nav.notifications"), icon: Bell },
      ],
    },
    {
      label: t("nav.aiGroup"),
      items: [
        { href: "/ai-groups", label: t("nav.aiGroups"), icon: Users },
        { href: "/agents", label: t("nav.agents"), icon: Server },
      ],
    },
    {
      label: t("nav.knowledgeGroup"),
      items: [
        { href: "/knowledge", label: t("nav.knowledge"), icon: BookOpen },
        { href: "/learn", label: t("nav.learn"), icon: GraduationCap },
        { href: "/graph", label: t("nav.graph"), icon: Network },
        { href: "/graph-builder", label: t("nav.graphBuilder"), icon: Share2 },
        { href: "/search", label: t("nav.search"), icon: Search },
        { href: "/kb-sharing", label: t("nav.kbSharing", "KB Sharing"), icon: Share2 },
        { href: "/knowledge-requests", label: t("nav.knowledgeRequests", "KB Requests"), icon: FileText },
      ],
    },
    {
      label: t("nav.automationGroup"),
      items: [
        { href: "/cron", label: t("nav.cron"), icon: Clock },
        { href: "/workflow", label: t("nav.workflow"), icon: Workflow },
        { href: "/workflow", label: t("nav.workflow"), icon: GitBranch },
        { href: "/pipeline", label: t("nav.pipeline"), icon: Zap },
        { href: "/will", label: t("nav.will"), icon: Sparkles },
      ],
    },
    {
      label: t("nav.toolsGroup"),
      items: [
        { href: "/skills", label: t("nav.skills"), icon: Puzzle },
        { href: "/mcp", label: t("nav.mcp"), icon: Plug },
        { href: "/workspace", label: t("nav.workspace"), icon: FolderKanban },
        { href: "/capture", label: t("nav.capture"), icon: Camera },
        { href: "/download", label: t("nav.download"), icon: Download },
        { href: "/tags", label: t("nav.tags", "Tags"), icon: Tag },
      ],
    },
    {
      label: t("nav.systemGroup"),
      items: [
        { href: "/sessions", label: t("nav.sessions", "Sessions"), icon: History },
        { href: "/settings", label: t("nav.settings"), icon: Settings },
        { href: "/diagnostics", label: t("nav.diagnostics"), icon: Stethoscope },
        { href: "/system", label: t("nav.system") || "System", icon: Server },
        { href: "/admin", label: t("nav.admin"), icon: Shield },
        { href: "/metrics", label: t("nav.metrics") || "Metrics", icon: BarChart3 },
      ],
    },
  ];

  const allNavGroups: NavGroup[] = (() => {
    if (pluginGroups.length === 0) return navGroups;
    const result: NavGroup[] = [];
    for (const group of navGroups) {
      result.push(group);
      if (group.label === t("nav.systemGroup")) {
        result.push(...pluginGroups);
      }
    }
    return result;
  })();

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

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
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[280px] p-0 bg-sidebar border-sidebar-border">
        <SheetHeader className="h-12 flex flex-row items-center px-4 border-b border-sidebar-border">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
            OM
          </div>
          <SheetTitle className="ml-3 text-sm font-semibold text-foreground">OpenMate</SheetTitle>
        </SheetHeader>

        <nav className="flex-1 overflow-y-auto py-2 px-2">
          {allNavGroups.map((group) => {
            const groupCollapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                <button
                  onClick={() => toggleGroup(group.label)}
                  className="flex w-full items-center h-7 px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <span className="flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={cn("transition-transform", groupCollapsed && "-rotate-90")}
                  />
                </button>
                {!groupCollapsed && (
                  <div className="flex flex-col gap-0.5">
                    {group.items.map((item) => {
                      const active = pathname.startsWith(item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex items-center h-8 px-2 rounded-md text-[13px] font-medium transition-colors",
                            active
                              ? "bg-[rgba(124,58,237,0.12)] text-[#7c3aed] border-l-2 border-[#7c3aed]"
                              : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground border-l-2 border-transparent"
                          )}
                        >
                          <item.icon size={15} className="shrink-0" />
                          <span className="ml-2.5">{item.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
              {userId[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-foreground truncate">{userId}</div>
              <div className="text-[10px] text-muted-foreground">v0.1.0</div>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={toggleTheme}
              className="flex-1 flex items-center justify-center h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              title={storeTheme === "dark" ? "Switch to Light" : "Switch to Dark"}
            >
              {storeTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={() => { router.push("/settings#account"); onOpenChange(false); }}
              className="flex-1 flex items-center justify-center h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              title="Settings"
            >
              <Settings size={14} />
            </button>
            <button
              onClick={handleLogout}
              className="flex-1 flex items-center justify-center h-8 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

"use client";
import { TerminalPanel } from "@/components/terminal-panel";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, BookOpen, GraduationCap, Network, Search,
  Puzzle, Settings, PanelLeftClose, PanelLeftOpen, Server,
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
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { getUserId, getApiBaseUrl } from "@/lib/api-client";
import { type ThemeId, persistTheme } from "@/lib/theme";

// Paperclip-style sidebar: fixed icon column, text hides on collapse
// Expanded: 240px, icon at 12px left, text flows right
// Collapsed: 56px, icon stays at same position, text hidden

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function AppShell() {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([t("nav.internalServices")]))
  const [pluginGroups, setPluginGroups] = useState<NavGroup[]>([])
  const [eventCount, setEventCount] = useState(0)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    fetch(`${apiBase}/api/plugins/sidebar`)
      .then((res) => (res.ok ? res.json() : []))
      .then((items: { group: string; label: string; href: string; icon?: string }[]) => {
        if (!Array.isArray(items) || items.length === 0) return;
        const grouped = new Map<string, NavItem[]>();
        for (const item of items) {
          const arr = grouped.get(item.group) || [];
          arr.push({ href: item.href, label: item.label, icon: Plug });
          grouped.set(item.group, arr);
        }
        setPluginGroups(
          Array.from(grouped.entries()).map(([label, navItems]) => ({ label, items: navItems }))
        );
      })
      .catch(() => {});
  }, []);

  // Fetch event count for notification badge
  useEffect(() => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    const fetchEvents = () => {
      fetch(`${apiBase}/api/events/summary`)
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.total_events) setEventCount(Math.min(data.total_events, 99));
        })
        .catch(() => {});
    };
    fetchEvents();
    const interval = setInterval(fetchEvents, 30000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  const navGroups: NavGroup[] = [
    {
      label: t("nav.core"),
      items: [
        { href: "/chat", label: t("nav.chat"), icon: MessageSquare },
        { href: "/ai-groups", label: t("nav.aiGroups"), icon: Users },
        { href: "/dashboard", label: t("nav.dashboard"), icon: LayoutDashboard },
        { href: "/body-map", label: t("nav.bodyMap"), icon: Activity },
        { href: "/activity", label: t("nav.activity"), icon: Activity },
        { href: "/notifications", label: t("nav.notifications"), icon: Bell },
        { href: "/gland", label: t("nav.gland"), icon: Zap },
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
      ],
    },
    {
      label: t("nav.toolsGroup"),
      items: [
        { href: "/skills", label: t("nav.skills"), icon: Puzzle },
        { href: "/mcp", label: t("nav.mcp"), icon: Plug },
        { href: "/agents", label: t("nav.agents"), icon: Server },
        { href: "/groups", label: t("nav.groups"), icon: Users },
        { href: "/team", label: t("nav.team"), icon: Users },
        { href: "/workspace", label: t("nav.workspace"), icon: FolderKanban },
      ],
    },
    {
      label: t("nav.automationGroup"),
      items: [
        { href: "/cron", label: t("nav.cron"), icon: Clock },
        { href: "/workflow", label: t("nav.workflow"), icon: Workflow },
        { href: "/workflow-builder", label: t("nav.workflowBuilder"), icon: GitBranch },
        { href: "/will", label: t("nav.will"), icon: Sparkles },
      ],
    },
    {
      label: t("nav.organsGroup"),
      items: [
        { href: "/soma", label: t("nav.soma"), icon: Bot },
        { href: "/cortex", label: t("nav.cortex"), icon: Cpu },
        { href: "/vein", label: t("nav.vein"), icon: Droplets },
        { href: "/gene", label: t("nav.gene"), icon: Dna },
        { href: "/vital", label: t("nav.vital"), icon: Activity },
        { href: "/hippo", label: t("nav.hippo"), icon: Brain },
        { href: "/reflex", label: t("nav.reflex"), icon: Bolt },
        { href: "/heredity", label: t("nav.heredity"), icon: GitBranch },
        { href: "/pulse", label: t("nav.pulse"), icon: Heart },
      ],
    },
    {
      label: t("nav.internalServices"),
      items: [
        { href: "/nerve", label: t("nav.nerve"), icon: Zap },
        { href: "/sense", label: t("nav.sense"), icon: Eye },
        { href: "/immune", label: t("nav.immune"), icon: Shield },
        { href: "/marrow", label: t("nav.marrow"), icon: Bone },
        { href: "/echo", label: t("nav.echo"), icon: Volume2 },
        { href: "/mirror", label: t("nav.mirror"), icon: Layers },
        { href: "/link", label: t("nav.link"), icon: Link2 },
        { href: "/capture", label: t("nav.capture"), icon: Camera },
        { href: "/pipeline", label: t("nav.pipeline"), icon: Zap },
        { href: "/nest", label: t("nav.nest"), icon: Home },
        { href: "/limb", label: t("nav.limb"), icon: MousePointer },
        { href: "/voice", label: t("nav.voice"), icon: Mic },
        { href: "/vision", label: t("nav.vision"), icon: ImageIcon },
        { href: "/mind", label: t("nav.mind"), icon: Smile },
      ],
    },
    {
      label: t("nav.systemGroup"),
      items: [
        { href: "/healer", label: t("nav.healer"), icon: Pill },
        { href: "/intelligence", label: t("nav.intelligence"), icon: Brain },
        { href: "/topology", label: t("nav.topology"), icon: Network },
        { href: "/trajectory", label: t("nav.trajectory"), icon: Activity },
        { href: "/timeline", label: t("nav.timeline"), icon: History },
        { href: "/changelog", label: t("nav.changelog"), icon: ScrollText },
        { href: "/diagnostics", label: t("nav.diagnostics"), icon: Stethoscope },
        { href: "/benchmark", label: t("nav.benchmark"), icon: Gauge },
        { href: "/admin", label: t("nav.admin"), icon: Shield },
        { href: "/download", label: t("nav.download"), icon: Download },
        { href: "/plugins", label: t("nav.plugins"), icon: Puzzle },
        { href: "/marketplace", label: t("nav.marketplace"), icon: Store },
        { href: "/settings", label: t("nav.settings"), icon: Settings },
      ],
    },
  ];

  // Insert plugin groups between "内部服务" and "系统"
  const allNavGroups: NavGroup[] = (() => {
    if (pluginGroups.length === 0) return navGroups;
    const result: NavGroup[] = [];
    for (const group of navGroups) {
      result.push(group);
      if (group.label === (t("nav.internalServices"))) {
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
      {/* Desktop sidebar - Paperclip style */}
      <aside
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "hidden h-screen flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex",
          isExpanded ? "w-60" : "w-14"
        )}
      >
        {/* Header: brand + collapse toggle */}
        <div className="flex h-12 shrink-0 items-center px-3">
          <div className="flex w-8 shrink-0 items-center justify-center">
            <span className={cn("text-sm font-bold text-primary transition-opacity duration-150", isExpanded ? "opacity-100" : "opacity-0 w-0 overflow-hidden")}>OM</span>
          </div>
          <div className={cn("flex-1 min-w-0 transition-all duration-150", isExpanded ? "ml-2 opacity-100" : "w-0 opacity-0 overflow-hidden")}>
            <span className="text-sm font-semibold text-foreground whitespace-nowrap">OpenMate</span>
          </div>
          <button onClick={toggle}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors">
            {isExpanded ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
          </button>
        </div>

        {/* Navigation - grouped, fixed icon column + flowing text */}
        <nav className="flex-1 overflow-y-auto px-2 py-1">
          {allNavGroups.map((group) => {
            const groupCollapsed = collapsedGroups.has(group.label);
            return (
              <div key={group.label} className="mb-1">
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.label)}
                  className={cn(
                    "flex h-7 w-full items-center rounded-md text-[11px] font-medium uppercase tracking-wider transition-colors",
                    isExpanded ? "px-2 text-muted-foreground hover:text-foreground" : "justify-center text-muted-foreground"
                  )}
                >
                  {isExpanded ? (
                    <>
                      <span className="flex-1 text-left">{group.label}</span>
                      <ChevronDown size={12} className={cn("transition-transform", groupCollapsed && "-rotate-90")} />
                    </>
                  ) : (
                    <div className="h-px w-4 bg-border" />
                  )}
                </button>
                {/* Group items */}
                {!groupCollapsed && group.items.map((item) => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link key={item.href} href={item.href}
                      className={cn(
                        "flex h-8 items-center rounded-md text-sm transition-colors group mb-0.5",
                        active ? "bg-sidebar-accent text-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground"
                      )}>
                      {/* Fixed icon column: 32px wide, icon always centered at same position */}
                      <div className="flex w-8 shrink-0 items-center justify-center">
                        <item.icon size={16} />
                      </div>
                      {/* Text column: hidden when collapsed */}
                      <span className={cn(
                        "truncate whitespace-nowrap transition-all duration-150",
                        isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
                      )} suppressHydrationWarning>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Notification Bell + Footer - User Account */}
        <div className="border-t border-border px-2 py-2 space-y-1">
          {/* Notification Bell */}
          <Link href="/activity" className="flex w-full items-center rounded-md py-1.5 text-sm transition-colors hover:bg-sidebar-accent">
            <div className="flex w-8 shrink-0 items-center justify-center">
              <div className="relative">
                <Activity size={16} className="text-muted-foreground" />
                {eventCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                    {eventCount > 9 ? "9+" : eventCount}
                  </span>
                )}
              </div>
            </div>
            <span className={cn(
              "truncate whitespace-nowrap transition-all duration-150 text-xs text-muted-foreground",
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
            )} suppressHydrationWarning>
              {t("nav.activity")}
            </span>
          </Link>

          {/* User Account */}
        <div className="relative" ref={menuRef}>
          <button onClick={() => setMenuOpen(!menuOpen)}
            className="flex w-full items-center rounded-md py-1.5 text-sm transition-colors hover:bg-sidebar-accent">
            {/* Fixed avatar column */}
            <div className="flex w-8 shrink-0 items-center justify-center">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {userId[0].toUpperCase()}
              </div>
            </div>
            {/* User info: hidden when collapsed */}
            <div className={cn(
              "flex flex-col items-start min-w-0 transition-all duration-150",
              isExpanded ? "opacity-100 w-auto" : "opacity-0 w-0 overflow-hidden"
            )}>
              <span className="truncate text-sm font-medium text-foreground">{userId}</span>
              <span className="text-[10px] text-muted-foreground">v0.1.0</span>
            </div>
          </button>

          {/* Account Menu Popover */}
          {menuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-64 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50">
              <div className="p-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {userId[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{userId}</div>
                    <div className="text-xs text-muted-foreground">{t("account.loggedIn")}</div>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <MenuItem icon={User} label={t("account.viewProfile")} description={t("account.viewProfileDesc")} onClick={() => { router.push("/settings#account"); setMenuOpen(false); }} />
                <MenuItem icon={Settings} label={t("account.editProfile")} description={t("account.editProfileDesc")} onClick={() => { router.push("/settings#account"); setMenuOpen(false); }} />
                <MenuItem icon={FileText} label={t("account.documentation")} description={t("account.documentationDesc")} onClick={() => window.open("https://github.com/open-soulmate/openmate", "_blank")} />
                <MenuItem icon={MessageCircle} label={t("account.feedback")} description={t("account.feedbackDesc")} onClick={() => window.open("https://github.com/open-soulmate/openmate/issues", "_blank")} />
                <button onClick={toggleTheme}
                  className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                  <div className="mt-0.5 text-muted-foreground">
                    {storeTheme === "dark" ? <Moon size={16} /> : <Sun size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{storeTheme === "dark" ? t("account.switchToLight") : storeTheme === "light" ? t("account.switchToPurple") : t("account.switchToDark")}</div>
                    <div className="text-xs text-muted-foreground">{t("account.switchTheme")}</div>
                  </div>
                </button>
              </div>
              <div className="border-t border-border py-1">
                <button onClick={handleLogout}
                  className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                  <div className="mt-0.5 text-muted-foreground"><LogOut size={16} /></div>
                  <div>
                    <div className="text-sm">{t("account.logout")}</div>
                    <div className="text-xs text-muted-foreground">{t("account.logoutDesc")}</div>
                  </div>
                </button>
              </div>
            </div>
          )}
        </div>
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex h-14 items-center justify-around border-t border-border bg-sidebar px-2 md:hidden">
        {navGroups.flatMap((g) => g.items).slice(0, 5).map((item) => {
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
      {/* Terminal Panel */}
      <TerminalPanel apiBase="" token={typeof window !== 'undefined' ? localStorage.getItem('openmate-token') || '' : ''} />
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

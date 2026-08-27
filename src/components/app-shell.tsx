"use client";
import { TerminalPanel } from "@/components/terminal-panel";
import { MobileSidebar } from "@/components/mobile-sidebar";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
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
import { useState, useRef, useCallback, useEffect } from "react";
import { getUserId, getUserName, getApiBaseUrl } from "@/lib/api-client";
import { type ThemeId, persistTheme } from "@/lib/theme";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const { t } = useTranslation();
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set([t("nav.internalServices")]))
  const [pluginGroups, setPluginGroups] = useState<NavGroup[]>([])
  const [eventCount, setEventCount] = useState(0)
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
          const groupName = (item.group || "Plugins").toUpperCase() === "PLUGINS" ? "Plugins" : item.group || "Plugins";
          const arr = grouped.get(groupName) || [];
          arr.push({ href: item.href, label: item.label, icon: Plug });
          grouped.set(groupName, arr);
        }
        setPluginGroups(
          Array.from(grouped.entries()).map(([label, navItems]) => ({
            label: label === "Plugins" || label === "PLUGINS" ? t("nav.plugins") : label,
            items: navItems
          }))
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
    const interval = setInterval(fetchEvents, 30000);
    return () => clearInterval(interval);
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
        { href: "/workflow-builder", label: t("nav.workflowBuilder"), icon: GitBranch },
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
      label: t("nav.organsGroup"),
      items: [
        { href: "/body-map", label: t("nav.bodyMap", "Body Map"), icon: User },
        { href: "/soma", label: t("nav.soma"), icon: Bot },
        { href: "/discovery", label: t("nav.discovery", "Discovery"), icon: Search },
        { href: "/cortex", label: t("nav.cortex"), icon: Cpu },
        { href: "/vein", label: t("nav.vein"), icon: Droplets },
        { href: "/gene", label: t("nav.gene"), icon: Dna },
        { href: "/vital", label: t("nav.vital"), icon: Activity },
        { href: "/gland", label: t("nav.gland"), icon: Zap },
        { href: "/hippo", label: t("nav.hippo"), icon: Brain },
        { href: "/reflex", label: t("nav.reflex"), icon: Bolt },
        { href: "/heredity", label: t("nav.heredity"), icon: GitBranch },
        { href: "/pulse", label: t("nav.pulse"), icon: Heart },
        { href: "/nerve", label: t("nav.nerve"), icon: Zap },
        { href: "/sense", label: t("nav.sense"), icon: Eye },
        { href: "/immune", label: t("nav.immune"), icon: Shield },
        { href: "/marrow", label: t("nav.marrow"), icon: Bone },
        { href: "/echo", label: t("nav.echo"), icon: Volume2 },
        { href: "/mirror", label: t("nav.mirror"), icon: Layers },
        { href: "/link", label: t("nav.link"), icon: Link2 },
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
        { href: "/system", label: t("nav.system") || "System", icon: Server },
        { href: "/soul", label: t("nav.soul"), icon: Brain },
        { href: "/soma-admin", label: t("nav.somaAdmin"), icon: Bot },
        { href: "/admin", label: t("nav.admin"), icon: Shield },
        { href: "/permission", label: t("nav.permission", "Permissions"), icon: Shield },
        { href: "/enterprise", label: t("nav.enterprise", "Enterprise"), icon: Shield },
        { href: "/sessions", label: t("nav.sessions", "Sessions"), icon: History },
        { href: "/diagnostics", label: t("nav.diagnostics"), icon: Stethoscope },
        { href: "/metrics", label: t("nav.metrics") || "Metrics", icon: BarChart3 },
        { href: "/benchmark", label: t("nav.benchmark"), icon: Gauge },
        { href: "/intelligence", label: t("nav.intelligence"), icon: Brain },
        { href: "/ai-engine", label: t("nav.aiEngine", "AI Engine"), icon: Cpu },
        { href: "/healer", label: t("nav.healer"), icon: Pill },
        { href: "/topology", label: t("nav.topology"), icon: Network },
        { href: "/registry", label: t("nav.registry", "Registry"), icon: Package },
        { href: "/trajectory", label: t("nav.trajectory"), icon: Activity },
        { href: "/timeline", label: t("nav.timeline"), icon: History },
        { href: "/changelog", label: t("nav.changelog"), icon: ScrollText },
        { href: "/plugins", label: t("nav.plugins"), icon: Puzzle },
        { href: "/marketplace", label: t("nav.marketplace"), icon: Store },
        { href: "/settings", label: t("nav.settings"), icon: Settings },
      ],
    },
  ];

  // Insert plugin groups between organs and system
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

  const userId = getUserName() || getUserId() || "User";

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
    <SidebarProvider open={!collapsed} onOpenChange={(open) => { if (open === collapsed) toggle(); }} className="h-svh overflow-hidden">
      {/* Desktop sidebar - shadcn/ui Sidebar component */}
      <Sidebar collapsible="icon" className="hidden md:flex">
        <SidebarHeader>
          <div className="flex h-12 shrink-0 items-center px-2">
            <span className="text-sm font-bold text-primary">OM</span>
            <span className="ml-2 text-sm font-semibold text-foreground group-data-[collapsible=icon]:hidden">
              OpenMate
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {allNavGroups.map((group) => {
            const groupCollapsed = collapsedGroups.has(group.label);
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupLabel
                  className="cursor-pointer select-none"
                  onClick={() => toggleGroup(group.label)}
                >
                  <span className="flex-1">{group.label}</span>
                  <ChevronDown
                    size={12}
                    className={cn(
                      "ml-auto transition-transform group-data-[collapsible=icon]:hidden",
                      groupCollapsed && "-rotate-90"
                    )}
                  />
                </SidebarGroupLabel>
                {!groupCollapsed && (
                  <SidebarGroupContent>
                    <SidebarMenu>
                      {group.items.map((item) => {
                        const active = pathname.startsWith(item.href);
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              asChild
                              isActive={active}
                              tooltip={item.label}
                              className={cn(
                                active && "[&]:bg-[rgba(124,58,237,0.12)] [&]:text-[#7c3aed] [&]:hover:bg-[rgba(124,58,237,0.18)] [&]:hover:text-[#7c3aed]"
                              )}
                            >
                              <Link href={item.href}>
                                <item.icon />
                                <span suppressHydrationWarning>{item.label}</span>
                              </Link>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                    </SidebarMenu>
                  </SidebarGroupContent>
                )}
              </SidebarGroup>
            );
          })}
        </SidebarContent>

        <SidebarFooter>
          {/* Notification Bell */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("nav.activity")}>
                <Link href="/activity">
                  <div className="relative">
                    <Activity size={16} />
                    {eventCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                        {eventCount > 9 ? "9+" : eventCount}
                      </span>
                    )}
                  </div>
                  <span suppressHydrationWarning>{t("nav.activity")}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>

          {/* User Account */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="flex w-full items-center gap-2 rounded-md p-2 text-sm transition-colors hover:bg-sidebar-accent"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {userId[0].toUpperCase()}
              </div>
              <div className="flex flex-col items-start min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
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
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* Mobile sidebar (Sheet) - visible below md */}
      <div className="md:hidden">
        <MobileSidebar open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen} />
      </div>

      {/* Main content area */}
      <SidebarInset className="min-h-0 overflow-hidden">
        {/* Mobile header with hamburger */}
        <div className="flex h-12 shrink-0 items-center border-b border-border bg-background px-4 md:hidden">
          <button
            onClick={() => setMobileSidebarOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
            aria-label="Open menu"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" x2="20" y1="6" y2="6" />
              <line x1="4" x2="20" y1="12" y2="12" />
              <line x1="4" x2="20" y1="18" y2="18" />
            </svg>
          </button>
          <h1 className="ml-3 text-sm font-semibold tracking-tight">OpenMate</h1>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </SidebarInset>


      {/* Terminal Panel */}
      <TerminalPanel apiBase="" token={typeof window !== 'undefined' ? localStorage.getItem('openmate-token') || '' : ''} />
    </SidebarProvider>
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

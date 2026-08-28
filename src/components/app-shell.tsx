"use client";
import { TerminalPanel } from "@/components/terminal-panel";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationCenter } from "@/components/notification-center";
import { useVisibilityPoll } from "@/hooks/use-visibility-poll";

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
  Plus,
  MoreHorizontal,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { getUserId, getUserName, getApiBaseUrl, getToken } from "@/lib/api-client";
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

// ── Conversation list types ──────────────────────────────────────────

interface SessionItem {
  id: string;
  name: string;
  title: string;
  platform: string;
  chat_id: string;
  last_message: string;
  unread: number;
  workspace: string;
  last_active: string;
  updated_at: string;
  created_at: string;
  message_count: number;
  source: string;
}

const AGENT_EMOJI: Record<string, string> = {
  hermes: '🏛️', claude: '🟣', codex: '🟢', gemini: '🔵', mimo: '📱',
  opencode: '⚡', aider: '🤝', copilot: '🐙', cursor: '▶️', windsurf: '🏄',
  cline: '🔧', continue: '🔄', deepseek: '🐋', qwen: '🟠',
  'amazon-q': '☁️', openclaw: '🐾', 'pi-agent': 'π',
};

const SOURCE_META: Record<string, { label: string; icon: string }> = {
  cli:      { label: 'CLI',    icon: '⌨️' },
  weixin:   { label: '微信',   icon: '💬' },
  cron:     { label: 'Cron',   icon: '⏰' },
  acp:      { label: 'ACP',    icon: '🔗' },
  tui:      { label: 'TUI',    icon: '🖥️' },
  tool:     { label: 'Tool',   icon: '🔧' },
  subagent: { label: 'Sub',    icon: '🤖' },
};

function getAgentEmoji(platform: string): string {
  if (!platform) return '💬';
  const key = platform.toLowerCase();
  return AGENT_EMOJI[key] ?? '💬';
}

function relativeTime(dateStr: string): string {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  if (Number.isNaN(diffMs)) return '';
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return '刚刚';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}分钟前`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}小时前`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 30) return `${diffDay}天前`;
  const diffMonth = Math.floor(diffDay / 30);
  return `${diffMonth}月前`;
}

// ── Nav group types (kept for "More" menu) ───────────────────────────

interface NavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

// ── Main component ───────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useTranslation();
  const [eventCount, setEventCount] = useState(0)
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Conversation list state ──────────────────────────────────────
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [collapsedAgents, setCollapsedAgents] = useState<Set<string>>(new Set());

  // Fetch sessions for conversation list (visibility-aware, 30s)
  useVisibilityPoll(() => {
    const apiBase = getApiBaseUrl();
    const token = getToken();
    if (!apiBase) return;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${apiBase}/api/sessions`, { headers })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.sessions && Array.isArray(data.sessions)) {
          setSessions(data.sessions);
        }
      })
      .catch(() => {});
  }, 30000, []);

  // Fetch event count for notification badge (visibility-aware, 30s)
  useVisibilityPoll(() => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    fetch(`${apiBase}/api/events/summary`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.total_events) setEventCount(Math.min(data.total_events, 99));
      })
      .catch(() => {});
  }, 30000, []);

  // Group sessions by agent → source (two-level, like chat page)
  const groupedSessions = useMemo(() => {
    const q = sessionSearch.trim().toLowerCase();
    const filtered = q
      ? sessions.filter((s) => {
          const title = (s.title || s.name || '').toLowerCase();
          const preview = (s.last_message || '').toLowerCase();
          return title.includes(q) || preview.includes(q);
        })
      : sessions;

    // First: group by agent
    const agentMap = new Map<string, SessionItem[]>();
    for (const s of filtered) {
      const agent = s.platform || s.source || 'other';
      if (!agentMap.has(agent)) agentMap.set(agent, []);
      agentMap.get(agent)!.push(s);
    }

    // Second: within each agent, group by source
    const result = Array.from(agentMap.entries())
      .map(([agent, agentSessions]) => {
        const sourceMap = new Map<string, SessionItem[]>();
        for (const s of agentSessions) {
          const src = s.source || s.platform || agent;
          if (!sourceMap.has(src)) sourceMap.set(src, []);
          sourceMap.get(src)!.push(s);
        }

        const sources = Array.from(sourceMap.entries())
          .map(([src, items]) => ({
            source: src,
            label: SOURCE_META[src]?.label || src,
            icon: SOURCE_META[src]?.icon || '💬',
            sessions: items.sort((a, b) => {
              const ta = new Date(a.last_active || a.updated_at || 0).getTime();
              const tb = new Date(b.last_active || b.updated_at || 0).getTime();
              return tb - ta;
            }),
            expanded: false,
          }))
          .sort((a, b) => {
            const ta = new Date(a.sessions[0]?.last_active || a.sessions[0]?.updated_at || 0).getTime();
            const tb = new Date(b.sessions[0]?.last_active || b.sessions[0]?.updated_at || 0).getTime();
            return tb - ta;
          });

        return {
          agent,
          emoji: getAgentEmoji(agent),
          sessions: agentSessions,
          sources,
        };
      })
      .sort((a, b) => {
        const ta = new Date(a.sessions[0]?.last_active || a.sessions[0]?.updated_at || 0).getTime();
        const tb = new Date(b.sessions[0]?.last_active || b.sessions[0]?.updated_at || 0).getTime();
        return tb - ta;
      });

    return result;
  }, [sessions, sessionSearch]);

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

  function handleNewChat() {
    router.push('/chat');
  }

  function handleConversationClick(sessionId: string) {
    router.push(`/chat?session=${sessionId}`);
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
          {/* ── Search + New Chat ─────────────────────────────────── */}
          <div className="px-2 pb-2 space-y-2 group-data-[collapsible=icon]:hidden">
            <div className="flex gap-1.5">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder={t("sidebar.searchConversations", "搜索会话...")}
                  value={sessionSearch}
                  onChange={(e) => setSessionSearch(e.target.value)}
                  className="w-full rounded-md border border-input bg-background py-1.5 pl-8 pr-2 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <button
                onClick={handleNewChat}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                title={t("sidebar.newChat", "新会话")}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>

          {/* Icon-only new chat button when collapsed */}
          <div className="hidden group-data-[collapsible=icon]:flex justify-center pb-2">
            <button
              onClick={handleNewChat}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title={t("sidebar.newChat", "新会话")}
            >
              <Plus size={14} />
            </button>
          </div>

          {/* ── Conversation list (grouped by agent) ──────────────── */}
          <div className="flex-1 overflow-y-auto">
            {groupedSessions.length === 0 ? (
              <div className="px-4 py-8 text-center group-data-[collapsible=icon]:hidden">
                <MessageSquare size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {sessionSearch ? t("sidebar.noResults", "无匹配会话") : t("sidebar.noConversations", "暂无会话")}
                </p>
              </div>
            ) : (
              <div className="px-1 group-data-[collapsible=icon]:px-0">
                {groupedSessions.map((group) => {
                  const isCollapsed = collapsedAgents.has(group.agent);
                  const totalUnread = group.sessions.reduce((sum, s) => sum + (s.unread || 0), 0);
                  return (
                    <div key={group.agent} className="mb-1">
                      {/* Agent group header */}
                      <button
                        onClick={() => {
                          setCollapsedAgents(prev => {
                            const next = new Set(prev);
                            if (next.has(group.agent)) next.delete(group.agent);
                            else next.add(group.agent);
                            return next;
                          });
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                      >
                        <span className="text-sm">{group.emoji}</span>
                        <span className="flex-1 text-left truncate group-data-[collapsible=icon]:hidden">{group.agent}</span>
                        {totalUnread > 0 && (
                          <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white group-data-[collapsible=icon]:hidden">
                            {totalUnread > 99 ? '99+' : totalUnread}
                          </span>
                        )}
                        <ChevronDown
                          size={12}
                          className={cn(
                            "transition-transform group-data-[collapsible=icon]:hidden",
                            isCollapsed && "-rotate-90"
                          )}
                        />
                      </button>

                      {/* Source sub-groups under this agent */}
                      {!isCollapsed && group.sources.map((src) => (
                        <div key={src.source} className="ml-2">
                          {/* Source header (only show if agent has multiple sources) */}
                          {group.sources.length > 1 && (
                            <button
                              onClick={() => {
                                setCollapsedAgents(prev => {
                                  const key = `${group.agent}:${src.source}`;
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
                                  return next;
                                });
                              }}
                              className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-[11px] text-muted-foreground/70 hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
                            >
                              <span className="text-xs">{src.icon}</span>
                              <span className="flex-1 text-left truncate">{src.label}</span>
                              <ChevronDown
                                size={10}
                                className={cn(
                                  "transition-transform",
                                  collapsedAgents.has(`${group.agent}:${src.source}`) && "-rotate-90"
                                )}
                              />
                            </button>
                          )}

                          {/* Sessions under this source */}
                          {!collapsedAgents.has(`${group.agent}:${src.source}`) && src.sessions.map((session) => (
                            <button
                              key={session.id}
                              onClick={() => handleConversationClick(session.id)}
                              className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                              title={session.title || session.name || session.id}
                            >
                              {/* Avatar — source icon if multi-source, agent emoji if single */}
                              <div className="relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs group-data-[collapsible=icon]:h-6 group-data-[collapsible=icon]:w-6">
                                {group.sources.length > 1 ? src.icon : group.emoji}
                                {session.unread > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold text-white">
                                    {session.unread > 99 ? '99+' : session.unread}
                                  </span>
                                )}
                              </div>

                              {/* Text content */}
                              <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                                <div className="flex items-center justify-between">
                                  <span className={cn(
                                    "text-[13px] truncate",
                                    session.unread > 0 ? "font-semibold text-foreground" : "font-normal text-foreground/80"
                                  )}>
                                    {session.title || session.name || session.id}
                                  </span>
                                  <span className="ml-1 shrink-0 text-[9px] text-muted-foreground">
                                    {relativeTime(session.last_active || session.updated_at)}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground truncate mt-px">
                                  {session.last_message || ''}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
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

      {/* Main content area */}
      <SidebarInset className="min-h-0 overflow-hidden">
        {/* Mobile: minimal top bar with title + actions */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3 md:hidden">
          <MobilePageTitle />
          <div className="flex items-center gap-1">
            <NotificationCenter />
          </div>
        </div>
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          {children}
        </div>
        {/* Bottom navigation bar — all screens */}
        <BottomNav />
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

function MobilePageTitle() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const titles: Record<string, string> = {
    "/chat": t("nav.chat"),
    "/knowledge": t("nav.knowledge"),
    "/graph": t("nav.graph"),
    "/search": t("nav.search"),
    "/skills": t("nav.skills"),
    "/agents": t("nav.agents"),
    "/workflow": t("nav.workflow"),
    "/workflow-builder": t("nav.workflowBuilder"),
    "/settings": t("nav.settings"),
    "/learn": t("nav.learn"),
    "/mcp": t("nav.mcp"),
    "/groups": t("nav.groups"),
    "/dashboard": t("nav.dashboard"),
    "/team": t("nav.team") || "Team",
    "/workspace": t("nav.workspace") || "Workspace",
    "/graph-builder": t("nav.graphBuilder") || "Graph Builder",
    "/ai-groups": t("nav.aiGroups") || "AI Groups",
    "/cron": t("nav.cron"),
    "/download": t("nav.download"),
    "/notifications": t("nav.notifications") || "Notifications",
    "/sessions": t("nav.sessions") || "Sessions",
    "/diagnostics": t("nav.diagnostics") || "Diagnostics",
    "/system": t("nav.system") || "System",
    "/pipeline": t("nav.pipeline") || "Pipeline",
    "/will": t("nav.will") || "Will",
    "/capture": t("nav.capture") || "Capture",
    "/soma": t("nav.soma") || "Soma",
    "/cortex": t("nav.cortex") || "Cortex",
  };

  const title = titles[pathname] || "OpenMate";
  return <h1 className="text-sm font-semibold tracking-tight truncate">{title}</h1>;
}

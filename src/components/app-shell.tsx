"use client";

import { TerminalPanel } from "@/components/terminal-panel";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";
import { NotificationCenter } from "@/components/notification-center";
import { RightPanel } from "@/components/right-panel";
import { useVisibilityPoll } from "@/hooks/use-visibility-poll";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, Search, ChevronDown, ChevronRight,
  Plus, Trash2, PanelRightOpen, PanelRightClose,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { getUserId, getUserName, getApiBaseUrl, getToken } from "@/lib/api-client";
import { type ThemeId, persistTheme } from "@/lib/theme";
import {
  SidebarProvider,
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarInset,
} from "@/components/ui/sidebar";

// ── Types ────────────────────────────────────────────────────────

interface Session {
  id: string;
  name?: string;
  title?: string;
  platform?: string;
  chat_id?: string;
  last_message?: string;
  unread?: number;
  workspace?: string;
  last_active?: string;
  updated_at?: string;
  created_at?: string;
  message_count?: number;
  source?: string;
}

interface SourceGroup {
  source: string;
  label: string;
  icon: string;
  sessions: Session[];
  expanded: boolean;
}

interface AgentInfo {
  id: string;
  name: string;
  icon: string;
  logo?: string;
  description: string;
  installed: boolean;
  available?: boolean;
  sessions: Session[];
  expanded: boolean;
  sourceGroups?: SourceGroup[];
}

// Source metadata (i18n keys)
const SOURCE_META: Record<string, { labelKey: string; icon: string }> = {
  cli:      { labelKey: 'sessions.sourceCli',  icon: '⌨️' },
  weixin:   { labelKey: 'sessions.sourceWeixin', icon: '💬' },
  cron:     { labelKey: 'sessions.sourceCron', icon: '⏰' },
  acp:      { labelKey: 'sessions.sourceAcp', icon: '🔗' },
  tui:      { labelKey: 'sessions.sourceTui', icon: '🖥️' },
  tool:     { labelKey: 'sessions.sourceTool', icon: '🔧' },
  subagent: { labelKey: 'sessions.sourceSubagent', icon: '🤖' },
};

const HERMES_SOURCES = new Set(['cli', 'weixin', 'cron', 'acp', 'tui', 'tool', 'subagent']);

const AGENT_ICONS: Record<string, string> = {
  hermes: '🏛️', claude: '🟣', codex: '🟢', gemini: '🔵', mimo: '📱',
  opencode: '⚡', aider: '🤝', copilot: '🐙', cursor: '▶️', windsurf: '🏄',
  cline: '🔧', continue: '🔄', deepseek: '🐋', qwen: '🟠',
  'amazon-q': '☁️', openclaw: '🐾', 'pi-agent': 'π', ollama: '🦙',
};

// ── Main component ────────────────────────────────────────────────

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const { t } = useTranslation();
  const [eventCount, setEventCount] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  // ── Conversation list state ──────────────────────────────────────
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [sessionSearch, setSessionSearch] = useState('');
  const [clearedUnreads, setClearedUnreads] = useState<Set<string>>(new Set());

  // Clear unread for a session (called on click)
  const clearSessionUnread = useCallback((sessionId: string) => {
    setClearedUnreads((prev) => {
      const next = new Set(prev);
      next.add(sessionId);
      return next;
    });
    // Also call API to clear server-side
    const apiBase = getApiBaseUrl();
    const token = getToken();
    if (apiBase && token) {
      fetch(`${apiBase}/api/sessions/${sessionId}/read`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
  }, []);

  // Get effective unread count (respects local clearing)
  const getUnread = useCallback((session: Session): number => {
    if (clearedUnreads.has(session.id)) return 0;
    return session.unread ?? 0;
  }, [clearedUnreads]);

  // Total unread across all sessions
  const totalUnread = agents.reduce((sum, a) =>
    sum + a.sessions.reduce((s, session) => s + getUnread(session), 0), 0
  );

  // Fetch sessions + build agent tree (like chat page)
  const fetchSessions = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    const token = getToken();
    if (!apiBase) return;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    // 1. Detect agents
    let detectedAgents: Array<{ id: string; name: string; icon: string; description: string; available: boolean; logo?: string }> = [];
    try {
      const r = await fetch(`${apiBase}/api/agents/detect`, { headers });
      if (r.ok) { const d = await r.json(); detectedAgents = d.agents || []; }
    } catch {}

    // 2. Fetch sessions
    let sessions: Session[] = [];
    try {
      const r = await fetch(`${apiBase}/api/sessions?limit=100`, { headers });
      if (r.ok) { const d = await r.json(); sessions = d.sessions || []; }
    } catch {}

    // 3. Group sessions by agent
    const agentSessionMap: Record<string, Session[]> = {};
    for (const s of sessions) {
      if (!s.platform && s.source) s.platform = s.source;
      const src = s.platform || s.source || '';
      const agentKey = HERMES_SOURCES.has(src) ? 'hermes' : (s.platform || 'hermes');
      if (!agentSessionMap[agentKey]) agentSessionMap[agentKey] = [];
      agentSessionMap[agentKey].push(s);
    }

    // 4. Build source groups
    const buildSourceGroups = (agentSessions: Session[], agentId: string): SourceGroup[] | undefined => {
      const sourceMap: Record<string, Session[]> = {};
      for (const s of agentSessions) {
        const src = (s.platform || s.source || agentId);
        if (!sourceMap[src]) sourceMap[src] = [];
        sourceMap[src].push(s);
      }
      const sources = Object.keys(sourceMap);
      if (sources.length <= 1) return undefined;
      return sources.map(src => {
        const meta = SOURCE_META[src] || { labelKey: src, icon: '💬' };
        return {
          source: src, label: t(meta.labelKey), icon: meta.icon,
          sessions: sourceMap[src], expanded: false,
        };
      });
    };

    // 5. Build agent list
    const agentList: AgentInfo[] = detectedAgents
      .filter(a => a.available)
      .map(a => {
        const agentSessions = agentSessionMap[a.id] || [];
        const sourceGroups = buildSourceGroups(agentSessions, a.id);
        return {
          id: a.id,
          name: a.name,
          icon: a.icon || AGENT_ICONS[a.id] || '🤖',
          logo: a.logo,
          description: a.description,
          installed: a.available,
          available: a.available,
          sessions: agentSessions,
          expanded: false,
          sourceGroups,
        };
      });

    // 6. Add unknown agents
    for (const [key, val] of Object.entries(agentSessionMap)) {
      if (!agentList.find(a => a.id === key) && val.length > 0) {
        const sourceGroups = buildSourceGroups(val, key);
        agentList.push({
          id: key, name: key, icon: AGENT_ICONS[key] || '🤖', description: key,
          installed: false, sessions: val, expanded: false, sourceGroups,
        });
      }
    }

    // 7. Update state preserving expanded
    setAgents(prev => {
      const expandedIds = new Set(prev.filter(a => a.expanded).map(a => a.id));
      const expandedSrcs = new Map<string, Set<string>>();
      prev.forEach(a => a.sourceGroups?.forEach(g => {
        if (g.expanded) {
          if (!expandedSrcs.has(a.id)) expandedSrcs.set(a.id, new Set());
          expandedSrcs.get(a.id)!.add(g.source);
        }
      }));
      return agentList.map(a => ({
        ...a,
        expanded: expandedIds.has(a.id),
        sourceGroups: a.sourceGroups?.map(g => ({
          ...g,
          expanded: expandedSrcs.get(a.id)?.has(g.source) ?? false,
        })),
      }));
    });
  }, [t]);

  // Visibility-aware polling
  useVisibilityPoll(fetchSessions, 30000, [fetchSessions]);

  // Toggle agent expand
  const toggleAgent = useCallback((agentId: string) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? { ...a, expanded: !a.expanded } : a
    ));
  }, []);

  // Toggle source group expand
  const toggleSourceGroup = useCallback((agentId: string, source: string) => {
    setAgents(prev => prev.map(a =>
      a.id === agentId ? {
        ...a,
        sourceGroups: a.sourceGroups?.map(g =>
          g.source === source ? { ...g, expanded: !g.expanded } : g
        ),
      } : a
    ));
  }, []);

  // Search filter
  const filteredAgents = useCallback(() => {
    const q = sessionSearch.trim().toLowerCase();
    if (!q) return agents;
    return agents.filter(a => {
      const nameMatch = a.name.toLowerCase().includes(q);
      const sessionMatch = a.sessions.some(s =>
        (s.title || s.name || '').toLowerCase().includes(q) ||
        (s.last_message || '').toLowerCase().includes(q)
      );
      return nameMatch || sessionMatch;
    }).map(a => ({
      ...a,
      expanded: true, // auto-expand when searching
      sourceGroups: a.sourceGroups?.map(g => ({
        ...g,
        expanded: true,
        sessions: g.sessions.filter(s =>
          a.name.toLowerCase().includes(q) ||
          (s.title || s.name || '').toLowerCase().includes(q) ||
          (s.last_message || '').toLowerCase().includes(q)
        ),
      })).filter(g => g.sessions.length > 0),
    }));
  }, [agents, sessionSearch]);

  // Fetch event count
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

  const displayAgents = filteredAgents();

  // Helper: render unread badge (WeChat style)
  function UnreadBadge({ count }: { count: number }) {
    if (count <= 0) return null;
    return (
      <span className="inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold leading-none shrink-0">
        {count > 99 ? '99+' : count}
      </span>
    );
  }

  return (
    <div className="flex flex-col h-svh overflow-hidden">
      {/* Top utility bar — full screen width */}
      <TopBar
        rightPanelOpen={rightPanelOpen}
        onToggleRightPanel={() => setRightPanelOpen(v => !v)}
        eventCount={eventCount}
        pageTitle={<MobilePageTitle />}
      />

      {/* Middle: sidebar + content + right panel */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <SidebarProvider open={!collapsed} onOpenChange={(open) => { if (open === collapsed) toggle(); }} className="flex-1 min-h-0 overflow-hidden h-full">
          {/* Desktop sidebar - conversation list */}
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
          {/* Search + New Chat */}
          <div className="px-2 pb-2 flex items-center gap-1 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
            <div className="relative flex-1 group-data-[collapsible=icon]:hidden">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                type="text"
                value={sessionSearch}
                onChange={(e) => setSessionSearch(e.target.value)}
                placeholder={t("chat.searchPlaceholder", "搜索会话...")}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border/50 focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            <button
              onClick={() => router.push('/chat')}
              className="p-1.5 rounded-md hover:bg-muted/50 transition-colors shrink-0"
              title={t("chat.newChat", "新对话")}
            >
              <Plus className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* Agent → Source → Session tree */}
          <div className="flex-1 overflow-y-auto">
            {displayAgents.length === 0 ? (
              <div className="px-4 py-8 text-center group-data-[collapsible=icon]:hidden">
                <MessageSquare size={24} className="mx-auto mb-2 text-muted-foreground/50" />
                <p className="text-xs text-muted-foreground">
                  {sessionSearch ? t("sidebar.noResults", "无匹配会话") : t("sidebar.noConversations", "暂无会话")}
                </p>
              </div>
            ) : (
              displayAgents.map(agent => (
                <div key={agent.id}>
                  {/* Agent header */}
                  <div className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 group">
                    <button onClick={() => toggleAgent(agent.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                      {agent.expanded
                        ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                      {agent.logo
                        ? <img src={agent.logo} alt={agent.name} className="w-5 h-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        : null}
                      <span className={cn("text-sm", agent.logo ? "hidden" : "")}>{agent.icon}</span>
                      <span className="text-sm font-medium truncate group-data-[collapsible=icon]:hidden">{agent.name}</span>
                    </button>
                    {/* Unread count badge for agent */}
                    {(() => {
                      const agentUnread = agent.sessions.reduce((s, session) => s + getUnread(session), 0);
                      return agentUnread > 0 ? (
                        <UnreadBadge count={agentUnread} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground ml-auto shrink-0 group-data-[collapsible=icon]:hidden">{agent.sessions.length}</span>
                      );
                    })()}
                  </div>

                  {/* Source groups or flat sessions */}
                  {agent.expanded && agent.sourceGroups && agent.sourceGroups.length > 0 ? (
                    agent.sourceGroups.map(group => (
                      <div key={group.source}>
                        <button onClick={() => toggleSourceGroup(agent.id, group.source)}
                          className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 hover:bg-muted/40 transition-colors group-data-[collapsible=icon]:hidden">
                          {group.expanded
                            ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                            : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                          <span className="text-xs">{group.icon}</span>
                          <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                          {(() => {
                            const groupUnread = group.sessions.reduce((s, session) => s + getUnread(session), 0);
                            return groupUnread > 0 ? (
                              <span className="ml-auto"><UnreadBadge count={groupUnread} /></span>
                            ) : (
                              <span className="text-[10px] text-muted-foreground ml-auto">{group.sessions.length}</span>
                            );
                          })()}
                        </button>
                        {group.expanded && group.sessions
                          .slice()
                          .sort((a, b) => {
                            const ua = getUnread(a), ub = getUnread(b);
                            if (ua > 0 && ub === 0) return -1;
                            if (ua === 0 && ub > 0) return 1;
                            const ta = a.last_active || a.updated_at || '';
                            const tb = b.last_active || b.updated_at || '';
                            return tb.localeCompare(ta);
                          })
                          .map(session => {
                            const unread = getUnread(session);
                            return (
                          <button key={session.id}
                            onClick={() => { clearSessionUnread(session.id); router.push(`/chat?agent=${agent.id}&session=${session.id}`); setMenuOpen(false); }}
                            className="group w-full text-left pl-12 pr-3 py-2 hover:bg-muted/80 transition-colors cursor-pointer group-data-[collapsible=icon]:hidden">
                            <div className="flex items-center gap-1.5">
                              <MessageSquare className="w-3 h-3 shrink-0 text-muted-foreground" />
                              <span className={cn("text-xs truncate flex-1", unread > 0 && "font-bold")}>{session.name || session.title || "Untitled"}</span>
                              <UnreadBadge count={unread} />
                            </div>
                            {(session.last_active || session.updated_at) && (
                              <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">
                                {session.last_active || session.updated_at}
                              </div>
                            )}
                          </button>
                            );
                          })}
                      </div>
                    ))
                  ) : (
                    agent.expanded && agent.sessions
                      .slice()
                      .sort((a, b) => {
                        const ua = getUnread(a), ub = getUnread(b);
                        if (ua > 0 && ub === 0) return -1;
                        if (ua === 0 && ub > 0) return 1;
                        const ta = a.last_active || a.updated_at || '';
                        const tb = b.last_active || b.updated_at || '';
                        return tb.localeCompare(ta);
                      })
                      .map(session => {
                        const unread = getUnread(session);
                        return (
                      <button key={session.id}
                        onClick={() => { clearSessionUnread(session.id); router.push(`/chat?agent=${agent.id}&session=${session.id}`); setMenuOpen(false); }}
                        className="group w-full text-left pl-8 pr-3 py-2 hover:bg-muted/80 transition-colors cursor-pointer group-data-[collapsible=icon]:hidden">
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 shrink-0 text-muted-foreground" />
                          <span className={cn("text-xs truncate flex-1", unread > 0 && "font-bold")}>{session.name || session.title || "Untitled"}</span>
                          <UnreadBadge count={unread} />
                        </div>
                        {(session.last_active || session.updated_at) && (
                          <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">
                            {session.last_active || session.updated_at}
                          </div>
                        )}
                      </button>
                        );
                      })
                  )}

                  {agent.expanded && agent.sessions.length === 0 && (
                    <div className="pl-8 pr-3 py-2 text-xs text-muted-foreground italic group-data-[collapsible=icon]:hidden">
                      {t("chat.noSessions")}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </SidebarContent>

        <SidebarFooter>
          {/* Notification Bell */}
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip={t("nav.notifications")}>
                <Link href="/notifications">
                  <div className="relative">
                    <MessageSquare size={16} />
                    {eventCount > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-[8px] font-bold text-white">
                        {eventCount > 9 ? "9+" : eventCount}
                      </span>
                    )}
                  </div>
                  <span suppressHydrationWarning className="group-data-[collapsible=icon]:hidden">{t("nav.notifications")}</span>
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
                  <button onClick={toggleTheme}
                    className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                    <div className="mt-0.5 text-muted-foreground">
                      {storeTheme === "dark" ? "🌙" : "☀️"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm">{storeTheme === "dark" ? t("account.switchToLight") : t("account.switchToPurple")}</div>
                      <div className="text-xs text-muted-foreground">{t("account.switchTheme")}</div>
                    </div>
                  </button>
                </div>
                <div className="border-t border-border py-1">
                  <button onClick={handleLogout}
                    className="flex w-full items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left">
                    <div className="mt-0.5 text-muted-foreground">🚪</div>
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
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          {children}
        </div>
      </SidebarInset>

      {/* Right Panel — workspace tabs (mobile: Sheet overlay, desktop: inline) */}
      {rightPanelOpen ? (
        <>
          {/* Mobile overlay */}
          <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setRightPanelOpen(false)} />
          <div className={cn(
            "fixed top-0 right-0 bottom-0 z-50 bg-background shadow-xl md:static md:z-auto md:shadow-none",
            "flex flex-col",
          )} style={{ width: '100%', maxWidth: '100vw' }}>
            <div className="md:hidden absolute top-2 right-2 z-10">
              <button
                onClick={() => setRightPanelOpen(false)}
                className="p-1.5 rounded-md hover:bg-muted/50"
              >
                <PanelRightClose className="w-4 h-4" />
              </button>
            </div>
            <RightPanel open={true} onToggle={() => setRightPanelOpen(false)} />
          </div>
        </>
      ) : null}

      {/* Terminal Panel */}
      <TerminalPanel apiBase="" token={typeof window !== 'undefined' ? localStorage.getItem('openmate-token') || '' : ''} />
        </SidebarProvider>
      </div>

      {/* Bottom navigation bar — full screen width */}
      <BottomNav totalUnread={totalUnread} />
    </div>
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

  for (const [path, title] of Object.entries(titles)) {
    if (pathname.startsWith(path)) return <span className="text-sm font-medium truncate">{title}</span>;
  }
  return <span className="text-sm font-medium truncate">OpenMate</span>;
}

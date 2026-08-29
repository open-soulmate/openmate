"use client";

import { TerminalPanel } from "@/components/terminal-panel";
import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";
import { NotificationCenter } from "@/components/notification-center";
import { RightPanel } from "@/components/right-panel";
import { AIGroupsSidebar } from "@/components/ai-groups-sidebar";
import { AIGroupsWorkspace } from "@/components/ai-groups-workspace";
import { useAIGroupsStore } from "@/stores/ai-groups-store";

import { useVisibilityPoll } from "@/hooks/use-visibility-poll";


import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import {
  Search, Plus, PanelRightOpen,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect, useMemo } from "react";
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
import { ConversationTree, type AgentInfo } from "@/components/conversation-tree";
import { SwipeablePanels, getPanelIndex } from "@/components/swipeable-panels";
import { useIsMobile, useMediaQuery } from "@/hooks/use-mobile";

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

// AgentInfo imported from conversation-tree.tsx

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

const HERMES_SOURCES = new Set(['cli', 'weixin', 'acp', 'tui', 'tool', 'subagent']);

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
  const searchParams = useSearchParams();
  const activeSessionId = searchParams.get('session');
  const activeSessionIdFromStore = useAppStore((s) => s.activeSessionId);
  const setActiveSession = useAppStore((s) => s.setActiveSession);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  const isMobile = useIsMobile();
  // Auto-collapse sidebar on mid-sized screens (lg but not xl)
  // User can override by clicking the toggle button
  const isMidScreen = useMediaQuery("(min-width: 1024px) and (max-width: 1279px)");
  const [midScreenExpanded, setMidScreenExpanded] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const effectiveCollapsed = isMobile ? !mobileSidebarOpen : (collapsed || (isMidScreen && !midScreenExpanded));
  const currentPanel = useAppStore((s) => s.currentPanel);
  const setCurrentPanel = useAppStore((s) => s.setCurrentPanel);
  const { t } = useTranslation();
  const [eventCount, setEventCount] = useState(0);
  const [rightPanelWidth, setRightPanelWidth] = useState(0);
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
      const r = await fetch(`${apiBase}/api/sessions?limit=500`, { headers });
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

  // Reset mid-screen override when screen size changes
  useEffect(() => {
    setMidScreenExpanded(false);
  }, [isMidScreen]);

  // Track right panel width — desktop: 50vw, mobile: 75vw
  useEffect(() => {
    const update = () => setRightPanelWidth(isMobile ? 256 : Math.round(window.innerWidth / 2));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [isMobile]);

  useEffect(() => { setMenuOpen(false); setRightPanelOpen(false); setMobileSidebarOpen(false); }, [pathname]);

  // Sync swipeable panel index with current route
  useEffect(() => {
    const idx = getPanelIndex(pathname);
    if (idx >= 0 && idx !== currentPanel) {
      setCurrentPanel(idx);
    }
  }, [pathname, currentPanel, setCurrentPanel]);

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

  // Detect AI Groups route for conditional sidebar/workspace rendering
  const isAIGroupsRoute = pathname.startsWith('/ai-groups');
  const fetchAIGroups = useAIGroupsStore((s) => s.fetchGroups);

  // Fetch AI groups when on the ai-groups route
  useEffect(() => {
    if (isAIGroupsRoute) {
      fetchAIGroups();
    }
  }, [isAIGroupsRoute, fetchAIGroups]);

  return (
    <div className="flex flex-col h-svh overflow-hidden">
      {/* Top utility bar — full screen width */}
      <div className="flex items-center">
        <div className="flex-1 min-w-0">
          <TopBar
            eventCount={eventCount}
          />
        </div>
      </div>

      {/* Middle: sidebar + content + right panel */}
      <div className="relative flex flex-1 min-h-0 overflow-hidden">
        <SidebarProvider open={!effectiveCollapsed} onOpenChange={(open) => {
          if (open === effectiveCollapsed) {
            if (isMobile) {
              setMobileSidebarOpen(prev => !prev);
              if (!mobileSidebarOpen) setRightPanelOpen(false); // mutual exclusion: close right panel when sidebar opens
            } else if (isMidScreen) {
              setMidScreenExpanded(prev => !prev);
            } else {
              toggle();
            }
          }
        }} className="flex-1 min-h-0 overflow-hidden h-full">
          {/* Desktop sidebar - conversation list */}
          <Sidebar collapsible="offcanvas">
        <SidebarHeader>
          <div className="flex h-12 shrink-0 items-center px-2">
            <span className="text-sm font-bold text-primary">OM</span>
            <span className="ml-2 text-sm font-semibold text-foreground group-data-[collapsible=icon]:hidden">
              OpenMate
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          {isAIGroupsRoute ? (
            <AIGroupsSidebar />
          ) : (
            <>
              {/* Search + New Chat */}
              <div className="px-2 pb-2 flex items-center gap-1 h-12 group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:justify-center">
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
              <ConversationTree
                agents={displayAgents}
                activeSessionId={activeSessionIdFromStore}
                getUnread={getUnread}
                onToggleAgent={toggleAgent}
                onToggleSourceGroup={toggleSourceGroup}
                onSelectSession={(session, agent) => {
                  clearSessionUnread(session.id);
                  setActiveSession(session.id, agent.id, {
                    agentIcon: agent.icon,
                    agentName: agent.name,
                    agentDescription: agent.description || '',
                    sessionName: session.name || session.title || '',
                  });
                  if (isMobile) setMobileSidebarOpen(false);
                  router.push('/chat');
                }}
                className="group-data-[collapsible=icon]:hidden"
              />
            </>
          )}
        </SidebarContent>

        <SidebarFooter>
        </SidebarFooter>

        <SidebarRail />
      </Sidebar>

      {/* Main content area */}
      <SidebarInset className="min-h-0 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden min-h-0">
          <SwipeablePanels isHomePage={getPanelIndex(pathname) >= 0}>
            {children}
          </SwipeablePanels>
        </div>
      </SidebarInset>

      {/* Terminal Panel */}
      <TerminalPanel apiBase="" token={typeof window !== 'undefined' ? localStorage.getItem('openmate-token') || '' : ''} />
        </SidebarProvider>

      {/* Right Panel — sidebar-style sliding, same for mobile and desktop */}
      <div
        className="shrink-0 transition-[width] duration-200 ease-linear"
        style={{ width: rightPanelOpen ? rightPanelWidth : 0 }}
      />
      {/* Backdrop overlay on mobile when right panel is open */}
      {isMobile && rightPanelOpen && (
        <div
          className="fixed inset-0 z-[9] bg-black/40 backdrop-blur-[2px] opacity-100 transition-opacity duration-200"
          onClick={() => setRightPanelOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className="absolute inset-y-0 top-0 right-0 z-10 h-full min-w-0 border-l border-border transition-[right] duration-200 ease-linear flex flex-col overflow-hidden"
        style={{
          width: rightPanelWidth,
          right: rightPanelOpen ? 0 : -rightPanelWidth,
        }}
      >
        {isAIGroupsRoute ? (
          <div className="flex flex-col h-full">
            <div className="h-12 shrink-0 px-3 flex items-center border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">{t("aiGroups.groupManagement", "群组管理")}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              <AIGroupsWorkspace />
            </div>
          </div>
        ) : (
          <RightPanel open={rightPanelOpen} onToggle={() => toggleRightPanel()} />
        )}
      </div>
      </div>

      {/* Bottom navigation bar — full screen width */}
      <BottomNav totalUnread={totalUnread} onOpenConversations={() => { if (isMobile) { setMobileSidebarOpen(true); } else { toggle(); } setRightPanelOpen(false); }} />
    </div>
  );
}


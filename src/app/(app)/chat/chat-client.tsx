'use client';
import { MarkdownContent } from "@/components/markdown-content";
import { MultiFileDiff, type FileChange } from "@/components/multi-file-diff";
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, FileText, Image as ImageIcon, Info, ChevronDown, Plus, Bookmark, RotateCcw, Zap, Brain, PanelLeft, PanelRightOpen } from "lucide-react";
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';
import { Dialog } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';

const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');
const getAcpProxyUrl = () => {
  const base = getApiUrl();
  // ACP Proxy runs on port 8092, same hostname as OpenSoul
  return base.replace(/:\d+$/, ':8092');
};
const getAcpWsUrl = () => getAcpProxyUrl().replace('http', 'ws');

interface MessagePart { type: string; text?: string; data?: string; name?: string; mime_type?: string; url?: string; }
interface TokenUsage { input: number; output: number; }
interface Checkpoint { id: string; messageId: string; timestamp: Date; messages: Message[]; label: string; }
type AgentMode = 'plan' | 'act';
interface Message { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; source?: string; fileChanges?: FileChange[]; tokenUsage?: TokenUsage; }
interface Session { id: string; name?: string; title?: string; platform: string; chat_id?: string; last_message?: string; unread?: number; workspace?: string; last_active?: string; updated_at?: string; created_at?: string; message_count?: number; source?: string; }

// Agent definitions with detection
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
  icon: string; logo?: string;
  description: string;
  installed: boolean;
  available?: boolean;
  category?: string;
  path?: string;
  sessions: Session[];
  expanded: boolean;
  sourceGroups?: SourceGroup[];
}

// Source metadata for sub-group display (labels are i18n keys)
const SOURCE_META: Record<string, { labelKey: string; icon: string }> = {
  cli:    { labelKey: 'sessions.sourceCli',  icon: '⌨️' },
  weixin: { labelKey: 'sessions.sourceWeixin', icon: '💬' },
  cron:   { labelKey: 'sessions.sourceCron', icon: '⏰' },
  acp:    { labelKey: 'sessions.sourceAcp', icon: '🔗' },
  tui:    { labelKey: 'sessions.sourceTui', icon: '🖥️' },
  tool:   { labelKey: 'sessions.sourceTool', icon: '🔧' },
  subagent: { labelKey: 'sessions.sourceSubagent', icon: '🤖' },
};

// Known agent icons (fallback for detect API)
const AGENT_ICONS: Record<string, string> = {
  hermes: '🏛️', claude: '🟣', codex: '🟢', gemini: '🔵', mimo: '📱',
  opencode: '⚡', aider: '🤝', copilot: '🐙', cursor: '▶️', windsurf: '🏄',
  cline: '🔧', continue: '🔄', deepseek: '🐋', qwen: '🟠', 'amazon-q': '☁️',
  ollama: '🦙', wechat: '💬', telegram: '✈️', openclaw: '🦞',
};

// Parse file changes from AI response content
function parseFileChanges(content: string): FileChange[] {
  const files: FileChange[] = [];
  // Match patterns like: --- a/file.ts +++ b/file.ts or *** file.ts
  const fileRegex = /(?:---\s+a\/(.+?)\s*\n\+\+\+\s+b\/(.+?)|(\*\*\*\s+.+?))\s*\n([\s\S]*?)(?=---\s+a\/|\*\*\*|$)/g;
  let match;
  while ((match = fileRegex.exec(content)) !== null) {
    const path = match[1] || match[3]?.replace(/^\*\*\*\s+/, '') || 'unknown';
    const diff = match[4] || '';
    
    // Extract language from file extension
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const langMap: Record<string, string> = {
      ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
      py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java',
      cpp: 'cpp', c: 'c', cs: 'csharp', php: 'php', swift: 'swift',
      kt: 'kotlin', scala: 'scala', sh: 'bash', bash: 'bash',
      html: 'html', css: 'css', scss: 'scss', less: 'less',
      json: 'json', yaml: 'yaml', yml: 'yaml', xml: 'xml',
      md: 'markdown', sql: 'sql', dockerfile: 'dockerfile',
    };
    const language = langMap[ext] || ext;

    // Parse diff content to extract original and modified
    const lines = diff.split('\n');
    let original = '';
    let modified = '';
    let status: FileChange['status'] = 'modified';

    for (const line of lines) {
      if (line.startsWith('-') && !line.startsWith('---')) {
        original += line.substring(1) + '\n';
      } else if (line.startsWith('+') && !line.startsWith('+++')) {
        modified += line.substring(1) + '\n';
      } else if (line.startsWith(' ')) {
        original += line.substring(1) + '\n';
        modified += line.substring(1) + '\n';
      }
    }

    // Determine status
    if (original.trim() === '' && modified.trim() !== '') {
      status = 'added';
    } else if (modified.trim() === '' && original.trim() !== '') {
      status = 'deleted';
    }

    files.push({
      path,
      language,
      original: original.trimEnd(),
      modified: modified.trimEnd(),
      status,
    });
  }

  // Also try to parse code blocks with filename comments
  const codeBlockRegex = /```(\w+)?\s*(?:\/\/\s*(.+?))?\n([\s\S]*?)```/g;
  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = match[1] || 'text';
    const fileName = match[2]?.trim();
    const code = match[3]?.trim() || '';
    
    if (fileName && code) {
      // Check if this file is already in the list
      const existing = files.find(f => f.path === fileName);
      if (!existing) {
        files.push({
          path: fileName,
          language,
          original: '',
          modified: code,
          status: 'added',
        });
      }
    }
  }

  return files;
}

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [agentMode, setAgentMode] = useState<AgentMode>('act');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const setSessionDetails = useAppStore((s) => s.setSessionDetails);
  const { toggleSidebar, open: sidebarOpen } = useSidebar();
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const setRightPanelOpen = useAppStore((s) => s.setRightPanelOpen);
  // Agent metadata from store (set by sidebar when selecting a session)
  const storeAgentIcon = useAppStore((s) => s.activeAgentIcon);
  const storeAgentName = useAppStore((s) => s.activeAgentName);
  const storeSessionName = useAppStore((s) => s.activeSessionName);
  const wsRef = useRef<WebSocket | null>(null);
  const streamingSessionIdRef = useRef<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedSessionRef = useRef<Session | null>(null);

  // Auto-resize textarea on input
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => { autoResizeTextarea(); }, [input, autoResizeTextarea]);

  // Cost calculation (approximate pricing per 1K tokens)
  const calculateCost = (usage: TokenUsage): number => {
    const inputCost = (usage.input / 1000) * 0.01;  // $0.01 per 1K input tokens
    const outputCost = (usage.output / 1000) * 0.03; // $0.03 per 1K output tokens
    return inputCost + outputCost;
  };

  // Simulate token usage for demo purposes
  const simulateTokenUsage = (content: string): TokenUsage => {
    const words = content.split(/\s+/).length;
    const inputTokens = Math.floor(words * 1.3); // rough estimate
    const outputTokens = Math.floor(words * 1.5);
    return { input: inputTokens, output: outputTokens };
  };

  // Checkpoint management
  const saveCheckpoint = useCallback((messageId: string) => {
    const checkpoint: Checkpoint = {
      id: Date.now().toString(),
      messageId,
      timestamp: new Date(),
      messages: [...messages],
      label: `${t("chat.checkpoints")} ${checkpoints.length + 1}`,
    };
    setCheckpoints(prev => [...prev, checkpoint]);
  }, [messages, checkpoints]);

  const rollbackToCheckpoint = useCallback((checkpointId: string) => {
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    if (checkpoint) {
      setMessages(checkpoint.messages);
      setShowCheckpoints(false);
    }
  }, [checkpoints]);

  // Detect installed agents and load sessions
  const initAgents = useCallback(async () => {
    // Detect installed agents via API — use full agent data from detect
    let detectedAgents: Array<{id: string; name: string; icon: string; description: string; available: boolean; category?: string; path?: string; version?: string}> = [];
    try {
      const r = await fetch(`${getApiUrl()}/api/agents/detect`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) { const d = await r.json(); detectedAgents = d.agents || []; }
    } catch {}

    // Load all sessions
    let sessions: Session[] = [];
    try {
      const r = await fetch(`${getApiUrl()}/api/sessions?limit=500`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) { const d = await r.json(); sessions = d.sessions || []; }
    } catch {}

    // Group sessions by agent id, then by source within each agent
    const agentSessionMap: Record<string, Session[]> = {};
    for (const s of sessions) {
      if (!s.platform && s.source) s.platform = s.source;
      // Filter out cron sessions — they're automated background tasks, not user conversations
      const src = s.platform || s.source || '';
      if (src === 'cron') continue;
      // hermes sub-sources (cli/weixin/acp/tui/tool/subagent) all belong to hermes agent
      const HERMES_SOURCES = new Set(['cli', 'weixin', 'acp', 'tui', 'tool', 'subagent']);
      const agentKey = HERMES_SOURCES.has(src) ? 'hermes' : (s.platform || 'hermes');
      if (!agentSessionMap[agentKey]) agentSessionMap[agentKey] = [];
      agentSessionMap[agentKey].push(s);
    }

    // Build source groups for any agent that has multiple sources
    const buildSourceGroups = (agentSessions: Session[], agentId: string): SourceGroup[] | undefined => {
      const sourceMap: Record<string, Session[]> = {};
      for (const s of agentSessions) {
        const src = (s.platform || s.source || agentId) as string;
        if (!sourceMap[src]) sourceMap[src] = [];
        sourceMap[src].push(s);
      }
      const sources = Object.keys(sourceMap);
      if (sources.length <= 1) return undefined; // no need for tree if only one source
      return sources.map(src => {
        const meta = SOURCE_META[src] || { labelKey: src, icon: '💬' };
        return {
          source: src, label: t(meta.labelKey), icon: meta.icon,
          sessions: sourceMap[src], expanded: false,
        };
      });
    };

    // Build agent list from detect API data — only available (installed) agents
    const agentList: AgentInfo[] = detectedAgents
      .filter(a => a.available)
      .map(a => {
        const agentSessions = agentSessionMap[a.id] || [];
        const sourceGroups = buildSourceGroups(agentSessions, a.id);
        return {
          id: a.id,
          name: a.name,
          icon: a.icon || AGENT_ICONS[a.id] || '🤖',
          description: a.description,
          installed: a.available,
          available: a.available,
          category: a.category,
          path: a.path,
          sessions: agentSessions,
          expanded: false,
          sourceGroups,
        };
      });

    // Add unknown platform sessions (agents not in detect API)
    for (const [key, val] of Object.entries(agentSessionMap)) {
      if (!agentList.find(a => a.id === key) && val.length > 0) {
        const sourceGroups = buildSourceGroups(val, key);
        agentList.push({
          id: key, name: key, icon: '💬', description: key,
          installed: false, sessions: val, expanded: false,
          sourceGroups,
        });
      }
    }

    setAgents(prev => {
      const expandedIds = new Set(prev.filter(a => a.expanded).map(a => a.id));
      const expandedSrcs = new Map();
      prev.forEach(a => a.sourceGroups?.forEach(g => {
        if (g.expanded) {
          if (!expandedSrcs.has(a.id)) expandedSrcs.set(a.id, new Set());
          expandedSrcs.get(a.id).add(g.source);
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
  }, []);

  // Load history for a session
  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        // Remove from local state (both flat sessions and sourceGroups)
        setAgents(prev => prev.map(a => ({
          ...a,
          sessions: a.sessions.filter(s => s.id !== sessionId),
          sourceGroups: a.sourceGroups?.map(g => ({
            ...g,
            sessions: g.sessions.filter(s => s.id !== sessionId),
          })).filter(g => g.sessions.length > 0),
        })));
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
          selectedSessionRef.current = null;
          setMessages([]);
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        console.error("Delete failed:", res.status, errData);
      }
    } catch (e) { console.error("Delete failed:", e); }
    setDeleteConfirm(null);
  }, [selectedSession]);

  const loadHistory = useCallback(async (sessionId: string) => {
    try {
      const r = await fetch(`${getApiUrl()}/api/sessions/${sessionId}/messages`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) {
        const d = await r.json();
        const msgs: Message[] = (d.messages || [])
          .filter((m: Record<string, unknown>) => {
            const role = m.role as string;
            const content = m.content as string;
            if (role === 'user' && content) return true;
            if (role === 'assistant' && content && content.trim()) return true;
            return false;
          })
          .map((m: Record<string, unknown>) => {
            const content = (m.content as string) || '';
            const isAgent = m.role !== 'user';
            return {
              id: (m.id || Date.now()).toString(),
              role: isAgent ? 'agent' : 'user',
              parts: [{ type: 'text', text: content }],
              timestamp: new Date((m.timestamp as string) || Date.now()),
              source: m.source as string,
              fileChanges: isAgent ? parseFileChanges(content) : undefined,
            };
          });
        setMessages(msgs);
      }
    } catch {}
  }, []);

  // WebSocket
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;
    let retryDelay = 1000;

    const connect = () => {
      if (unmounted) return;
      ws = new WebSocket(`${getAcpWsUrl()}/ws/chat?token=${token}`);
      wsRef.current = ws;
      ws.onopen = () => { setWsConnected(true); retryDelay = 1000; };
      ws.onclose = () => {
        setWsConnected(false);
        if (!unmounted) reconnectTimer = setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30000);
      };
      ws.onerror = () => { setWsConnected(false); };
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          // Only process response messages if they belong to the current streaming session
          const currentSessionId = selectedSessionRef.current?.id;
          if (data.type === 'done') {
            setLoading(false);
            streamingSessionIdRef.current = null;
            // Update selectedSession with new session_id and refresh list
            if (selectedSessionRef.current && !selectedSessionRef.current.id && data.session_id) {
              setSelectedSession(prev => prev ? { ...prev, id: data.session_id } : prev);
              initAgents();
            }
            // Only update messages if we're still in the same session
            if (data.session_id && currentSessionId && data.session_id !== currentSessionId) return;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'agent' && last?.source === 'streaming') {
                const content = last.parts[0]?.text || '';
                const fileChanges = parseFileChanges(content);
                const tokenUsage = data.tokenUsage || simulateTokenUsage(content);
                return [...prev.slice(0, -1), { ...last, source: undefined, fileChanges, tokenUsage }];
              }
              return prev;
            });
          }
          else if (data.type === 'chunk') {
            // Ignore chunks if user switched to a different session
            if (streamingSessionIdRef.current && currentSessionId && streamingSessionIdRef.current !== currentSessionId) return;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'agent' && last?.source === 'streaming') {
                return [...prev.slice(0, -1), { ...last, parts: [{ type: 'text', text: (last.parts[0]?.text || '') + data.text }] }];
              }
              return [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: data.text }], timestamp: new Date(), source: 'streaming' }];
            });
          }
          else if (data.type === 'error') { setLoading(false); streamingSessionIdRef.current = null; setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `${t("chat.error")}: ${data.message}` }], timestamp: new Date() }]); }
        } catch {}
      };
    };
    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [initAgents]);

  useEffect(() => { initAgents(); }, [initAgents]);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    setShowScrollDown(false);
  }, [messages]);

  // Listen for session selection from global sidebar (via store)
  const activeSessionIdFromStore = useAppStore((s) => s.activeSessionId);
  const activeAgentIdFromStore = useAppStore((s) => s.activeAgentId);

  useEffect(() => {
    if (!activeSessionIdFromStore) return;
    if (selectedSession?.id === activeSessionIdFromStore) return;
    // Try to find session in local agents list
    for (const agent of agents) {
      const session = agent.sessions.find(s => s.id === activeSessionIdFromStore);
      if (session) {
        selectSession(session, agent);
        return;
      }
    }
    // Fallback: if agents list hasn't loaded yet, create minimal objects from store data
    if (storeAgentName && !selectedSession) {
      const minimalSession: Session = { id: activeSessionIdFromStore, name: storeSessionName || '', platform: 'hermes' };
      const minimalAgent: AgentInfo = {
        id: activeAgentIdFromStore || 'unknown',
        name: storeAgentName,
        icon: storeAgentIcon || '🤖',
        description: '',
        installed: true,
        sessions: [],
        expanded: false,
      };
      selectSession(minimalSession, minimalAgent);
    }
  }, [activeSessionIdFromStore, agents]);

  // Auto-select session from URL param ?session=SESSION_ID (fallback)
  useEffect(() => {
    const sid = new URLSearchParams(window.location.search).get('session');
    if (!sid) return;
    if (selectedSession?.id === sid) return;
    for (const agent of agents) {
      const session = agent.sessions.find(s => s.id === sid);
      if (session) {
        selectSession(session, agent);
        return;
      }
    }
  }, [agents]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true);
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Add mode prefix for plan mode
    const messageText = agentMode === 'plan' ? `[PLAN MODE] ${text}` : text;

    const wsPayload = {
      type: 'message', text: messageText,
      mode: selectedAgent ? 'agent_proxy' : 'hermes',
      session_id: selectedSession?.id,
      ...(selectedAgent ? { agent_id: selectedAgent.id } : {}),
      attachments: attachments.map(a => ({ type: a.type, data: a.data, name: a.name, mime_type: a.mime_type })),
    };
    streamingSessionIdRef.current = selectedSession?.id || null;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(wsPayload));
      return;
    }
    // Wait for WS reconnection instead of falling through to broken HTTP fallback
    if (wsRef.current?.readyState !== WebSocket.OPEN) {
      let waited = 0;
      const waitConnect = setInterval(() => {
        waited += 500;
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          clearInterval(waitConnect);
          wsRef.current.send(JSON.stringify(wsPayload));
        } else if (waited >= 10000) {
          clearInterval(waitConnect);
          setLoading(false);
          setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: t('chat.connectionLost') }], timestamp: new Date() }]);
        }
      }, 500);
      return;
    }
    // All paths above return — WS send or WS-wait handles everything.
    // No HTTP fallback needed.
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        const isImage = file.type.startsWith('image/');
        setAttachments(prev => [...prev, { type: isImage ? 'image' : 'file', data: base64, name: file.name, mime_type: file.type }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          setAttachments(prev => [...prev, { type: 'image', data: base64, name: 'clipboard.png', mime_type: 'image/png' }]);
        };
        reader.readAsDataURL(blob);
      }
    }
  };

  const selectSession = (session: Session, agent: AgentInfo) => {
    setSelectedSession(session);
    selectedSessionRef.current = session;
    setSelectedAgent(agent);
    setDeleteConfirm(null);
    setEditingTitle(false);
    setShowCheckpoints(false); // close checkpoints when switching sessions
    loadHistory(session.id);
    // Update store with agent metadata for cross-component access
    setSessionDetails({
      agentIcon: agent.icon,
      agentName: agent.name,
      agentDescription: agent.description || '',
      sessionName: session.name || session.title || '',
      lastActive: session.last_active || session.updated_at || '',
      imageCount: 0,
      fileCount: 0,
    });
  };

  const startEditTitle = () => {
    if (!selectedSession?.id) return; // can't rename unsaved sessions
    setEditTitleValue(selectedSession.name || selectedSession.title || '');
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.select(), 50);
  };

  const saveTitle = async () => {
    if (!selectedSession?.id || !editTitleValue.trim()) {
      setEditingTitle(false);
      return;
    }
    const newTitle = editTitleValue.trim();
    setEditingTitle(false);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/${selectedSession.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle }),
      });
      if (res.ok) {
        setSelectedSession(prev => prev ? { ...prev, name: newTitle, title: newTitle } : prev);
        initAgents(); // refresh sidebar list
      }
    } catch (e) { console.error('Rename failed:', e); }
  };

  // Collect attachments from conversation
  const allAttachments = messages.flatMap(m => m.parts.filter(p => p.type === 'image' || p.type === 'file'));
  const imageCount = allAttachments.filter(p => p.type === 'image').length;
  const fileCount = allAttachments.filter(p => p.type === 'file').length;

  // Sync image/file counts to store for workspace details tab
  useEffect(() => {
    const current = useAppStore.getState().sessionDetails;
    if (current) {
      setSessionDetails({ ...current, imageCount, fileCount });
    }
  }, [imageCount, fileCount]);

  // Shared checkpoint list content (used by both mobile Sheet and desktop overlay)
  const renderCheckpointList = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      {checkpoints.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
          <Bookmark className="w-8 h-8 mb-2 opacity-40" />
          <p className="text-xs">{t("chat.noCheckpoints", "No checkpoints saved")}</p>
          <p className="text-[10px] text-muted-foreground mt-1">{t("chat.checkpointHint", "Click the bookmark icon on any agent message to save a checkpoint")}</p>
        </div>
      ) : (
        checkpoints.map(cp => (
          <div key={cp.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/50 transition-colors">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{cp.label}</p>
              <p className="text-[10px] text-muted-foreground">{cp.timestamp.toLocaleString()} · {cp.messages.length} msgs</p>
            </div>
            <button
              onClick={() => rollbackToCheckpoint(cp.id)}
              className="shrink-0 ml-2 px-2.5 py-1.5 rounded-md text-xs text-primary hover:bg-primary/10 transition-colors"
            >
              {t("chat.rollback", "Rollback")}
            </button>
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex flex-1 min-h-0 relative">
      {/* Chat Window */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="h-12 border-b border-border flex items-center px-3 lg:px-4 justify-between shrink-0">
          <div className="flex items-center gap-1.5 lg:gap-2 min-w-0 flex-1">
            <button onClick={(e) => { e.stopPropagation(); toggleSidebar(); if (isMobile) { setRightPanelOpen(false); setShowCheckpoints(false); } }} className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation" aria-label="Toggle Sidebar">
              <PanelLeft className="w-4 h-4" />
            </button>
            {(selectedAgent || storeAgentIcon) && <span className="text-sm shrink-0">{selectedAgent?.icon || storeAgentIcon}</span>}
            <div className="min-w-0 flex-1">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  value={editTitleValue}
                  onChange={e => setEditTitleValue(e.target.value)}
                  onBlur={saveTitle}
                  onKeyDown={e => { if (e.key === 'Enter') saveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  className="font-medium text-sm bg-transparent border-b border-primary outline-none px-0.5 min-w-0 max-w-[140px] lg:max-w-[200px]"
                />
              ) : (
                <span
                  className={`font-medium text-sm truncate block ${selectedSession?.id ? 'cursor-pointer hover:text-primary' : ''}`}
                  onClick={startEditTitle}
                  title={selectedSession?.id ? 'Click to rename' : undefined}
                >
                  {selectedSession?.name || selectedSession?.title || storeSessionName || (selectedAgent || storeAgentName ? `${selectedAgent?.name || storeAgentName} ${t('chat.newSession')}` : t('chat.newChat'))}
                </span>
              )}
            </div>
            {(selectedAgent || storeAgentName) && <span className="text-[10px] lg:text-xs text-muted-foreground px-1 lg:px-1.5 py-0.5 rounded bg-muted shrink-0 truncate max-w-[80px] lg:max-w-none">{selectedAgent?.name || storeAgentName}</span>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button onClick={(e) => { e.stopPropagation(); toggleRightPanel(); setShowCheckpoints(false); if (isMobile && sidebarOpen) toggleSidebar(); }} className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation" aria-label="Toggle Workspace">
              <PanelRightOpen className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          setShowScrollDown(!atBottom);
        }} className="flex-1 overflow-y-auto px-3 lg:px-6 py-3 lg:py-4 space-y-3 lg:space-y-4 chat-scrollbar relative">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
              <h2 className="text-xl lg:text-2xl font-semibold mb-4 lg:mb-8">{t("chat.welcomeMessage")}</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3 w-full">
                {[
                  { icon: '📝', label: t('chat.quickReqDoc'), desc: t('chat.quickReqDocDesc') },
                  { icon: '🎨', label: t('chat.quickPrototype'), desc: t('chat.quickPrototypeDesc') },
                  { icon: '📊', label: t('chat.quickDataAnalysis'), desc: t('chat.quickDataAnalysisDesc') },
                  { icon: '💻', label: t('chat.quickCoding'), desc: t('chat.quickCodingDesc') },
                  { icon: '📋', label: t('chat.quickProjectPlan'), desc: t('chat.quickProjectPlanDesc') },
                  { icon: '🧪', label: t('chat.quickTestCase'), desc: t('chat.quickTestCaseDesc') },
                  { icon: '📄', label: t('chat.quickSolution'), desc: t('chat.quickSolutionDesc') },
                  { icon: '🔍', label: t('chat.quickKnowledgeSearch'), desc: t('chat.quickKnowledgeSearchDesc') },
                ].map(item => (
                  <button key={item.label} onClick={() => setInput(item.desc)}
                    className="flex flex-col items-center gap-1.5 lg:gap-2 p-3 lg:p-4 rounded-xl border bg-card hover:bg-muted/80 hover:border-primary/30 active:bg-muted transition-all group touch-manipulation">
                    <span className="text-xl lg:text-2xl">{item.icon}</span>
                    <span className="text-xs lg:text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-2 lg:gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'agent' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[85%] lg:max-w-[70%] rounded-xl px-3 lg:px-4 py-2 lg:py-2.5 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {msg.parts.map((p, i) => (
                  <div key={i}>
                    {p.type === 'text' && <MarkdownContent content={p.text || ''} onCodeApply={(code, lang) => {
                      // Handle code apply - copy to clipboard
                      navigator.clipboard.writeText(code);
                    }} />}
                    {p.type === 'image' && p.data && <img src={`data:${p.mime_type || 'image/png'};base64,${p.data}`} alt={p.name || 'image'} className="max-w-xs w-auto max-h-64 rounded-lg mt-1 object-contain" />}
                    {p.type === 'file' && <div className="flex items-center gap-2 mt-1 p-2 bg-background/50 rounded"><FileText className="w-4 h-4" /><span className="text-xs">{p.name || 'file'}</span></div>}
                  </div>
                ))}
                {/* Multi-file diff view for agent messages with file changes */}
                {msg.role === 'agent' && msg.fileChanges && msg.fileChanges.length > 0 && (
                  <MultiFileDiff
                    files={msg.fileChanges}
                    onAccept={(path, content) => {
                      // Handle accept - copy to clipboard
                      navigator.clipboard.writeText(content);
                    }}
                    onReject={(path) => {
                      console.log('Rejected:', path);
                    }}
                    onAcceptAll={() => {
                      console.log('Accepted all files');
                    }}
                    onRejectAll={() => {
                      console.log('Rejected all files');
                    }}
                  />
                )}
                <div className="text-[10px] mt-1.5 opacity-60 flex items-center gap-1 flex-wrap">
                  <span>{msg.timestamp.toLocaleTimeString()}</span>
                  {msg.source && <span className="px-1 py-0.5 rounded bg-black/10 text-[9px]">{msg.source}</span>}
                  {msg.role === 'agent' && msg.tokenUsage && (
                    <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-black/10 text-[9px]">
                      <span>IN: {msg.tokenUsage.input.toLocaleString()}</span>
                      <span>OUT: {msg.tokenUsage.output.toLocaleString()}</span>
                      <span className="text-yellow-500">${calculateCost(msg.tokenUsage).toFixed(4)}</span>
                    </span>
                  )}
                </div>
                {/* Checkpoint button for agent messages */}
                {msg.role === 'agent' && (
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => saveCheckpoint(msg.id)}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground hover:bg-muted-foreground/10 transition-colors"
                      title={t("chat.saveCheckpoint")}
                    >
                      <Bookmark className="w-3 h-3" />
                      <span>{t("chat.saveCheckpoint")}</span>
                    </button>
                  </div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}
          {loading && (
            <div className="flex gap-2 lg:gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
              <div className="bg-muted rounded-xl px-4 py-2.5"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            </div>
          )}
          {/* Scroll-to-bottom FAB */}
          {showScrollDown && (
            <button
              onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })}
              className="sticky bottom-2 left-1/2 -translate-x-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-background border border-border shadow-md hover:bg-muted active:scale-95 transition-all z-10"
              aria-label="Scroll to bottom"
            >
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Input area — Doubao style */}
        <div className="border-t border-border px-3 lg:px-4 py-3 shrink-0">
          {attachments.length > 0 && (
            <div className="flex gap-2 mb-2 flex-wrap">
              {attachments.map((a, i) => (
                <div key={i} className="flex items-center gap-1 px-2 py-1 bg-muted rounded text-xs">
                  {a.type === 'image' ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                  <span className="truncate max-w-20">{a.name}</span>
                  <button onClick={() => setAttachments(prev => prev.filter((_, j) => j !== i))}><X className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="rounded-2xl border border-primary/40 bg-background overflow-hidden">
            {/* Input row */}
            <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              onPaste={handlePaste} placeholder={t("chat.inputPlaceholder", "发消息或按住空格说话...")} rows={1}
              className="w-full resize-none bg-transparent px-4 py-3 text-sm focus:outline-none min-h-[48px]" />

            {/* Action buttons row */}
            <div className="flex items-center gap-0.5 lg:gap-1 px-1.5 lg:px-2 pb-2">
              <button onClick={() => fileRef.current?.click()} className="flex items-center justify-center w-9 h-9 lg:w-auto lg:h-auto lg:px-2.5 lg:py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted active:bg-muted/80 touch-manipulation transition-colors">
                <Plus className="w-4 h-4" />
              </button>
              <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFile} />

              <div className="w-px h-4 bg-border mx-0.5 lg:mx-1" />

              <button
                onClick={() => setAgentMode(prev => prev === 'plan' ? 'act' : 'plan')}
                className={`flex items-center gap-1 lg:gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-xs font-medium touch-manipulation transition-colors ${
                  agentMode === 'plan'
                    ? 'text-blue-400 hover:bg-blue-500/10'
                    : 'text-green-400 hover:bg-green-500/10'
                }`}
              >
                {agentMode === 'plan' ? <Brain className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                <span className="hidden lg:inline">{agentMode === 'plan' ? 'Plan' : 'Act'}</span>
                <ChevronDown className="w-3 h-3 hidden lg:inline" />
              </button>

              <button onClick={() => { const next = !showCheckpoints; setShowCheckpoints(next); if (next) { setRightPanelOpen(false); } }} className="flex items-center gap-1 lg:gap-1.5 px-2 lg:px-2.5 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted active:bg-muted/80 touch-manipulation transition-colors relative">
                <RotateCcw className="w-4 h-4" />
                <span className="hidden lg:inline">{t("chat.history", "历史")}</span>
                {checkpoints.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {checkpoints.length}
                  </span>
                )}
              </button>

              <div className="flex-1" />

              <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)}
                className="flex items-center justify-center w-10 h-10 lg:w-8 lg:h-8 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 touch-manipulation transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Checkpoints Panel — Sheet on mobile, overlay on desktop */}
      {isMobile ? (
        <Sheet open={showCheckpoints} onOpenChange={setShowCheckpoints}>
          <SheetContent side="right" size="md" className="p-0 flex flex-col">
            <SheetHeader className="h-12 shrink-0 flex flex-row items-center px-3 border-b border-border justify-between">
              <SheetTitle className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                {t("chat.checkpoints", "Checkpoints")}
              </SheetTitle>
            </SheetHeader>
            {renderCheckpointList()}
          </SheetContent>
        </Sheet>
      ) : (
        showCheckpoints && (
          <div className="absolute right-0 top-12 bottom-0 w-72 border-l border-border bg-card z-20 flex flex-col shadow-lg">
            <div className="h-12 shrink-0 flex items-center justify-between px-3 border-b border-border">
              <span className="text-sm font-semibold flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                {t("chat.checkpoints", "Checkpoints")}
              </span>
              <button onClick={() => setShowCheckpoints(false)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4" />
              </button>
            </div>
            {renderCheckpointList()}
          </div>
        )
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        title={t("chat.deleteSessionTitle", "删除会话")}
        description={t("chat.deleteSessionDesc", `确定要删除「${deleteConfirm?.name}」吗？`, { name: deleteConfirm?.name })}
        className="max-w-xs"
        footer={
          <>
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 rounded-lg text-sm bg-muted hover:bg-muted/80 text-foreground transition-colors">
              {t("chat.cancelDelete", "取消")}
            </button>
            <button onClick={() => { if (deleteConfirm) { deleteSession(deleteConfirm.id); setDeleteConfirm(null); } }} className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-700 text-white font-medium transition-colors">
              {t("chat.confirmDelete", "确认删除")}
            </button>
          </>
        }
      />
    </div>
  );
}

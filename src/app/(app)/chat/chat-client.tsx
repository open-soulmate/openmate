'use client';
import { MarkdownContent } from "@/components/markdown-content";
import { MultiFileDiff, type FileChange } from "@/components/multi-file-diff";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, PanelRightClose, PanelRightOpen, FileText, Image as ImageIcon, Info, ChevronDown, ChevronRight, Plus, MessageSquare, Cpu, Trash2, Search as SearchIcon, Bookmark, RotateCcw, Zap, Brain } from "lucide-react";
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';
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

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const [agentMode, setAgentMode] = useState<AgentMode>('act');
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const { t } = useTranslation();
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
      const r = await fetch(`${getApiUrl()}/api/sessions?limit=100`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) { const d = await r.json(); sessions = d.sessions || []; }
    } catch {}

    // Group sessions by agent id, then by source within each agent
    const agentSessionMap: Record<string, Session[]> = {};
    for (const s of sessions) {
      if (!s.platform && s.source) s.platform = s.source;
      // hermes sub-sources (cli/weixin/cron) all belong to hermes agent
      const HERMES_SOURCES = new Set(['cli', 'weixin', 'cron']);
      const src = s.platform || s.source || '';
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
          sessions: sourceMap[src], expanded: true,
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
          expanded: a.id === 'hermes',
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

    setAgents(agentList);
  }, []);

  // Load history for a session
  // Search sessions (title + content)
  const handleSearch = useCallback(async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/search?q=${encodeURIComponent(q)}`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data.sessions || []);
      }
    } catch (e) { console.error("Search failed:", e); }
    setSearching(false);
  }, []);

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
          if (data.type === 'done') {
            setLoading(false);
            if (data.text) initAgents();
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
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'agent' && last?.source === 'streaming') {
                return [...prev.slice(0, -1), { ...last, parts: [{ type: 'text', text: (last.parts[0]?.text || '') + data.text }] }];
              }
              return [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: data.text }], timestamp: new Date(), source: 'streaming' }];
            });
          }
          else if (data.type === 'error') { setLoading(false); setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `${t("chat.error")}: ${data.message}` }], timestamp: new Date() }]); }
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

  useEffect(() => { initAgents(); const timer = setInterval(initAgents, 30000); return () => clearInterval(timer); }, [initAgents]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true);

    // Add mode prefix for plan mode
    const messageText = agentMode === 'plan' ? `[PLAN MODE] ${text}` : text;

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message', text: messageText, mode: 'hermes', session_id: selectedSession?.id,
        attachments: attachments.map(a => ({ type: a.type, data: a.data, name: a.name, mime_type: a.mime_type })),
      }));
      return;
    }
    try {
      const imageAttachment = attachments.find(a => a.type === 'image');
      let r: Response;
      if (imageAttachment) {
        r = await fetch(`${getAcpProxyUrl()}/acp/send-image`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ text: messageText, image_data: imageAttachment.data, mime_type: imageAttachment.mime_type || 'image/png', session_id: selectedSession?.id }),
        });
      } else {
        r = await fetch(`${getAcpProxyUrl()}/acp/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
          body: JSON.stringify({ text: messageText, session_id: selectedSession?.id, mode: agentMode }),
        });
      }
      const d = await r.json();
      const content = d.content || d.error || t("chat.noResponse");
      const tokenUsage = d.tokenUsage || simulateTokenUsage(content);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        parts: [{ type: 'text', text: content }],
        timestamp: new Date(),
        source: d.source,
        fileChanges: parseFileChanges(content),
        tokenUsage,
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: t("chat.requestTimeout") }], timestamp: new Date() }]);
    }
    setLoading(false);
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

  const toggleAgent = (agentId: string) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, expanded: !a.expanded } : a));
  };

  const toggleSourceGroup = (agentId: string, source: string) => {
    setAgents(prev => prev.map(a => {
      if (a.id !== agentId || !a.sourceGroups) return a;
      return {
        ...a,
        sourceGroups: a.sourceGroups.map(g =>
          g.source === source ? { ...g, expanded: !g.expanded } : g
        ),
      };
    }));
  };

  const selectSession = (session: Session, agent: AgentInfo) => {
    setSelectedSession(session);
    setSelectedAgent(agent);
    setDeleteConfirm(null);
    loadHistory(session.id);
  };

  const newSession = (agent: AgentInfo) => {
    setSelectedSession({ id: '', name: `${agent.name} ${t("chat.newSession")}`, platform: agent.id });
    setSelectedAgent(agent);
    setMessages([]);
  };

  // Collect attachments from conversation
  const allAttachments = messages.flatMap(m => m.parts.filter(p => p.type === 'image' || p.type === 'file'));
  const imageCount = allAttachments.filter(p => p.type === 'image').length;
  const fileCount = allAttachments.filter(p => p.type === 'file').length;

  return (
    <div className="flex h-full">
      {/* Column 2: Agent + Session List - hidden on mobile when chat is active */}
      <div className={`${selectedSession ? 'hidden md:flex' : 'flex'} w-full md:w-64 shrink-0 flex-col border-r border-border bg-card`}>
        <div className="p-3 border-b border-border">
          <input placeholder={t("chat.searchSessions")} value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-muted text-sm outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Search Results */}
          {searchQuery.trim() ? (
            <div>
              {searching && <div className="p-3 text-xs text-muted-foreground">{t("chat.searching")}</div>}
              {!searching && searchResults.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">{t("chat.noSearchResults")}</div>
              )}
              {searchResults.map(r => {
                const matchedAgent = agents.find(a => a.sessions.some(s => s.id === r.id));
                return (
                  <button key={r.id} onClick={() => {
                    if (matchedAgent) {
                      const session = matchedAgent.sessions.find(s => s.id === r.id);
                      if (session) { selectSession(session, matchedAgent); setSearchQuery(''); setSearchResults([]); }
                    }
                  }} className="w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors border-b border-border/30">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs">{r.match_type === 'title' ? '📋' : '💬'}</span>
                      <span className="text-xs font-medium truncate">{r.title || r.id}</span>
                    </div>
                    {r.snippet && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.snippet}</p>}
                  </button>
                );
              })}
            </div>
          ) : (
          agents.map(agent => (
            <div key={agent.id}>
              {/* Agent header - click to expand/collapse, + button for new session */}
              <div className="flex items-center justify-between px-2 py-1.5 hover:bg-muted/50 group">
                <button onClick={() => toggleAgent(agent.id)} className="flex items-center gap-1.5 flex-1 min-w-0">
                  {agent.expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                  {agent.logo ? <img src={agent.logo} alt={agent.name} className="w-5 h-5 rounded object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display="none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} /> : null}<span className={`text-sm ${agent.logo ? "hidden" : ""}`}>{agent.icon}</span>
                  <span className="text-sm font-medium truncate">{agent.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{agent.sessions.length}</span>
                </button>
                <button onClick={() => newSession(agent)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity" title={`${agent.name} ${t("chat.newSession")}`}>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Sessions under this agent */}
              {agent.expanded && agent.sourceGroups && agent.sourceGroups.length > 0 ? (
                // Tree view: source groups with sub-sessions
                agent.sourceGroups.map(group => (
                  <div key={group.source}>
                    <button
                      onClick={() => toggleSourceGroup(agent.id, group.source)}
                      className="w-full flex items-center gap-1.5 pl-6 pr-3 py-1.5 hover:bg-muted/40 transition-colors"
                    >
                      {group.expanded ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                      <span className="text-xs">{group.icon}</span>
                      <span className="text-xs font-medium text-muted-foreground">{group.label}</span>
                      <span className="text-[10px] text-muted-foreground ml-auto">{group.sessions.length}</span>
                    </button>
                    {group.expanded && group.sessions.map(session => (
                      <div key={session.id} role="button" tabIndex={0} onClick={() => selectSession(session, agent)}
                        className={`group w-full text-left pl-12 pr-3 py-2 hover:bg-muted/80 transition-colors cursor-pointer ${selectedSession?.id === session.id ? 'bg-muted' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                          <span className="text-xs truncate text-foreground flex-1">{session.name || session.title || "Untitled"}</span>
                          {deleteConfirm === session.id ? (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                                className="px-1 py-0.5 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white font-medium">
                                {t("chat.confirmDelete", "确认")}
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                                className="px-1 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[10px] text-zinc-300">
                                {t("chat.cancelDelete", "取消")}
                              </button>
                            </div>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(session.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-red-500 transition-opacity ml-1 shrink-0" title={t("chat.delete")}><Trash2 className="w-3 h-3" /></button>
                          )}
                        </div>
                        {(session.last_active || session.updated_at) && <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">{formatRelativeTime(session.last_active || session.updated_at!)}</div>}
                      </div>
                    ))}
                  </div>
                ))
              ) : (
                // Flat view: sessions directly under agent
                agent.expanded && agent.sessions.map(session => (
                  <div key={session.id} role="button" tabIndex={0} onClick={() => selectSession(session, agent)}
                    className={`group w-full text-left pl-8 pr-3 py-2 hover:bg-muted/80 transition-colors cursor-pointer ${selectedSession?.id === session.id ? 'bg-muted' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-xs truncate text-foreground flex-1">{session.name || session.title || "Untitled"}</span>
                      {deleteConfirm === session.id ? (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }}
                            className="px-1 py-0.5 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white font-medium">
                            {t("chat.confirmDelete", "确认")}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null); }}
                            className="px-1 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[10px] text-zinc-300">
                            {t("chat.cancelDelete", "取消")}
                          </button>
                        </div>
                      ) : (
                        <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(session.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-red-500 transition-opacity ml-1 shrink-0" title={t("chat.delete")}><Trash2 className="w-3 h-3" /></button>
                      )}
                    </div>
                    {(session.last_active || session.updated_at) && <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">{formatRelativeTime(session.last_active || session.updated_at!)}</div>}
                  </div>
                ))
              )}

              {/* Empty state */}
              {agent.expanded && agent.sessions.length === 0 && (
                <div className="pl-8 pr-3 py-2 text-xs text-muted-foreground italic">{t("chat.noSessions")}</div>
              )}
            </div>
          )))}
        </div>
      </div>

      {/* Column 3: Chat Window - on mobile, only show when session selected */}
      <div className={`${selectedSession ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-w-0`}>
        {/* Chat header */}
        <div className="h-12 border-b border-border flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-2">
            {/* Back button - mobile only */}
            <button onClick={() => setSelectedSession(null)} className="md:hidden p-1 rounded hover:bg-muted">
              <ChevronRight className="w-4 h-4 rotate-180" />
            </button>
            {selectedAgent && <span className="text-sm">{selectedAgent.icon}</span>}
            <span className="font-medium text-sm">{selectedSession?.name || (selectedAgent ? `${selectedAgent.name} ${t('chat.newSession')}` : t('chat.newChat'))}</span>
            {selectedAgent && <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">{selectedAgent.name}</span>}
          </div>
          <div className="flex items-center gap-2">
            {wsConnected ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-muted-foreground" />}
            <span className="text-xs text-muted-foreground">{wsConnected ? 'WS' : 'HTTP'}</span>
            <button onClick={() => setShowDetails(!showDetails)} className="p-1 rounded hover:bg-muted">
              {showDetails ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4 chat-scrollbar">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold mb-8">{t("chat.welcomeMessage")}</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
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
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:bg-muted/80 hover:border-primary/30 transition-all group">
                    <span className="text-2xl">{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
              {msg.role === 'agent' && (
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="w-4 h-4 text-primary" />
                </div>
              )}
              <div className={`max-w-[70%] rounded-xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                {msg.parts.map((p, i) => (
                  <div key={i}>
                    {p.type === 'text' && <MarkdownContent content={p.text || ''} onCodeApply={(code, lang) => {
                      // Handle code apply - copy to clipboard
                      navigator.clipboard.writeText(code);
                    }} />}
                    {p.type === 'image' && p.data && <img src={`data:${p.mime_type || 'image/png'};base64,${p.data}`} alt={p.name || 'image'} className="max-w-xs rounded-lg mt-1" />}
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
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
              <div className="bg-muted rounded-xl px-4 py-2.5"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            </div>
          )}
        </div>

        {/* Input area */}
        <div className="border-t border-border p-4 shrink-0">
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
          <div className="flex gap-2 items-end">
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg hover:bg-muted"><Paperclip className="w-4 h-4 text-muted-foreground" /></button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFile} />
            
            {/* Plan/Act Mode Toggle */}
            <button
              onClick={() => setAgentMode(prev => prev === 'plan' ? 'act' : 'plan')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                agentMode === 'plan'
                  ? 'bg-blue-500/10 text-blue-500 border border-blue-500/30'
                  : 'bg-green-500/10 text-green-500 border border-green-500/30'
              }`}
            >
              {agentMode === 'plan' ? (
                <>
                  <Brain className="w-4 h-4" />
                  <span>Plan</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Act</span>
                </>
              )}
            </button>

            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              onPaste={handlePaste} placeholder={agentMode === 'plan' ? t("chat.planModePlaceholder") : t("chat.actModePlaceholder")} rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            
            <button onClick={() => setShowCheckpoints(!showCheckpoints)} className="px-3 py-2 rounded-lg hover:bg-muted relative" title={t("chat.checkpoints")}>
              <RotateCcw className="w-4 h-4 text-muted-foreground" />
              {checkpoints.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[10px] rounded-full w-4 h-4 flex items-center justify-center">
                  {checkpoints.length}
                </span>
              )}
            </button>
            
            <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Column 4: Details Panel */}
      {showDetails && (
        <div className="hidden md:flex w-72 shrink-0 border-l border-border bg-card flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5"><Info className="w-4 h-4" />{t("chat.sessionDetails")}</span>
            <button onClick={() => setShowDetails(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {selectedAgent && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Agent</div>
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <span className="text-lg">{selectedAgent.icon}</span>
                  <div>
                    <div className="text-sm font-medium">{selectedAgent.name}</div>
                    <div className="text-[10px] text-muted-foreground">{selectedAgent.description}</div>
                  </div>
                </div>
              </div>
            )}
            {selectedSession && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">{t("chat.session")}</div>
                <div className="text-sm font-medium">{selectedSession.name}</div>
                {selectedSession.last_active && <div className="text-xs text-muted-foreground">{t("chat.lastActive")}: {selectedSession.last_active}</div>}
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Paperclip className="w-3 h-3" />{t("chat.attachments")} ({allAttachments.length})</div>
              {allAttachments.length === 0 ? <div className="text-xs text-muted-foreground italic">{t("chat.noAttachments")}</div> : (
                <div className="space-y-1">
                  {allAttachments.slice(0, 20).map((a, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50 text-xs">
                      {a.type === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-blue-500" /> : <FileText className="w-3.5 h-3.5 text-orange-500" />}
                      <span className="truncate flex-1">{a.name || 'unnamed'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2">{t("chat.statistics")}</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted/50 text-center"><div className="text-lg font-bold">{imageCount}</div><div className="text-[10px] text-muted-foreground">{t("chat.images")}</div></div>
                <div className="p-2 rounded bg-muted/50 text-center"><div className="text-lg font-bold">{fileCount}</div><div className="text-[10px] text-muted-foreground">{t("chat.files")}</div></div>
              </div>
            </div>
            
            {/* Checkpoints Section */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center justify-between">
                <span className="flex items-center gap-1"><RotateCcw className="w-3 h-3" />{t("chat.checkpoints")} ({checkpoints.length})</span>
                <button 
                  onClick={() => setShowCheckpoints(!showCheckpoints)}
                  className="text-primary hover:underline"
                >
                  {showCheckpoints ? t('chat.hide') : t('chat.view')}
                </button>
              </div>
              {showCheckpoints && (
                <div className="space-y-2">
                  {checkpoints.length === 0 ? (
                    <div className="text-xs text-muted-foreground italic">{t("chat.noCheckpoints")}</div>
                  ) : (
                    checkpoints.map(cp => (
                      <div key={cp.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium truncate">{cp.label}</div>
                          <div className="text-[10px] text-muted-foreground">{cp.timestamp.toLocaleString()}</div>
                        </div>
                        <button
                          onClick={() => rollbackToCheckpoint(cp.id)}
                          className="ml-2 px-2 py-1 rounded text-[10px] bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                        >
                          {t("chat.rollback")}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

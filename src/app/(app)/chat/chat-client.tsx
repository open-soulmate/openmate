'use client';
import { MarkdownContent } from "@/components/markdown-content";
import { MultiFileDiff, type FileChange } from "@/components/multi-file-diff";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, FileText, Image as ImageIcon, Info, ChevronDown, Plus, Bookmark, RotateCcw, Zap, Brain, PanelLeft, Copy, ThumbsUp, ThumbsDown, Share2, RefreshCw, MoreHorizontal, Volume2 } from "lucide-react";
import { ContextRing } from "@/components/context-ring";
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';
import { Dialog } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import { SmartPrompt } from '@/components/smart-prompt';

const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');

// Tag a session with its owning agent via OpenSoul API
// This persists server-side, works across devices/browsers
async function tagSessionAgent(sessionId: string, agentId: string): Promise<void> {
  try {
    await fetch(`${getApiUrl()}/api/sessions/${sessionId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: `agent:${agentId}` }),
    });
  } catch (e) {
    console.warn('[session-tag] Failed to tag session:', e);
  }
}

const getAcpProxyUrl = () => {
  const base = getApiUrl();
  // ACP Proxy runs on port 8092, same hostname as OpenSoul
  return base.replace(/:\d+$/, ':8092');
};
// All agents (SoulMate included) go through ACP Proxy (8092)
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
  const agents = useAppStore((s) => s.sidebarAgents) as AgentInfo[];
  const setSidebarAgents = useAppStore((s) => s.setSidebarAgents);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [smartPromptTask, setSmartPromptTask] = useState<string>('');
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
  const rightPanelOpen = useAppStore((s) => s.rightPanelOpen);
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
  const selectedAgentRef = useRef<AgentInfo | null>(null);

  // Auto-resize textarea on input
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }, []);

  useEffect(() => { autoResizeTextarea(); }, [input, autoResizeTextarea]);

  // Close checkpoints when sidebar or right panel opens on mobile (handles external triggers like bottom nav)
  useEffect(() => {
    if (isMobile && showCheckpoints && (sidebarOpen || rightPanelOpen)) {
      setShowCheckpoints(false);
    }
  }, [sidebarOpen, rightPanelOpen, isMobile, showCheckpoints]);

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

  // ── Session cumulative stats ────────────────────────────────
  const sessionStats = useMemo(() => {
    let totalIn = 0, totalOut = 0, totalCost = 0, msgCount = 0;
    for (const msg of messages) {
      if (msg.role === 'agent' && msg.tokenUsage) {
        totalIn += msg.tokenUsage.input;
        totalOut += msg.tokenUsage.output;
        totalCost += calculateCost(msg.tokenUsage);
        msgCount++;
      }
    }
    return { totalIn, totalOut, totalCost, msgCount };
  }, [messages]);

  // ── Message action handlers ──────────────────────────────────

  // Get plain text from message parts
  const getMessageText = useCallback((msg: Message): string => {
    return msg.parts.filter(p => p.type === 'text').map(p => p.text).join('\n');
  }, []);

  // Copy message text to clipboard
  const handleCopy = useCallback((msg: Message) => {
    navigator.clipboard.writeText(getMessageText(msg));
  }, [getMessageText]);

  // Read aloud using Web Speech API
  const handleReadAloud = useCallback((msg: Message) => {
    const text = getMessageText(msg);
    if (!text) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
  }, [getMessageText]);

  // Like/dislike — send feedback to backend
  const handleFeedback = useCallback(async (msg: Message, type: 'like' | 'dislike') => {
    try {
      await fetch(`${getApiUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          message_id: msg.id,
          session_id: selectedSession?.id,
          type,
          content: getMessageText(msg).slice(0, 200),
          user_id: getUserId(),
        }),
      });
    } catch (e) { console.error('Feedback error:', e); }
  }, [selectedSession, getMessageText]);

  // Share via Web Share API or copy
  const handleShare = useCallback(async (msg: Message) => {
    const text = getMessageText(msg);
    if (navigator.share) {
      try { await navigator.share({ text }); } catch { /* user cancelled */ }
    } else {
      navigator.clipboard.writeText(text);
    }
  }, [getMessageText]);

  // Regenerate — re-send the last user message before this agent message
  const handleRegenerate = useCallback((agentMsgId: string) => {
    const agentIdx = messages.findIndex(m => m.id === agentMsgId);
    if (agentIdx < 0) return;
    // Find the user message before this agent message
    let userMsg: Message | null = null;
    for (let i = agentIdx - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { userMsg = messages[i]; break; }
    }
    if (!userMsg) return;
    // Remove the agent message
    setMessages(prev => prev.filter(m => m.id !== agentMsgId));
    // Re-send via websocket
    const text = getMessageText(userMsg);
    setLoading(true);
    const wsPayload = {
      type: 'message', text,
      ...(selectedAgent && selectedAgent.id !== 'soulmate' ? { mode: 'agent_proxy' } : {}),
      session_id: selectedSession?.id,
      ...((selectedAgent && selectedAgent.id !== 'soulmate') ? { agent_id: selectedAgent.id } : {}),
    };
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(wsPayload));
    }
  }, [messages, selectedSession, selectedAgent, getMessageText]);

  // Edit user message — put text back into input
  const handleEditMessage = useCallback((msg: Message) => {
    const text = getMessageText(msg);
    // Remove the message from list
    setMessages(prev => prev.filter(m => m.id !== msg.id));
    // TODO: set the SmartPrompt content — for now just focus the input
    // The user can paste back
    navigator.clipboard.writeText(text);
  }, [getMessageText]);

  // Favorite message — save to store
  const handleFavorite = useCallback(async (msg: Message) => {
    try {
      await fetch(`${getApiUrl()}/api/knowledge/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          content: getMessageText(msg),
          content_type: 'feedback',
          title: `收藏消息 ${new Date().toLocaleString()}`,
          user_id: getUserId(),
        }),
      });
    } catch (e) { console.error('Favorite error:', e); }
  }, [getMessageText]);

  // Delete message
  const handleDeleteMessage = useCallback((msgId: string) => {
    setMessages(prev => prev.filter(m => m.id !== msgId));
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
        setSidebarAgents((prev: AgentInfo[]) => prev.map(a => ({
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
      const wsBase = getAcpWsUrl();
      ws = new WebSocket(`${wsBase}/ws/chat?token=${token}`);
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
            if (data.session_id && (!selectedSessionRef.current || !selectedSessionRef.current.id)) {
              const updated = { id: data.session_id, name: '', platform: 'hermes' } as Session;
              setSelectedSession(updated);
              selectedSessionRef.current = updated;
              // Also update store so activeSessionId is in sync
              useAppStore.getState().setActiveSession(data.session_id, null, { sessionName: '' });
              useAppStore.getState().refreshSidebar();
              // Tag session ownership for frontend grouping
              tagSessionAgent(data.session_id, selectedAgentRef.current?.id || 'soulmate');
            }
            // Only update messages if we're still in the same session
            if (data.session_id && currentSessionId && data.session_id !== currentSessionId) return;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === 'agent' && last?.source === 'streaming') {
                const content = last.parts[0]?.text || '';
                const fileChanges = parseFileChanges(content);
                const tokenUsage = data.tokenUsage || simulateTokenUsage(content);
                // Persist spending to store
                if (tokenUsage) {
                  useAppStore.getState().addSessionSpending(
                    currentSessionId || 'default',
                    { input: tokenUsage.input, output: tokenUsage.output, cost: calculateCost(tokenUsage) }
                  );
                }
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
  }, []);


  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    setShowScrollDown(false);
  }, [messages]);

  // Listen for session selection from global sidebar (via store)
  const activeSessionIdFromStore = useAppStore((s) => s.activeSessionId);
  const activeAgentIdFromStore = useAppStore((s) => s.activeAgentId);

  useEffect(() => {
    if (!activeSessionIdFromStore) {
      // New session (e.g. SoulMate +) — clear everything
      setSelectedSession(null);
      selectedSessionRef.current = null;
      setMessages([]);
      return;
    }
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

  // When store agentId changes (e.g. clicking + on a different agent in sidebar),
  // switch selectedAgent and clear session/messages for a fresh start
  useEffect(() => {
    if (!activeAgentIdFromStore || !agents.length) return;
    const agent = agents.find(a => a.id === activeAgentIdFromStore);
    if (agent && selectedAgent?.id !== activeAgentIdFromStore) {
      setSelectedAgent(agent);
      selectedAgentRef.current = agent;
      setSelectedSession(null);
      setMessages([]);
    }
  }, [activeAgentIdFromStore, agents]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true); setSmartPromptTask('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    // Add mode prefix for plan mode
    const messageText = agentMode === 'plan' ? `[PLAN MODE] ${text}` : text;

    const wsPayload = {
      type: 'message', text: messageText,
      ...(selectedAgent && selectedAgent.id !== 'soulmate' ? { mode: 'agent_proxy' } : {}),
      session_id: selectedSession?.id,
      ...((selectedAgent && selectedAgent.id !== 'soulmate') ? { agent_id: selectedAgent.id } : {}),
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
    selectedAgentRef.current = agent;
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
        useAppStore.getState().refreshSidebar(); // refresh sidebar list
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

  // Shared checkpoint list content (used by both mobile sidebar-style panel and desktop overlay)
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
              <PanelLeft className="w-4 h-4 scale-x-[-1]" />
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
                  <button key={item.label} onClick={() => setSmartPromptTask(item.desc)}
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
                    {p.type === 'file' && <button onClick={() => {
                      const store = useAppStore.getState();
                      const sessionId = selectedSession?.id || '__default__';
                      const dataUrl = p.data ? `data:${p.mime_type || 'application/octet-stream'};base64,${p.data}` : undefined;
                      const ws = store.getWorkspaceTabs(sessionId);
                      const activeTab = ws.tabs.find((t) => t.id === ws.activeTabId);
                      if (activeTab && activeTab.type === 'new-tab') {
                        store.updateWorkspaceTab(sessionId, activeTab.id, { type: 'file-preview', filePath: dataUrl, title: p.name || 'File Preview', fileMimeType: p.mime_type });
                      } else {
                        const tab = { id: `tab-${Date.now()}-fp`, type: 'file-preview' as const, title: p.name || 'File Preview', filePath: dataUrl, fileMimeType: p.mime_type, history: [] as string[], historyIndex: -1 };
                        store.addWorkspaceTab(sessionId, tab, true);
                      }
                      store.setRightPanelOpen(true);
                    }} className="flex items-center gap-2 mt-1 p-2 bg-background/50 rounded hover:bg-background/80 transition-colors cursor-pointer"><FileText className="w-4 h-4" /><span className="text-xs">{p.name || 'file'}</span></button>}
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
                {/* AI message action bar */}
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-0.5 mt-1.5 -mb-1">
                    <button onClick={() => handleCopy(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="复制">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleReadAloud(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="朗读">
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleFeedback(msg, 'like')} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-green-500 transition-colors" title="喜欢">
                      <ThumbsUp className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleFeedback(msg, 'dislike')} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-red-500 transition-colors" title="不喜欢">
                      <ThumbsDown className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleShare(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="转发">
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleRegenerate(msg.id)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="重新生成">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => saveCheckpoint(msg.id)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="保存检查点">
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                    <button className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="更多">
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-muted-foreground/40 ml-1 shrink-0">{msg.timestamp.toLocaleTimeString()}</span>
                  </div>
                )}
                {/* User message action bar */}
                {msg.role === 'user' && (
                  <div className="flex items-center gap-0.5 mt-1.5 -mb-1 justify-end">
                    <button onClick={() => handleCopy(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="复制">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleShare(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="分享">
                      <Share2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleEditMessage(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-muted-foreground transition-colors" title="修改">
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleFavorite(msg)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-yellow-500 transition-colors" title="收藏">
                      <Bookmark className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteMessage(msg.id)} className="p-1.5 rounded hover:bg-muted-foreground/10 text-muted-foreground/60 hover:text-red-500 transition-colors" title="删除">
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[10px] text-muted-foreground/40 ml-1 shrink-0">{msg.timestamp.toLocaleTimeString()}</span>
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
        <div className="px-3 lg:px-4 pt-3 pb-6 shrink-0">
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
          <div className="space-y-2">
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFile} />
            <SmartPrompt
              initialTask={smartPromptTask}
              onSend={(assembled) => {
                if ((!assembled.trim() && attachments.length === 0) || loading) return;
                const text = assembled.trim();
                const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
                setMessages(prev => [...prev, userMsg]);
                setAttachments([]); setLoading(true);
                const messageText = agentMode === 'plan' ? `[PLAN MODE] ${text}` : text;
                const wsPayload = {
                  type: 'message', text: messageText,
                  ...(selectedAgent && selectedAgent.id !== 'soulmate' ? { mode: 'agent_proxy' } : {}),
                  session_id: selectedSession?.id,
                  ...((selectedAgent && selectedAgent.id !== 'soulmate') ? { agent_id: selectedAgent.id } : {}),
                  attachments: attachments.map(a => ({ type: a.type, data: a.data, name: a.name, mime_type: a.mime_type })),
                };
                streamingSessionIdRef.current = selectedSession?.id || null;
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify(wsPayload));
                }
              }}
              isLoading={loading}
              placeholder={t("chat.inputPlaceholder", "输入任务，点 ✨ 展开字段（Enter 发送，Shift+Enter 换行）")}
              onFileClick={() => fileRef.current?.click()}
              onPaste={handlePaste}
              footer={<>
                  <button
                    onClick={() => setAgentMode(prev => prev === 'plan' ? 'act' : 'plan')}
                    title={agentMode === 'plan' ? '切换到执行模式' : '切换到计划模式'}
                    className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      agentMode === 'plan' ? 'text-blue-400 hover:bg-blue-500/10' : 'text-green-400 hover:bg-green-500/10'
                    }`}
                  >
                    {agentMode === 'plan' ? <Brain className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                    <span className="hidden lg:inline">{agentMode === 'plan' ? 'Plan' : 'Act'}</span>
                  </button>
                  <button onClick={() => setMessages([])} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="清空">
                    <RotateCcw className="w-4 h-4" />
                  </button>
                  <button onClick={() => { const next = !showCheckpoints; setShowCheckpoints(next); if (next) { setRightPanelOpen(false); if (isMobile && sidebarOpen) toggleSidebar(); } }} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors relative" title="历史">
                    <Bookmark className="w-4 h-4" />
                    {checkpoints.length > 0 && <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] rounded-full w-3.5 h-3.5 flex items-center justify-center">{checkpoints.length}</span>}
                  </button>
                  <ContextRing />
                  {/* Session cumulative stats */}
                  {sessionStats.msgCount > 0 && (
                    <span className="text-[9px] text-muted-foreground/30 whitespace-nowrap">
                      {sessionStats.msgCount}条 · ${sessionStats.totalCost.toFixed(3)}
                    </span>
                  )}
                  <button
                    onClick={() => { window.dispatchEvent(new CustomEvent('smart-prompt-send')); }}
                    disabled={loading}
                    className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80 disabled:opacity-50 transition-colors"
                    title="发送"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </button>
              </>}
            />
          </div>
        </div>
      </div>
      {/* Checkpoints Panel — Sheet on mobile, inline overlay on desktop */}
      {isMobile ? (
        <Sheet open={showCheckpoints} onOpenChange={setShowCheckpoints}>
          <SheetContent side="right" size="sm" showCloseButton={false}>
            <SheetHeader className="border-b border-border pb-3">
              <div className="flex items-center justify-between">
                <SheetTitle className="flex items-center gap-2 text-sm">
                  <RotateCcw className="w-4 h-4" />
                  {t("chat.checkpoints", "Checkpoints")}
                </SheetTitle>
                <button onClick={() => setShowCheckpoints(false)} className="p-1 rounded hover:bg-muted">
                  <X className="w-4 h-4" />
                </button>
              </div>
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

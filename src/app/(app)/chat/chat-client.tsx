'use client';
import { MarkdownContent } from "@/components/markdown-content";
import { MultiFileDiff, type FileChange } from "@/components/multi-file-diff";
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, PanelRightClose, PanelRightOpen, FileText, Image as ImageIcon, Info, ChevronDown, ChevronRight, Plus, MessageSquare, Cpu, Trash2, Search as SearchIcon } from "lucide-react";
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';

const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');

interface MessagePart { type: string; text?: string; data?: string; name?: string; mime_type?: string; url?: string; }
interface Message { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; source?: string; fileChanges?: FileChange[]; }
interface Session { id: string; name: string; platform: string; chat_id?: string; last_message?: string; unread?: number; workspace?: string; last_active?: string; }

// Agent definitions with detection
interface AgentInfo {
  id: string;
  name: string;
  icon: string; logo?: string;
  description: string;
  installed: boolean;
  path?: string;
  sessions: Session[];
  expanded: boolean;
}

const AGENT_DEFINITIONS = [
  { id: 'hermes', name: 'Hermes Agent', icon: '🏛️', description: 'Nous Research Hermes Agent', logo: 'https://avatars.githubusercontent.com/u/143723048?s=48', cmd: 'hermes' },
  { id: 'claude', name: 'Claude Code', icon: '🟣', description: 'Anthropic Claude Code', logo: 'https://avatars.githubusercontent.com/u/83906651?s=48', cmd: 'claude' },
  { id: 'codex', name: 'Codex CLI', icon: '🟢', description: 'OpenAI Codex CLI', logo: 'https://avatars.githubusercontent.com/u/14957082?s=48', cmd: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', icon: '🔵', description: 'Google Gemini CLI', logo: 'https://avatars.githubusercontent.com/u/167475704?s=48', cmd: 'gemini' },
  { id: 'mimo', name: 'MiMo Code', icon: '📱', description: '小米 MiMo Code', logo: 'https://avatars.githubusercontent.com/u/12345678?s=48', cmd: 'mimo' },
  { id: 'opencode', name: 'OpenCode', icon: '⚡', description: 'OpenCode 开源编程助手', logo: 'https://avatars.githubusercontent.com/u/12345679?s=48', cmd: 'opencode' },
  { id: 'aider', name: 'Aider', icon: '🤝', description: 'Aider AI 结对编程', logo: 'https://avatars.githubusercontent.com/u/12345680?s=48', cmd: 'aider' },
  { id: 'copilot', name: 'GitHub Copilot', icon: '🐙', description: 'GitHub Copilot', cmd: 'gh' },
  { id: 'cursor', name: 'Cursor', icon: '▶️', description: 'Cursor AI IDE', logo: 'https://avatars.githubusercontent.com/u/12345681?s=48', cmd: 'cursor' },
  { id: 'windsurf', name: 'Windsurf', icon: '🏄', description: 'Codeium Windsurf IDE', logo: 'https://avatars.githubusercontent.com/u/12345682?s=48', cmd: 'windsurf' },
  { id: 'cline', name: 'Cline', icon: '🔧', description: 'Cline VS Code AI', logo: 'https://avatars.githubusercontent.com/u/12345683?s=48', cmd: 'cline' },
  { id: 'continue', name: 'Continue', icon: '🔄', description: 'Continue 开源AI助手', logo: 'https://avatars.githubusercontent.com/u/12345684?s=48', cmd: 'continue' },
  { id: 'deepseek', name: 'DeepSeek', icon: '🐋', description: 'DeepSeek AI', logo: 'https://avatars.githubusercontent.com/u/12345685?s=48', cmd: 'deepseek' },
  { id: 'qwen', name: 'Qwen Coder', icon: '🟠', description: '通义千问编程', logo: 'https://avatars.githubusercontent.com/u/12345686?s=48', cmd: 'qwen' },
  { id: 'amazon-q', name: 'Amazon Q', icon: '☁️', description: 'Amazon Q Developer', logo: 'https://avatars.githubusercontent.com/u/12345687?s=48', cmd: 'q' },
  { id: 'ollama', name: 'Ollama', icon: '🦙', description: 'Ollama 本地大模型', logo: 'https://avatars.githubusercontent.com/u/153379978?s=48', cmd: 'ollama' },
  { id: 'wechat', name: '微信', icon: '💬', description: '企业微信/微信', cmd: '' },
  { id: 'telegram', name: 'Telegram', icon: '✈️', description: 'Telegram Bot', cmd: '' },
  { id: 'openclaw', name: 'OpenClaw', icon: '🦞', description: '开源AI Agent框架', logo: 'https://avatars.githubusercontent.com/u/12345702?s=48', cmd: 'openclaw' },
  { id: 'pi-agent', name: 'Pi Agent', icon: '🥧', description: 'Inflection AI 个人助手', logo: 'https://avatars.githubusercontent.com/u/12345703?s=48', cmd: 'pi' },
  { id: 'openai-agents', name: 'OpenAI Agents SDK', icon: '🤖', description: 'OpenAI多Agent编排SDK', logo: 'https://avatars.githubusercontent.com/u/14957082?s=48', cmd: 'agents' },
  { id: 'smolagents', name: 'SmolAgents', icon: '🤗', description: 'HuggingFace轻量Agent框架', logo: 'https://avatars.githubusercontent.com/u/22679051?s=48', cmd: 'smolagents' },
  { id: 'pydantic-ai', name: 'PydanticAI', icon: '📐', description: 'Pydantic类型安全Agent', logo: 'https://avatars.githubusercontent.com/u/12345704?s=48', cmd: 'pydantic-ai' },
  { id: 'letta', name: 'Letta', icon: '🧬', description: 'Letta(原MemGPT)长期记忆Agent', logo: 'https://avatars.githubusercontent.com/u/12345705?s=48', cmd: 'letta' },
  { id: 'browser-use', name: 'Browser Use', icon: '🌐', description: 'AI浏览器自动化Agent', logo: 'https://avatars.githubusercontent.com/u/12345706?s=48', cmd: 'browser-use' },
  { id: 'mastra', name: 'Mastra', icon: '⚡', description: 'TypeScript AI Agent框架', logo: 'https://avatars.githubusercontent.com/u/12345707?s=48', cmd: 'mastra' },
  { id: 'composio', name: 'Composio', icon: '🔌', description: 'Agent工具集成平台', logo: 'https://avatars.githubusercontent.com/u/12345708?s=48', cmd: 'composio' },
  { id: 'agentstack', name: 'AgentStack', icon: '🏗️', description: 'AI Agent快速开发框架', logo: 'https://avatars.githubusercontent.com/u/12345709?s=48', cmd: 'agentstack' },
  { id: 'phidata', name: 'Phidata', icon: '💎', description: 'Phidata多模态Agent框架', logo: 'https://avatars.githubusercontent.com/u/12345710?s=48', cmd: 'phi' },
];

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
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Detect installed agents and load sessions
  const initAgents = useCallback(async () => {
    // Detect installed agents via API
    let detected: Record<string, string> = {};
    try {
      const r = await fetch(`${getApiUrl()}/api/agents/detect`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) detected = await r.json();
    } catch {}

    // Load all sessions
    let sessions: Session[] = [];
    try {
      const r = await fetch(`${getApiUrl()}/api/hermes/sessions?limit=100`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) { const d = await r.json(); sessions = d.sessions || []; }
    } catch {}

    // Group sessions by platform/source
    const sessionMap: Record<string, Session[]> = {};
    for (const s of sessions) {
      const key = s.platform || 'hermes';
      if (!sessionMap[key]) sessionMap[key] = [];
      sessionMap[key].push(s);
    }

    // Build agent list
    const agentList: AgentInfo[] = AGENT_DEFINITIONS
      .filter(a => !!detected[a.cmd])
      .map(a => ({
        ...a,
        installed: !!detected[a.cmd],
        path: detected[a.cmd] ? detected[a.cmd] : undefined,
        sessions: sessionMap[a.id] || [],
        expanded: a.id === 'hermes',
      }));

    // Add unknown platform sessions
    for (const [key, val] of Object.entries(sessionMap)) {
      if (!agentList.find(a => a.id === key) && val.length > 0) {
        agentList.push({
          id: key, name: key, icon: '💬', description: key,
          installed: false, sessions: val, expanded: false,
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
  const deleteSession = useCallback(async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("确定删除这个会话？")) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/sessions/${sessionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) {
        // Remove from local state
        setAgents(prev => prev.map(a => ({
          ...a,
          sessions: a.sessions.filter(s => s.id !== sessionId),
        })));
        if (selectedSession?.id === sessionId) {
          setSelectedSession(null);
          setMessages([]);
        }
      }
    } catch (e) { console.error("Delete failed:", e); }
  }, [selectedSession]);

  const loadHistory = useCallback(async (sessionId: string) => {
    try {
      const r = await fetch(`${getApiUrl()}/api/hermes/sessions/${sessionId}/messages`, { headers: { Authorization: `Bearer ${getToken()}` } });
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
    const ws = new WebSocket(`${getWsUrl()}/ws/chat?token=${token}`);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'done') {
          setLoading(false);
          if (data.text) initAgents();
          // Parse file changes from the completed message
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === 'agent' && last?.source === 'streaming') {
              const content = last.parts[0]?.text || '';
              const fileChanges = parseFileChanges(content);
              return [...prev.slice(0, -1), { ...last, source: undefined, fileChanges }];
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
        else if (data.type === 'error') { setLoading(false); setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `错误: ${data.message}` }], timestamp: new Date() }]); }
      } catch {}
    };
    return () => ws.close();
  }, [initAgents]);

  useEffect(() => { initAgents(); const timer = setInterval(initAgents, 30000); return () => clearInterval(timer); }, [initAgents]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message', text, mode: 'hermes', session_id: selectedSession?.id,
        attachments: attachments.map(a => ({ type: a.type, data: a.data, name: a.name })),
      }));
      return;
    }
    try {
      const r = await fetch(`${getApiUrl()}/api/acp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text, session_id: selectedSession?.id }),
      });
      const d = await r.json();
      const content = d.content || d.error || '无响应';
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        parts: [{ type: 'text', text: content }],
        timestamp: new Date(),
        source: d.source,
        fileChanges: parseFileChanges(content),
      }]);
    } catch {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: '请求超时' }], timestamp: new Date() }]);
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

  const selectSession = (session: Session, agent: AgentInfo) => {
    setSelectedSession(session);
    setSelectedAgent(agent);
    loadHistory(session.id);
  };

  const newSession = (agent: AgentInfo) => {
    setSelectedSession({ id: '', name: `${agent.name} 新会话`, platform: agent.id });
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
          <input placeholder="搜索会话和消息内容..." value={searchQuery} onChange={(e) => handleSearch(e.target.value)} className="w-full px-3 py-1.5 rounded-lg bg-muted text-sm outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {/* Search Results */}
          {searchQuery.trim() ? (
            <div>
              {searching && <div className="p-3 text-xs text-muted-foreground">搜索中...</div>}
              {!searching && searchResults.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">未找到匹配结果</div>
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
                <button onClick={() => newSession(agent)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted transition-opacity" title={`${agent.name} 新会话`}>
                  <Plus className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>

              {/* Sessions under this agent */}
              {agent.expanded && agent.sessions.map(session => (
                <button key={session.id} onClick={() => selectSession(session, agent)}
                  className={`group w-full text-left pl-8 pr-3 py-2 hover:bg-muted/80 transition-colors ${selectedSession?.id === session.id ? 'bg-muted' : ''}`}>
                  <div className="flex items-center gap-1.5">
                    <MessageSquare className="w-3 h-3 text-muted-foreground shrink-0" />
                    <span className="text-xs truncate text-foreground flex-1">{session.name}</span>
                    <button onClick={(e) => deleteSession(session.id, e)} className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-red-500 transition-opacity ml-1 shrink-0" title="删除"><Trash2 className="w-3 h-3" /></button>
                  </div>
                  {session.last_active && <div className="text-[10px] text-muted-foreground ml-4.5 mt-0.5">{session.last_active}</div>}
                </button>
              ))}

              {/* Empty state */}
              {agent.expanded && agent.sessions.length === 0 && (
                <div className="pl-8 pr-3 py-2 text-xs text-muted-foreground italic">暂无会话</div>
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
            <span className="font-medium text-sm">{selectedSession?.name || (selectedAgent ? `${selectedAgent.name} 新会话` : '新对话')}</span>
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
              <h2 className="text-2xl font-semibold mb-8">你好，今天打算做点什么？</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                {[
                  { icon: '📝', label: '需求文档', desc: '帮我写需求文档' },
                  { icon: '🎨', label: '原型设计', desc: '设计产品原型' },
                  { icon: '📊', label: '数据分析', desc: '分析数据报表' },
                  { icon: '💻', label: '代码开发', desc: '编写和调试代码' },
                  { icon: '📋', label: '项目排期', desc: '制定项目计划' },
                  { icon: '🧪', label: '测试用例', desc: '撰写测试文档' },
                  { icon: '📄', label: '方案编写', desc: '编写技术方案' },
                  { icon: '🔍', label: '知识搜索', desc: '搜索知识库内容' },
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
                <div className="text-[10px] mt-1.5 opacity-60 flex items-center gap-1">
                  <span>{msg.timestamp.toLocaleTimeString()}</span>
                  {msg.source && <span className="px-1 py-0.5 rounded bg-black/10 text-[9px]">{msg.source}</span>}
                </div>
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
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-3 py-2 rounded-lg hover:bg-muted"><Paperclip className="w-4 h-4 text-muted-foreground" /></button>
            <input ref={fileRef} type="file" multiple className="hidden" onChange={handleFile} />
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              onPaste={handlePaste} placeholder="输入消息... (Ctrl+V粘贴截图)" rows={1}
              className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
            <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Column 4: Details Panel */}
      {showDetails && (
        <div className="hidden md:flex w-72 shrink-0 border-l border-border bg-card flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5"><Info className="w-4 h-4" />会话详情</span>
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
                <div className="text-xs text-muted-foreground">会话</div>
                <div className="text-sm font-medium">{selectedSession.name}</div>
                {selectedSession.last_active && <div className="text-xs text-muted-foreground">最后活跃: {selectedSession.last_active}</div>}
              </div>
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><Paperclip className="w-3 h-3" />附件 ({allAttachments.length})</div>
              {allAttachments.length === 0 ? <div className="text-xs text-muted-foreground italic">暂无附件</div> : (
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
              <div className="text-xs text-muted-foreground mb-2">统计</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted/50 text-center"><div className="text-lg font-bold">{imageCount}</div><div className="text-[10px] text-muted-foreground">图片</div></div>
                <div className="p-2 rounded bg-muted/50 text-center"><div className="text-lg font-bold">{fileCount}</div><div className="text-[10px] text-muted-foreground">文件</div></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

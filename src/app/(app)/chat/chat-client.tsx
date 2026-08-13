'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Paperclip, FileText, X, Camera, MessageSquare, RefreshCw, Smartphone, Wifi, WifiOff, ArrowLeft, Zap } from 'lucide-react';
import { a2aClient } from '@/lib/a2a-client';
import { AgentSelector } from '@/components/agent-selector';

import { getApiBaseUrl, getToken } from '@/lib/api-client';
const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');

interface AcpSession { sessionId: string; title: string; cwd: string; updatedAt: string; }
interface HermesSession { id: string; title: string; preview: string; last_active: string; source: string; }
interface MessagePart { type: 'text' | 'image' | 'file'; text?: string; data?: string; name?: string; }
interface ChatMessage { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; source?: string; }

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  binary: string;
}

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

type SessionItem = { id: string; title: string; subtitle: string; type: 'acp' | 'hermes'; source?: string };

// Agent visual config
const AGENT_COLORS: Record<string, string> = {
  hermes: 'text-cyan-400',
  mimo: 'text-purple-400',
  claude: 'text-orange-400',
  codex: 'text-emerald-400',
  aider: 'text-pink-400',
};

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selected, setSelected] = useState<SessionItem | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [mode, setMode] = useState<'a2a' | 'acp' | 'hermes' | 'agent_proxy'>('acp');
  const [wsConnected, setWsConnected] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentInfo | null>(null);
  const [showAgentSelector, setShowAgentSelector] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const agentMsgIdRef = useRef<string>('');

  // WebSocket connection
  const connectWs = useCallback(() => {
    const token = localStorage.getItem('openmate-token');
    if (!token) return;

    const ws = new WebSocket(`${getWsUrl()}/ws/chat?token=${token}`);

    ws.onopen = () => {
      setWsConnected(true);
      console.log('WS connected');
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'thinking') {
        const msgId = Date.now().toString();
        agentMsgIdRef.current = msgId;
        setMessages(prev => [...prev, { id: msgId, role: 'agent', parts: [{ type: 'text', text: '' }], timestamp: new Date() }]);
        setLoading(false);
      } else if (data.type === 'chunk') {
        setMessages(prev => prev.map(m =>
          m.id === agentMsgIdRef.current
            ? { ...m, parts: [{ type: 'text', text: m.parts[0]?.text + data.text }] }
            : m
        ));
      } else if (data.type === 'done') {
        setMessages(prev => prev.map(m =>
          m.id === agentMsgIdRef.current
            ? { ...m, parts: [{ type: 'text', text: data.text }], source: data.source }
            : m
        ));
        setLoading(false);
      } else if (data.type === 'error') {
        setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `错误: ${data.message}` }], timestamp: new Date() }]);
        setLoading(false);
      } else if (data.type === 'connected') {
        console.log('WS authenticated:', data.user_id);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      setTimeout(connectWs, 3000);
    };

    ws.onerror = () => {
      setWsConnected(false);
    };

    wsRef.current = ws;
  }, []);

  useEffect(() => {
    connectWs();
    return () => { wsRef.current?.close(); };
  }, [connectWs]);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const loadSessions = async () => {
    try {
      const items: SessionItem[] = [];
      try {
        const acp = await apiRequest('/api/acp/sessions');
        for (const s of acp.sessions || []) {
          items.push({ id: s.sessionId, title: s.title.slice(0, 60), subtitle: `${s.cwd} · ${new Date(s.updatedAt).toLocaleString()}`, type: 'acp' });
        }
      } catch {}
      try {
        const wx = await apiRequest('/api/hermes/list?source=weixin&limit=10');
        for (const s of wx.sessions || []) {
          items.push({ id: s.id, title: s.title.slice(0, 60), subtitle: `微信 · ${s.last_active}`, type: 'hermes', source: 'weixin' });
        }
      } catch {}
      try {
        const all = await apiRequest('/api/hermes/list?limit=10');
        for (const s of all.sessions || []) {
          if (!items.find(i => i.id === s.id)) {
            items.push({ id: s.id, title: s.title.slice(0, 60), subtitle: `${s.source} · ${s.last_active}`, type: 'hermes', source: s.source });
          }
        }
      } catch {}
      setSessions(items);
    } catch (e) { console.error('Failed to load sessions:', e); }
  };

  const handleAgentSelect = (agent: AgentInfo) => {
    setSelectedAgent(agent);
    setMode('agent_proxy');
    setShowAgentSelector(false);
    setMessages([]);
  };

  const handleBackToSelector = () => {
    setShowAgentSelector(true);
    setSelectedAgent(null);
    setMessages([]);
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() }]);
    setInput(''); setAttachments([]); setLoading(true);

    // Try WebSocket first
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message',
        text,
        mode: mode === 'agent_proxy' ? 'agent_proxy' : mode === 'hermes' ? 'hermes' : mode,
        session_id: selected?.id,
        agent_id: selectedAgent?.id,
      }));
      return;
    }

    // Fallback to HTTP
    try {
      let responseText = '';
      let source = '';

      if (mode === 'agent_proxy' && selectedAgent) {
        const result = await apiRequest('/api/agent-proxy/send', 'POST', { agent_id: selectedAgent.id, message: text });
        responseText = result.response || result.error || '（无响应）';
        source = selectedAgent.id;
      } else if (mode === 'hermes' && selected) {
        const result = await apiRequest('/api/hermes/send', 'POST', { session_id: selected.id, message: text });
        responseText = result.output || result.error || '已发送';
        source = 'hermes';
      } else if (mode === 'acp') {
        const result = await apiRequest('/api/acp/send', 'POST', { text, session_id: selected?.id });
        responseText = result.content || '（无响应）';
        source = result.source || 'acp';
      } else {
        const task = await a2aClient.chat(text);
        responseText = task.status.message?.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') || '（无响应）';
        source = 'a2a';
      }

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: responseText }], timestamp: new Date(), source }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `错误: ${(e as Error).message}` }], timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const selectSession = async (item: SessionItem) => {
    setSelected(item);
    setMode(item.type === 'acp' ? 'acp' : 'hermes');
    setShowSessions(false);
    setShowAgentSelector(false);
    setSelectedAgent(null);
    setMessages([]);

    if (item.type === 'hermes') {
      try {
        const data = await apiRequest(`/api/hermes/sessions/${item.id}/messages`);
        const history: ChatMessage[] = (data.messages || []).map((m: {role: string; content: string; timestamp: number}, i: number) => ({
          id: `hist-${i}`,
          role: m.role === 'user' ? 'user' : 'agent',
          parts: [{ type: 'text', text: m.content }],
          timestamp: new Date((m.timestamp || 0) * 1000),
        }));
        setMessages(history);
      } catch (e) {
        console.error('Failed to load history:', e);
      }
    }
  };

  const readFileAsPart = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setAttachments(prev => [...prev, file.type.startsWith('image/')
      ? { type: 'image', data: reader.result as string, name: file.name }
      : { type: 'file', data: reader.result as string, name: file.name }]);
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    const h = (e: ClipboardEvent) => { for (const item of e.clipboardData?.items || []) if (item.type.startsWith('image/')) { e.preventDefault(); const f = item.getAsFile(); if (f) readFileAsPart(f); } };
    document.addEventListener('paste', h); return () => document.removeEventListener('paste', h);
  }, []);

  // Show agent selector when no agent selected
  if (showAgentSelector && !selected) {
    return (
      <div className="flex flex-col h-full">
        <AgentSelector onSelect={handleAgentSelect} selectedAgent={selectedAgent} />
        {/* Bottom: switch to session mode */}
        <div className="px-6 py-3 border-t bg-muted/30">
          <button
            onClick={() => { setShowAgentSelector(false); setMode('hermes'); setShowSessions(true); loadSessions(); }}
            className="w-full text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-2 py-2"
          >
            <MessageSquare className="w-4 h-4" />
            或选择已有会话继续...
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-3">
        {/* Back button when agent is selected */}
        {selectedAgent && (
          <button onClick={handleBackToSelector} className="p-1 rounded hover:bg-muted transition-colors" title="返回选择Agent">
            <ArrowLeft className="w-4 h-4 text-muted-foreground" />
          </button>
        )}

        {/* Agent/session info */}
        {selectedAgent ? (
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${AGENT_COLORS[selectedAgent.id] || 'text-primary'}`} />
            <span className="text-sm font-medium">{selectedAgent.name}</span>
            <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Agent Proxy</span>
          </div>
        ) : (
          <>
            <Bot className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{selected ? selected.title : 'Hermes Agent'}</span>
            {selected?.type === 'hermes' && selected?.source === 'weixin' && <Smartphone className="w-3 h-3 text-green-400" />}
          </>
        )}

        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {wsConnected ? <><Wifi className="w-3 h-3 text-green-400" /> WS</> : <><WifiOff className="w-3 h-3 text-red-400" /> HTTP</>}
        </span>

        <div className="flex gap-1 ml-auto">
          {!selectedAgent && (
            <button onClick={() => { setMode(mode === 'a2a' ? 'acp' : mode === 'acp' ? 'hermes' : 'a2a'); setSelected(null); setMessages([]); }}
              className={`text-xs px-2 py-0.5 rounded-full transition-colors ${mode === 'hermes' ? 'bg-green-500/20 text-green-400' : mode === 'acp' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
              {mode === 'hermes' ? '🟢 Hermes' : mode === 'acp' ? '🟡 ACP' : '🔵 A2A'}
            </button>
          )}
          <button onClick={() => { setShowSessions(!showSessions); if (!showSessions) loadSessions(); }}
            className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
            <MessageSquare className="w-3 h-3 inline mr-1" />会话
          </button>
          <button onClick={() => { setShowAgentSelector(true); setSelectedAgent(null); setSelected(null); setMessages([]); }}
            className="text-xs px-2 py-0.5 rounded-full bg-secondary/50 hover:bg-secondary">
            <Bot className="w-3 h-3 inline mr-1" />切换Agent
          </button>
          <button onClick={loadSessions} className="text-xs px-2 py-0.5 rounded-full hover:bg-muted"><RefreshCw className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Session Selector */}
      {showSessions && (
        <div className="px-6 py-3 border-b bg-card max-h-80 overflow-y-auto">
          {(() => {
            const weixinSessions = sessions.filter(s => s.type === 'hermes' && s.source === 'weixin');
            const hermesSessions = sessions.filter(s => s.type === 'hermes' && s.source !== 'weixin');
            const acpSessions = sessions.filter(s => s.type === 'acp');

            const renderGroup = (label: string, icon: React.ReactNode, items: SessionItem[], accentClass: string) => {
              if (items.length === 0) return null;
              return (
                <div key={label} className="mb-3 last:mb-0">
                  <div className={`flex items-center gap-2 px-2 py-1 mb-1 ${accentClass}`}>
                    {icon}
                    <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
                    <span className="text-xs opacity-60">({items.length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {items.map(s => (
                      <button key={s.id} onClick={() => selectSession(s)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors flex items-center gap-2 ${selected?.id === s.id ? 'bg-primary/10 border border-primary/30' : ''}`}>
                        {s.type === 'acp' ? <Bot className="w-4 h-4 text-yellow-400 shrink-0" />
                          : s.source === 'weixin' ? <Smartphone className="w-4 h-4 text-green-400 shrink-0" />
                          : <MessageSquare className="w-4 h-4 text-muted-foreground shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{s.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{s.subtitle}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <>
                {renderGroup('微信会话', <Smartphone className="w-3.5 h-3.5 text-green-400" />, weixinSessions.slice(0, 8), 'text-green-400/80')}
                {renderGroup('Hermes 会话', <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />, hermesSessions.slice(0, 5), 'text-muted-foreground')}
                {renderGroup('ACP 会话', <Bot className="w-3.5 h-3.5 text-yellow-400" />, acpSessions.slice(0, 5), 'text-yellow-400/80')}
              </>
            );
          })()}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto">
            <h2 className="text-2xl font-semibold mb-8">你好，今天打算做点什么？</h2>
            <div className="w-full mb-6">
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border bg-card text-sm text-muted-foreground">
                <Bot className="w-4 h-4" />
                <span>选择一个要使用的模式</span>
                <span className="ml-auto px-2 py-0.5 rounded bg-primary/10 text-primary text-xs">{mode === 'hermes' ? 'Hermes' : mode === 'acp' ? 'ACP' : 'A2A'}</span>
              </div>
            </div>
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
                <button key={item.label} onClick={() => { setInput(item.desc); }}
                  className="flex flex-col items-center gap-2 p-4 rounded-xl border bg-card hover:bg-muted/80 hover:border-primary/30 transition-all group">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">{item.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'agent' && (
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                {selectedAgent ? (
                  <Zap className={`w-4 h-4 ${AGENT_COLORS[selectedAgent.id] || 'text-primary'}`} />
                ) : (
                  <Bot className="w-4 h-4 text-primary" />
                )}
              </div>
            )}
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {msg.parts.map((p, i) => p.type === 'text' ? <p key={i} className="text-sm whitespace-pre-wrap">{p.text}</p> : p.type === 'image' ? <img key={i} src={p.data} alt="" className="max-w-xs rounded mt-1" /> : null)}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs opacity-50">{msg.timestamp.toLocaleTimeString()}</p>
                {msg.source && <span className="text-xs opacity-30">{msg.source}</span>}
              </div>
            </div>
            {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>}
          </div>
        ))}
        {loading && <div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div><div className="bg-muted rounded-lg px-4 py-2"><Loader2 className="w-4 h-4 animate-spin" /></div></div>}
      </div>

      {/* Attachments */}
      {attachments.length > 0 && (
        <div className="px-6 py-2 border-t flex gap-2 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              {att.type === 'image' ? <img src={att.data} alt="" className="w-16 h-16 object-cover rounded border" /> : <div className="w-16 h-16 rounded border flex items-center justify-center"><FileText className="w-6 h-6 text-muted-foreground" /></div>}
              <button onClick={() => setAttachments(a => a.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t">
        <div className="flex gap-2 items-end">
          <input type="file" ref={fileInputRef} onChange={e => { for (const f of e.target.files || []) readFileAsPart(f); e.currentTarget.value = ''; }} multiple accept="image/*,.pdf,.doc,.txt,.md" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg border hover:bg-muted" title="添加附件"><Paperclip className="w-4 h-4" /></button>
          <button onClick={() => navigator.clipboard.read().then(items => { for (const item of items) for (const type of item.types) if (type.startsWith('image/')) item.getType(type).then(b => readFileAsPart(new File([b], `screenshot.png`, { type }))); }).catch(() => {})} className="p-2 rounded-lg border hover:bg-muted" title="粘贴截图"><Camera className="w-4 h-4" /></button>
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={selectedAgent ? `向 ${selectedAgent.name} 发送消息...` : selected ? `发送到 ${selected.title.slice(0, 30)}...` : '输入消息...'} className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm resize-none" rows={1} disabled={loading} />
          <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

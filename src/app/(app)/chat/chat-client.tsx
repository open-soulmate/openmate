'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Paperclip, FileText, X, Camera, MessageSquare, RefreshCw, Smartphone } from 'lucide-react';
import { a2aClient } from '@/lib/a2a-client';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

interface AcpSession { sessionId: string; title: string; cwd: string; updatedAt: string; }
interface HermesSession { id: string; title: string; preview: string; last_active: string; source: string; }
interface MessagePart { type: 'text' | 'image' | 'file'; text?: string; data?: string; name?: string; }
interface ChatMessage { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; }

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

type SessionItem = { id: string; title: string; subtitle: string; type: 'acp' | 'hermes'; source?: string };

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selected, setSelected] = useState<SessionItem | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [mode, setMode] = useState<'a2a' | 'acp' | 'hermes'>('acp');
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const loadSessions = async () => {
    try {
      const items: SessionItem[] = [];

      // Load ACP sessions
      try {
        const acp = await apiRequest('/api/acp/sessions');
        for (const s of acp.sessions || []) {
          items.push({ id: s.sessionId, title: s.title.slice(0, 60), subtitle: `${s.cwd} · ${new Date(s.updatedAt).toLocaleString()}`, type: 'acp' });
        }
      } catch {}

      // Load WeChat sessions
      try {
        const wx = await apiRequest('/api/hermes/list?source=weixin&limit=10');
        for (const s of wx.sessions || []) {
          items.push({ id: s.id, title: s.title.slice(0, 60), subtitle: `微信 · ${s.last_active}`, type: 'hermes', source: 'weixin' });
        }
      } catch {}

      // Load all platform sessions
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

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() }]);
    setInput(''); setAttachments([]); setLoading(true);

    try {
      let responseText = '';

      if (mode === 'hermes' && selected) {
        // Send to Hermes session
        const result = await apiRequest('/api/hermes/send', 'POST', { session_id: selected.id, message: text });
        responseText = result.output || result.error || '已发送';
      } else if (mode === 'acp') {
        const result = await apiRequest(`/api/acp/send`, "POST", { text, session_id: selected?.id });
        responseText = result.content || '（无响应）';
      } else {
        const task = await a2aClient.chat(text);
        responseText = task.status.message?.parts?.filter(p => p.type === 'text').map(p => p.text).join('\n') || '（无响应）';
      }

      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: responseText }], timestamp: new Date() }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `错误: ${(e as Error).message}` }], timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const selectSession = async (item: SessionItem) => {
    setSelected(item);
    setMode(item.type === 'acp' ? 'acp' : 'hermes');
    setShowSessions(false);
    setMessages([]);

    // Load history for hermes sessions
    if (item.type === 'hermes') {
      setLoading(true);
      try {
        const data = await apiRequest(`/api/hermes/sessions/${item.id}/messages`);
        const history: ChatMessage[] = (data.messages || []).map((m: { id: string; role: string; content: string; timestamp: number }) => ({
          id: m.id,
          role: m.role as 'user' | 'agent',
          parts: [{ type: 'text' as const, text: m.content }],
          timestamp: new Date(m.timestamp ? m.timestamp * 1000 : Date.now()),
        }));
        if (history.length > 0) setMessages(history);
      } catch (e) { console.error('Failed to load session history:', e); }
      setLoading(false);
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

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-3">
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">{selected ? selected.title : 'Hermes Agent'}</span>
        {selected?.type === 'hermes' && <Smartphone className="w-3 h-3 text-green-400" />}
        <div className="flex gap-1 ml-auto">
          <button onClick={() => { setMode(mode === 'a2a' ? 'acp' : mode === 'acp' ? 'hermes' : 'a2a'); setSelected(null); setMessages([]); }}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${mode === 'hermes' ? 'bg-green-500/20 text-green-400' : mode === 'acp' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {mode === 'hermes' ? '🟢 Hermes' : mode === 'acp' ? '🟡 ACP' : '🔵 A2A'}
          </button>
          <button onClick={() => { setShowSessions(!showSessions); loadSessions(); }}
            className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
            <MessageSquare className="w-3 h-3 inline mr-1" />会话
          </button>
          <button onClick={() => loadSessions()} className="text-xs px-2 py-0.5 rounded-full hover:bg-muted"><RefreshCw className="w-3 h-3" /></button>
        </div>
      </div>

      {/* Session Selector — grouped by type */}
      {showSessions && (
        <div className="px-6 py-3 border-b bg-card max-h-80 overflow-y-auto">
          {(() => {
            const acpSessions = sessions.filter(s => s.type === 'acp');
            const weixinSessions = sessions.filter(s => s.type === 'hermes' && s.source === 'weixin');
            const hermesSessions = sessions.filter(s => s.type === 'hermes' && s.source !== 'weixin');

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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">{mode === 'hermes' ? 'Hermes' : mode === 'acp' ? 'Hermes (ACP)' : 'OpenSoul (A2A)'}</p>
            <p className="text-sm mt-1">{mode === 'hermes' ? '通过Hermes Gateway · 与微信/Telegram同步' : mode === 'acp' ? '通过ACP协议连接' : '通过A2A协议通信'}</p>
            <p className="text-xs mt-2">点击"会话"选择微信对话 · Ctrl+V粘贴截图 · 拖放文件</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'agent' && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>}
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {msg.parts.map((p, i) => p.type === 'text' ? <p key={i} className="text-sm whitespace-pre-wrap">{p.text}</p> : p.type === 'image' ? <img key={i} src={p.data} alt="" className="max-w-xs rounded mt-1" /> : null)}
              <p className="text-xs mt-1 opacity-50">{msg.timestamp.toLocaleTimeString()}</p>
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
            placeholder={selected ? `发送到 ${selected.title.slice(0, 30)}...` : '输入消息...'} className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm resize-none" rows={1} disabled={loading} />
          <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

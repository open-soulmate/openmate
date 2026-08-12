'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, Paperclip, FileText, X, Camera, MessageSquare, RefreshCw } from 'lucide-react';
import { a2aClient } from '@/lib/a2a-client';

interface AcpSession { sessionId: string; title: string; cwd: string; updatedAt: string; }
interface MessagePart { type: 'text' | 'image' | 'file'; text?: string; url?: string; name?: string; data?: string; }
interface ChatMessage { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; sessionId?: string; }

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090';

async function acpRequest(path: string, method: string = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<AcpSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<AcpSession | null>(null);
  const [showSessions, setShowSessions] = useState(false);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [agentMode, setAgentMode] = useState<'a2a' | 'acp'>('acp');
  const [agentCard, setAgentCard] = useState<{ name: string; skills: { name: string; description: string }[] } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);
  useEffect(() => { a2aClient.getAgentCard().then(card => setAgentCard({ name: card.name, skills: card.skills })).catch(() => {}); }, []);

  const loadSessions = async () => {
    try {
      const data = await acpRequest('/api/acp/sessions');
      setSessions(data.sessions || []);
    } catch (e) { console.error('Failed to load sessions:', e); }
  };

  const selectSession = (session: AcpSession) => {
    setSelectedSession(session);
    setShowSessions(false);
    setMessages([]);
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;

    const text = input.trim();
    const userMsg: ChatMessage = {
      id: Date.now().toString(), role: 'user',
      parts: [{ type: 'text', text }, ...attachments],
      timestamp: new Date(), sessionId: selectedSession?.sessionId,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true);

    try {
      let result: { result?: { status?: { message?: { parts?: { type: string; text?: string }[] } } } };

      if (agentMode === 'acp') {
        // Try sending with image if there are image attachments
        const imageAttachment = attachments.find(a => a.type === 'image' && a.data);
        if (imageAttachment) {
          result = await acpRequest('/api/acp/send-image', 'POST', {
            text, image_data: imageAttachment.data, mime_type: 'image/png',
          });
        } else {
          result = await acpRequest('/api/acp/send', 'POST', {
            text, session_id: selectedSession?.sessionId,
          });
        }
      } else {
        const task = await a2aClient.chat(text);
        result = { result: { status: { message: task.status.message } } };
      }

      const agentParts: MessagePart[] = (result.result?.status?.message?.parts || [])
        .filter((p: { type: string }) => p.type === 'text')
        .map((p: { text?: string }) => ({ type: 'text' as const, text: p.text || '' }));

      setMessages(prev => [...prev, {
        id: Date.now().toString(), role: 'agent',
        parts: agentParts.length > 0 ? agentParts : [{ type: 'text', text: '（无响应）' }],
        timestamp: new Date(), sessionId: selectedSession?.sessionId,
      }]);
    } catch (e) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `错误: ${(e as Error).message}` }], timestamp: new Date() }]);
    }
    setLoading(false);
  };

  const readFileAsPart = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const part: MessagePart = file.type.startsWith('image/')
        ? { type: 'image', data: reader.result as string, name: file.name }
        : { type: 'file', data: reader.result as string, name: file.name };
      setAttachments(prev => [...prev, part]);
    };
    reader.readAsDataURL(file);
  };

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      for (const item of e.clipboardData?.items || []) {
        if (item.type.startsWith('image/')) { e.preventDefault(); const f = item.getAsFile(); if (f) readFileAsPart(f); }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-3">
        <Bot className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">
          {selectedSession ? `Hermes · ${selectedSession.title.slice(0, 40)}...` : agentCard?.name || 'Agent'}
        </span>
        <div className="flex gap-1 ml-auto">
          <button onClick={() => { setAgentMode(agentMode === 'a2a' ? 'acp' : 'a2a'); setSelectedSession(null); setMessages([]); }}
            className={`text-xs px-2 py-0.5 rounded-full transition-colors ${agentMode === 'acp' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>
            {agentMode === 'acp' ? '🟢 ACP (Hermes)' : '🔵 A2A (OpenSoul)'}
          </button>
          {agentMode === 'acp' && (
            <>
              <button onClick={() => { setShowSessions(!showSessions); loadSessions(); }}
                className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary hover:bg-primary/20">
                <MessageSquare className="w-3 h-3 inline mr-1" />选择会话
              </button>
              <button onClick={loadSessions} className="text-xs px-2 py-0.5 rounded-full hover:bg-muted">
                <RefreshCw className="w-3 h-3" />
              </button>
            </>
          )}
          {agentMode === 'a2a' && agentCard?.skills.map(s => (
            <span key={s.name} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.name}</span>
          ))}
        </div>
      </div>

      {/* Session Selector */}
      {showSessions && (
        <div className="px-6 py-3 border-b bg-card max-h-60 overflow-y-auto">
          <p className="text-xs text-muted-foreground mb-2">选择一个Hermes会话继续对话（包括微信会话）：</p>
          <div className="space-y-1">
            {sessions.map(s => (
              <button key={s.sessionId} onClick={() => selectSession(s)}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm hover:bg-muted transition-colors ${selectedSession?.sessionId === s.sessionId ? 'bg-primary/10 border border-primary/30' : ''}`}>
                <p className="font-medium truncate">{s.title.slice(0, 60)}</p>
                <p className="text-xs text-muted-foreground">{s.cwd} · {new Date(s.updatedAt).toLocaleString()}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">{agentMode === 'acp' ? 'Hermes Agent' : 'OpenSoul Agent'}</p>
            <p className="text-sm mt-1">{agentMode === 'acp' ? '通过ACP协议连接 · 与微信共享会话' : '通过A2A协议通信'}</p>
            {agentMode === 'acp' && <p className="text-xs mt-2">点击"选择会话"可接入微信对话 · 支持图片、截图</p>}
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
            placeholder={selectedSession ? `继续与 ${selectedSession.title.slice(0, 30)}... 对话` : '输入消息...'} className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm resize-none" rows={1} disabled={loading} />
          <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, PanelRightClose, PanelRightOpen, FileText, Image as ImageIcon, Info } from 'lucide-react';
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';

const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');

interface MessagePart { type: string; text?: string; data?: string; name?: string; mime_type?: string; url?: string; }
interface Message { id: string; role: 'user' | 'agent'; parts: MessagePart[]; timestamp: Date; source?: string; }
interface Session { id: string; name: string; platform: string; chat_id?: string; last_message?: string; unread?: number; }

const PLATFORM_ICONS: Record<string, string> = { wechat: '💬', weixin: '💬', telegram: '✈️', discord: '🎮', hermes: '🤖', local: '💻', acp: '⚡', web: '🌐' };
const PLATFORM_COLORS: Record<string, string> = { wechat: 'bg-green-500', weixin: 'bg-green-500', telegram: 'bg-blue-500', hermes: 'bg-purple-500', web: 'bg-gray-500' };

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selected, setSelected] = useState<Session | null>(null);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [showDetails, setShowDetails] = useState(true);
  const wsRef = useRef<WebSocket | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Group sessions
  const grouped = sessions.reduce<Record<string, Session[]>>((acc, s) => {
    const key = s.platform || 'web';
    (acc[key] = acc[key] || []).push(s);
    return acc;
  }, {});

  // Load sessions
  const loadSessions = useCallback(async () => {
    try {
      const r = await fetch(`${getApiUrl()}/api/hermes/sessions`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) { const d = await r.json(); setSessions(d.sessions || []); }
    } catch {}
  }, []);

  // Load history
  const loadHistory = useCallback(async (sessionId: string) => {
    try {
      const r = await fetch(`${getApiUrl()}/api/hermes/sessions/${sessionId}/messages`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (r.ok) {
        const d = await r.json();
        const msgs: Message[] = (d.messages || []).map((m: Record<string, unknown>) => ({
          id: m.id || Date.now().toString(), role: m.role === 'user' ? 'user' : 'agent',
          parts: typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : (m.parts || [{ type: 'text', text: m.content }]),
          timestamp: new Date((m.timestamp as string) || Date.now()), source: m.source,
        }));
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
    ws.onclose = () => { setWsConnected(false); setTimeout(() => {}, 3000); };
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'done') { setLoading(false); if (data.text) loadSessions(); }
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
  }, [loadSessions]);

  useEffect(() => { loadSessions(); }, [loadSessions]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;
    const text = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', parts: [{ type: 'text', text }, ...attachments], timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setAttachments([]); setLoading(true);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'message', text, mode: 'hermes', session_id: selected?.id,
        attachments: attachments.map(a => ({ type: a.type, data: a.data, name: a.name })),
      }));
      return;
    }
    // HTTP fallback
    try {
      const r = await fetch(`${getApiUrl()}/api/acp/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ text, session_id: selected?.id }),
      });
      const d = await r.json();
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: d.content || d.error || '无响应' }], timestamp: new Date(), source: d.source }]);
    } catch (err) {
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'agent', parts: [{ type: 'text', text: `请求超时` }], timestamp: new Date() }]);
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
        setAttachments(prev => [...prev, {
          type: isImage ? 'image' : 'file', data: base64, name: file.name, mime_type: file.type,
        }]);
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

  const selectSession = (s: Session) => {
    setSelected(s); setMessages([]);
    if (s.platform === 'hermes' || s.platform === 'web') return;
    loadHistory(s.id);
  };

  // Collect all attachments from conversation
  const allAttachments = messages.flatMap(m => m.parts.filter(p => p.type === 'image' || p.type === 'file'));
  const imageCount = allAttachments.filter(p => p.type === 'image').length;
  const fileCount = allAttachments.filter(p => p.type === 'file').length;

  return (
    <div className="flex h-full">
      {/* Column 2: Session List */}
      <div className="w-64 shrink-0 flex flex-col border-r border-border bg-card">
        <div className="p-3 border-b border-border">
          <input placeholder="搜索会话..." className="w-full px-3 py-1.5 rounded-lg bg-muted text-sm outline-none" />
        </div>
        <div className="flex-1 overflow-y-auto">
          {Object.entries(grouped).map(([platform, items]) => (
            <div key={platform}>
              <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase flex items-center gap-1.5">
                <span>{PLATFORM_ICONS[platform] || '💬'}</span>{platform}
              </div>
              {items.slice(0, 8).map(s => (
                <button key={s.id} onClick={() => selectSession(s)}
                  className={`w-full text-left px-3 py-2 hover:bg-muted/80 transition-colors ${selected?.id === s.id ? 'bg-muted' : ''}`}>
                  <div className="text-sm font-medium truncate">{s.name}</div>
                  <div className="text-xs text-muted-foreground truncate">{s.last_message || ''}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Column 3: Chat Window */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="h-12 border-b border-border flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{selected?.name || '新对话'}</span>
            {selected && <span className="text-xs text-muted-foreground">({selected.platform})</span>}
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
                    {p.type === 'text' && <span className="whitespace-pre-wrap">{p.text}</span>}
                    {p.type === 'image' && p.data && <img src={`data:${p.mime_type || 'image/png'};base64,${p.data}`} alt={p.name || 'image'} className="max-w-xs rounded-lg mt-1" />}
                    {p.type === 'file' && <div className="flex items-center gap-2 mt-1 p-2 bg-background/50 rounded"><FileText className="w-4 h-4" /><span className="text-xs">{p.name || 'file'}</span></div>}
                  </div>
                ))}
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
        <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <span className="text-sm font-medium flex items-center gap-1.5"><Info className="w-4 h-4" />会话详情</span>
            <button onClick={() => setShowDetails(false)} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-4">
            {/* Session info */}
            {selected && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">会话名称</div>
                <div className="text-sm font-medium">{selected.name}</div>
                <div className="text-xs text-muted-foreground">平台</div>
                <div className="text-sm">{PLATFORM_ICONS[selected.platform] || '💬'} {selected.platform}</div>
                <div className="text-xs text-muted-foreground">消息数</div>
                <div className="text-sm">{messages.length}</div>
              </div>
            )}

            {/* Attachments */}
            <div>
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                <Paperclip className="w-3 h-3" />附件 ({allAttachments.length})
              </div>
              {allAttachments.length === 0 ? (
                <div className="text-xs text-muted-foreground italic">暂无附件</div>
              ) : (
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

            {/* Stats */}
            <div>
              <div className="text-xs text-muted-foreground mb-2">统计</div>
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded bg-muted/50 text-center">
                  <div className="text-lg font-bold">{imageCount}</div>
                  <div className="text-[10px] text-muted-foreground">图片</div>
                </div>
                <div className="p-2 rounded bg-muted/50 text-center">
                  <div className="text-lg font-bold">{fileCount}</div>
                  <div className="text-[10px] text-muted-foreground">文件</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

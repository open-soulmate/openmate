'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Loader2, Paperclip, Image, FileText, X, Camera } from 'lucide-react';
import { a2aClient, type Task } from '@/lib/a2a-client';

interface MessagePart {
  type: 'text' | 'image' | 'file';
  text?: string;
  url?: string;
  name?: string;
  mimeType?: string;
  data?: string; // base64
}

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  parts: MessagePart[];
  timestamp: Date;
  taskId?: string;
}

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [attachments, setAttachments] = useState<MessagePart[]>([]);
  const [agentCard, setAgentCard] = useState<{ name: string; skills: { name: string; description: string }[] } | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>();
  const [dragOver, setDragOver] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    a2aClient.getAgentCard().then(card => {
      setAgentCard({ name: card.name, skills: card.skills });
    }).catch(() => {});
  }, []);

  // Handle paste (screenshots)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) readFileAsPart(file);
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, []);

  const readFileAsPart = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const part: MessagePart = file.type.startsWith('image/')
        ? { type: 'image', data: reader.result as string, name: file.name, mimeType: file.type }
        : { type: 'file', data: reader.result as string, name: file.name, mimeType: file.type };
      setAttachments(prev => [...prev, part]);
    };
    reader.readAsDataURL(file);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    for (const file of files) {
      readFileAsPart(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    for (const file of files) {
      readFileAsPart(file);
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || loading) return;

    const parts: MessagePart[] = [];
    if (input.trim()) parts.push({ type: 'text', text: input.trim() });
    parts.push(...attachments);

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      parts,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setAttachments([]);
    setLoading(true);

    try {
      // Build A2A message parts
      const a2aParts = parts.map(p => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        if (p.type === 'image') return { type: 'image', url: p.data, mimeType: p.mimeType };
        if (p.type === 'file') return { type: 'file', name: p.name, url: p.data, mimeType: p.mimeType };
        return { type: 'text', text: '' };
      });

      const task = await a2aClient.sendTask({
        role: 'user',
        parts: a2aParts,
      }, currentTaskId);

      const agentParts: MessagePart[] = (task.status.message?.parts || []).map(p => {
        if (p.type === 'text') return { type: 'text', text: p.text as string };
        if (p.type === 'image') return { type: 'image', url: p.url as string };
        return { type: 'text', text: JSON.stringify(p) };
      });

      const agentMsg: ChatMessage = {
        id: task.status.message?.messageId || Date.now().toString(),
        role: 'agent',
        parts: agentParts.length > 0 ? agentParts : [{ type: 'text', text: '（无响应）' }],
        timestamp: new Date(),
        taskId: task.id,
      };

      setMessages(prev => [...prev, agentMsg]);
      setCurrentTaskId(task.id);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'agent',
        parts: [{ type: 'text', text: `错误: ${(e as Error).message}` }],
        timestamp: new Date(),
      }]);
    }
    setLoading(false);
  };

  const renderPart = (part: MessagePart, idx: number) => {
    if (part.type === 'text') return <p key={idx} className="text-sm whitespace-pre-wrap">{part.text}</p>;
    if (part.type === 'image') return <img key={idx} src={part.data || part.url} alt={part.name} className="max-w-xs rounded-lg mt-1" />;
    if (part.type === 'file') return (
      <div key={idx} className="flex items-center gap-2 mt-1 p-2 rounded bg-background/50">
        <FileText className="w-4 h-4" />
        <span className="text-xs">{part.name}</span>
      </div>
    );
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Agent Info Bar */}
      {agentCard && (
        <div className="px-6 py-2 border-b bg-muted/30 flex items-center gap-3">
          <Bot className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{agentCard.name}</span>
          <span className="text-xs text-muted-foreground">A2A v1.0</span>
          <div className="flex gap-2 ml-auto">
            {agentCard.skills.map(s => (
              <span key={s.name} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">{s.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4" onDragOver={e => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}>
        {dragOver && (
          <div className="fixed inset-0 z-50 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center">
            <div className="bg-background rounded-xl p-8 shadow-lg text-center">
              <Paperclip className="w-12 h-12 mx-auto mb-4 text-primary" />
              <p className="text-lg font-medium">拖放文件到此处</p>
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">OpenSoul Agent</p>
            <p className="text-sm mt-1">通过A2A协议通信 · 支持图片、文件、截图</p>
            <p className="text-xs mt-2">Ctrl+V 粘贴截图 · 拖放文件 · 点击📎选择附件</p>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'agent' && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>}
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              {msg.parts.map((p, i) => renderPart(p, i))}
              <p className="text-xs mt-1 opacity-50">{msg.timestamp.toLocaleTimeString()}</p>
            </div>
            {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="w-4 h-4" /></div>}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
            <div className="bg-muted rounded-lg px-4 py-2"><Loader2 className="w-4 h-4 animate-spin" /></div>
          </div>
        )}
      </div>

      {/* Attachments Preview */}
      {attachments.length > 0 && (
        <div className="px-6 py-2 border-t flex gap-2 flex-wrap">
          {attachments.map((att, i) => (
            <div key={i} className="relative group">
              {att.type === 'image' ? (
                <img src={att.data} alt={att.name} className="w-16 h-16 object-cover rounded-lg border" />
              ) : (
                <div className="w-16 h-16 rounded-lg border flex items-center justify-center">
                  <FileText className="w-6 h-6 text-muted-foreground" />
                </div>
              )}
              <button onClick={() => removeAttachment(i)} className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
              <p className="text-xs text-center mt-0.5 truncate w-16">{att.name}</p>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 py-4 border-t">
        <div className="flex gap-2 items-end">
          <input type="file" ref={fileInputRef} onChange={handleFileSelect} multiple accept="image/*,.pdf,.doc,.docx,.txt,.md" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="p-2 rounded-lg border hover:bg-muted transition-colors" title="添加附件">
            <Paperclip className="w-4 h-4" />
          </button>
          <button onClick={() => {
            // Screenshot from clipboard
            navigator.clipboard.read().then(items => {
              for (const item of items) {
                for (const type of item.types) {
                  if (type.startsWith('image/')) {
                    item.getType(type).then(blob => {
                      const file = new File([blob], `screenshot-${Date.now()}.png`, { type });
                      readFileAsPart(file);
                    });
                  }
                }
              }
            }).catch(() => {});
          }} className="p-2 rounded-lg border hover:bg-muted transition-colors" title="粘贴截图 (Ctrl+V)">
            <Camera className="w-4 h-4" />
          </button>
          <div className="flex-1 relative">
            <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} placeholder="输入消息... (Ctrl+V粘贴截图, 拖放文件)" className="w-full px-4 py-2 rounded-lg border bg-background text-sm resize-none" rows={1} disabled={loading} />
          </div>
          <button onClick={handleSend} disabled={loading || (!input.trim() && attachments.length === 0)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

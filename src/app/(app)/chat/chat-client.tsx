'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { api } from '@/lib/api-client';

interface Message { id: string; role: 'user' | 'assistant'; content: string; timestamp: Date; }

export function ChatClient() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const res = await api.chat(input);
      const aiMsg: Message = { id: (Date.now()+1).toString(), role: 'assistant', content: res.response || res.message || JSON.stringify(res), timestamp: new Date() };
      setMessages(prev => [...prev, aiMsg]);
    } catch (e) {
      const errMsg: Message = { id: (Date.now()+1).toString(), role: 'assistant', content: `连接失败: ${(e as Error).message}，请确认OpenSoul后端已启动 (http://localhost:8090)`, timestamp: new Date() };
      setMessages(prev => [...prev, errMsg]);
    }
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">开始对话</p>
            <p className="text-sm">连接OpenSoul知识引擎，基于你的知识库进行智能对话</p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>}
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.role === 'user' && <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"><User className="w-4 h-4 text-primary-foreground" /></div>}
          </div>
        ))}
        {loading && <div className="flex gap-3"><div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Loader2 className="w-4 h-4 text-primary animate-spin" /></div><div className="bg-muted rounded-lg px-4 py-2"><p className="text-sm">思考中...</p></div></div>}
      </div>
      <div className="border-t p-4">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())} placeholder="输入消息..." className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm" disabled={loading} />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

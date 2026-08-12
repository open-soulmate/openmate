'use client';
import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2 } from 'lucide-react';
import { a2aClient, type Task, type Message } from '@/lib/a2a-client';

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  text: string;
  timestamp: Date;
  taskId?: string;
}

export function ChatClient() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [agentCard, setAgentCard] = useState<{ name: string; skills: { name: string; description: string }[] } | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    a2aClient.getAgentCard().then(card => {
      setAgentCard({ name: card.name, skills: card.skills });
    }).catch(() => {});
  }, []);

  const handleSend = async () => {
    if (!input.trim() || loading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input.trim(),
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const task = await a2aClient.chat(userMsg.text, currentTaskId);

      const agentText = task.status.message?.parts
        ?.filter(p => p.type === 'text')
        .map(p => p.text)
        .join('\n') || '（无响应）';

      const agentMsg: ChatMessage = {
        id: task.status.message?.messageId || Date.now().toString(),
        role: 'agent',
        text: agentText,
        timestamp: new Date(),
        taskId: task.id,
      };

      setMessages(prev => [...prev, agentMsg]);
      setCurrentTaskId(task.id);
    } catch (e) {
      const errorMsg: ChatMessage = {
        id: Date.now().toString(),
        role: 'agent',
        text: `错误: ${(e as Error).message}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMsg]);
    }

    setLoading(false);
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Bot className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">OpenSoul Agent</p>
            <p className="text-sm mt-1">通过A2A协议通信</p>
            {agentCard && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                {agentCard.skills.map(s => (
                  <button key={s.name} onClick={() => { setInput(s.description); }} className="p-3 rounded-lg border text-left hover:border-primary/50 transition-colors">
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground mt-1">{s.description}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'agent' && <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"><Bot className="w-4 h-4 text-primary" /></div>}
            <div className={`max-w-[70%] rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
              <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
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

      {/* Input */}
      <div className="px-6 py-4 border-t">
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()} placeholder="输入消息..." className="flex-1 px-4 py-2 rounded-lg border bg-background text-sm" disabled={loading} />
          <button onClick={handleSend} disabled={loading || !input.trim()} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"><Send className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

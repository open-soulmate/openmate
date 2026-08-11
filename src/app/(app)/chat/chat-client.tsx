"use client";

import { useState, useRef, useEffect } from "react";
import { useAppStore, type ChatMessage } from "@/stores/app-store";
import { Send, Trash2, Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

export function ChatClient() {
  const [input, setInput] = useState("");
  const messages = useAppStore((s) => s.messages);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearMessages = useAppStore((s) => s.clearMessages);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput("");

    // Mock assistant reply
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `I received your message: **"${text}"**\n\nThis is a placeholder response. Connect the Soul backend to enable real AI conversations.`,
        timestamp: Date.now(),
      };
      addMessage(reply);
    }, 600);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Bot className="mb-4 h-10 w-10 text-muted-foreground" />
            <h2 className="mb-2 text-lg font-medium">Start a conversation</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Ask anything. Your knowledge base provides context for more
              accurate answers.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Bot size={16} />
                  </div>
                )}

                <div
                  className={`max-w-[80%] rounded-lg px-4 py-2.5 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-card-foreground"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <div className="prose prose-sm prose-invert max-w-none">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {msg.role === "user" && (
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <User size={16} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="border-t border-border bg-background px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end gap-2 rounded-lg border border-border bg-muted p-2">
            <button
              onClick={clearMessages}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="Clear conversation"
            >
              <Trash2 size={16} />
            </button>

            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Type a message…"
              rows={1}
              className="max-h-32 min-h-[32px] flex-1 resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />

            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            OpenMate can make mistakes. Verify important information.
          </p>
        </div>
      </div>
    </div>
  );
}

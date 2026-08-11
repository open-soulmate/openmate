"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useAppStore, type ChatMessage } from "@/stores/app-store";
import {
  Send,
  Trash2,
  Bot,
  User,
  Plus,
  Copy,
  Check,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  ExternalLink,
  RefreshCw,
  Pencil,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Copy"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <button
      onClick={onRegenerate}
      className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Regenerate"
    >
      <RefreshCw size={12} />
    </button>
  );
}

export function ChatClient() {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const createConversation = useAppStore((s) => s.createConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearActiveConversation = useAppStore((s) => s.clearActiveConversation);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  );
  const messages = activeConversation?.messages ?? [];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    if (!activeConversationId) {
      createConversation();
    }

    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    addMessage(userMsg);
    setInput("");

    // Mock assistant reply with sources
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `I received your message: **"${text}"**\n\nThis is a placeholder response. Connect the Soul backend to enable real AI conversations.\n\nYou can ask me about your knowledge base, and I'll provide context-aware answers.`,
        timestamp: Date.now(),
        sources: [
          { title: "Project Architecture Overview", url: "#" },
          { title: "API Design Patterns", url: "#" },
        ],
      };
      addMessage(reply);
    }, 600);
  }

  function handleNewChat() {
    createConversation();
  }

  function handleClear() {
    clearActiveConversation();
  }

  function handleStartEditTitle(convId: string, currentTitle: string) {
    setEditingTitleId(convId);
    setEditTitleValue(currentTitle);
  }

  function handleSaveTitle(convId: string) {
    // Update title in store would go here - for now we just close edit mode
    setEditingTitleId(null);
  }

  function handleRegenerate() {
    if (!activeConversationId || messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Simulate regeneration
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `Regenerated response for: **"${lastUserMsg.content}"**\n\nThis is a regenerated placeholder response.`,
        timestamp: Date.now(),
        sources: [
          { title: "Updated Reference", url: "#" },
        ],
      };
      addMessage(reply);
    }, 600);
  }

  return (
    <div className="flex h-full">
      {/* Conversation history sidebar */}
      {sidebarOpen && (
        <div className="hidden w-64 shrink-0 border-r border-border bg-sidebar md:flex md:flex-col">
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Conversations
            </span>
            <button
              onClick={handleNewChat}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New conversation"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {conversations.length === 0 ? (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                No conversations yet
              </p>
            ) : (
              <div className="space-y-0.5">
                {conversations.map((conv) => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={cn(
                      "group flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition-colors",
                      conv.id === activeConversationId
                        ? "bg-sidebar-accent text-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground",
                    )}
                  >
                    <MessageSquare size={14} className="shrink-0" />
                    {editingTitleId === conv.id ? (
                      <input
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onBlur={() => handleSaveTitle(conv.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveTitle(conv.id);
                          if (e.key === "Escape") setEditingTitleId(null);
                        }}
                        className="flex-1 bg-transparent text-sm outline-none"
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : (
                      <span className="flex-1 truncate">{conv.title}</span>
                    )}
                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStartEditTitle(conv.id, conv.title);
                        }}
                        className="hidden rounded p-0.5 text-muted-foreground hover:text-foreground group-hover:block"
                        title="Rename"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteConversation(conv.id);
                        }}
                        className="hidden rounded p-0.5 text-muted-foreground hover:text-destructive group-hover:block"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:flex"
          >
            {sidebarOpen ? (
              <PanelLeftClose size={16} />
            ) : (
              <PanelLeftOpen size={16} />
            )}
          </button>
          <span className="text-xs text-muted-foreground">
            {activeConversation
              ? activeConversation.title
              : "New conversation"}
          </span>
          <button
            onClick={handleClear}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Clear conversation"
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-medium">
                How can I help you today?
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                Ask anything. Your knowledge base provides context for more
                accurate answers.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "Summarize my notes",
                  "What is OpenMate?",
                  "Explain the architecture",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3",
                    msg.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {msg.role === "assistant" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot size={16} />
                    </div>
                  )}

                  <div
                    className={cn(
                      "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-md"
                        : "bg-card text-card-foreground border border-border rounded-bl-md",
                    )}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose prose-sm max-w-none dark:prose-invert">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                    <p
                      className={cn(
                        "mt-1 text-[10px]",
                        msg.role === "user"
                          ? "text-primary-foreground/60"
                          : "text-muted-foreground",
                      )}
                    >
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>

                  {msg.role === "user" && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                      <User size={16} />
                    </div>
                  )}
                </div>
              ))}

              {/* Sources for last assistant message */}
              {messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" &&
                messages[messages.length - 1].sources &&
                messages[messages.length - 1].sources!.length > 0 && (
                  <div className="ml-11 max-w-3xl">
                    <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                      Sources
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {messages[messages.length - 1].sources!.map(
                        (src, i) => (
                          <a
                            key={i}
                            href={src.url}
                            className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                          >
                            <ExternalLink size={10} />
                            {src.title}
                          </a>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {/* Copy and regenerate button row for last assistant message */}
              {messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" && (
                  <div className="ml-11 flex items-center gap-1">
                    <CopyButton
                      text={messages[messages.length - 1].content}
                    />
                    <RegenerateButton onRegenerate={handleRegenerate} />
                  </div>
                )}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="shrink-0 border-t border-border bg-background px-4 py-3 md:pb-3 pb-18">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/50 p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Type a message..."
                rows={1}
                className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
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
    </div>
  );
}

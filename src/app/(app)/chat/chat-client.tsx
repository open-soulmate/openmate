"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore, type ChatMessage, type Conversation } from "@/stores/app-store";
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
  Pin,
  PinOff,
  Search,
  ChevronDown,
  Server,
  Globe,
  Cpu,
  BrainCircuit,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import {
  getAgentRegistry,
  type RegisteredAgent,
} from "@/lib/agent-registry";
import { getAgentDetector } from "@/lib/agent-detector";
import {
  type DetectedAgent,
  type AgentRuntimeStatus,
  AGENT_ICON_MAP,
} from "@/lib/agent-types";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return "昨天";
  }

  if (date.getFullYear() === now.getFullYear()) {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function formatTimeFull(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getLastMessagePreview(conv: Conversation): string {
  if (conv.messages.length === 0) return "暂无消息";
  const last = conv.messages[conv.messages.length - 1];
  const prefix = last.role === "user" ? "" : "[AI] ";
  const text = last.content.replace(/\n/g, " ").replace(/\*\*/g, "");
  return prefix + (text.length > 40 ? text.slice(0, 40) + "..." : text);
}

// ─── Sub Components ──────────────────────────────────────────────────────────

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
      title="复制"
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
      title="重新生成"
    >
      <RefreshCw size={12} />
    </button>
  );
}

// ─── Conversation List Item ──────────────────────────────────────────────────

function ConversationItem({
  conv,
  isActive,
  onSelect,
  onDelete,
  onTogglePin,
  onStartEdit,
  isEditing,
  editValue,
  onEditChange,
  onSaveEdit,
  onCancelEdit,
}: {
  conv: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onStartEdit: () => void;
  isEditing: boolean;
  editValue: string;
  onEditChange: (v: string) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const unread = conv.unreadCount ?? 0;
  const lastTime = conv.messages.length > 0 ? formatTime(conv.messages[conv.messages.length - 1].timestamp) : "";

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group relative flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        isActive
          ? "bg-primary/10 border border-primary/20"
          : "border border-transparent hover:bg-accent/50",
      )}
    >
      {/* Avatar */}
      <div className="relative mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
        <MessageSquare size={18} className="text-primary" />
        {conv.pinned && (
          <div className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white">
            <Pin size={8} />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          {isEditing ? (
            <input
              value={editValue}
              onChange={(e) => onEditChange(e.target.value)}
              onBlur={onSaveEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSaveEdit();
                if (e.key === "Escape") onCancelEdit();
              }}
              className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none border-b border-primary"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className={cn("flex-1 min-w-0 truncate text-sm", isActive ? "font-medium" : "font-normal")}>
              {conv.title}
            </span>
          )}
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-[10px] text-muted-foreground">{lastTime}</span>
            {unread > 0 && (
              <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-medium text-destructive-foreground">
                {unread > 99 ? "99+" : unread}
              </span>
            )}
          </div>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
            {getLastMessagePreview(conv)}
          </span>
          {/* Action buttons */}
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onTogglePin();
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title={conv.pinned ? "取消置顶" : "置顶"}
            >
              {conv.pinned ? <PinOff size={11} /> : <Pin size={11} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartEdit();
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              title="重命名"
            >
              <Pencil size={11} />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive"
              title="删除"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

// ─── Status Dot ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: AgentRuntimeStatus }) {
  const colorMap: Record<AgentRuntimeStatus, string> = {
    online: "bg-emerald-400",
    offline: "bg-slate-400",
    missing: "bg-amber-400",
    unchecked: "bg-slate-600",
  };
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        colorMap[status],
        status === "online" && "shadow-[0_0_4px_rgba(52,211,153,0.6)]",
      )}
    />
  );
}

// ─── Agent Selector Dropdown ─────────────────────────────────────────────────

type SelectorAgent =
  | { kind: "registry"; agent: RegisteredAgent }
  | { kind: "detected"; agent: DetectedAgent };

function AgentSelector({
  selectedAgent,
  onSelect,
}: {
  selectedAgent: RegisteredAgent | null;
  onSelect: (agent: RegisteredAgent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [registryAgents, setRegistryAgents] = useState<RegisteredAgent[]>([]);
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const registry = getAgentRegistry();
  const detector = getAgentDetector();

  useEffect(() => {
    setRegistryAgents(registry.getAvailableAgents());
    const unsubReg = registry.subscribe(() => {
      setRegistryAgents(registry.getAvailableAgents());
    });

    setDetectedAgents(detector.getOnline());
    const unsubDet = detector.subscribe(() => {
      setDetectedAgents(detector.getOnline());
    });

    return () => { unsubReg(); unsubDet(); };
  }, [registry, detector]);

  // Merge: registry agents take priority, detected agents fill gaps
  const registryIds = new Set(registryAgents.map((a) => a.id));
  const extraDetected = detectedAgents.filter(
    (d) => !registryIds.has(d.id) && d.status === "online",
  );

  const hasAny = registryAgents.length > 0 || extraDetected.length > 0;
  if (!hasAny) return null;

  const agentIcons: Record<string, React.ReactNode> = {
    ollama: <Cpu size={14} />,
    claude: <MessageSquare size={14} />,
    "claude-api": <MessageSquare size={14} />,
    gpt: <Globe size={14} />,
    "openai-api": <Globe size={14} />,
    mimo: <BrainCircuit size={14} />,
    "mimo-api": <BrainCircuit size={14} />,
    "open-interpreter": <Server size={14} />,
    interpreter: <Server size={14} />,
    aider: <Bot size={14} />,
    n8n: <Server size={14} />,
    hermes: <Server size={14} />,
    codex: <Bot size={14} />,
    opencode: <Bot size={14} />,
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {selectedAgent ? (
          <>
            <StatusDot status="online" />
            <span className="text-foreground">{agentIcons[selectedAgent.id] ?? <Bot size={14} />}</span>
            <span className="text-foreground">{selectedAgent.name}</span>
          </>
        ) : (
          <>
            <Bot size={14} />
            <span>选择 Agent</span>
          </>
        )}
        <ChevronDown size={12} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-card p-1 shadow-lg">
            {/* Registry agents */}
            {registryAgents.length > 0 && (
              <>
                <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  已接入 Agent
                </p>
                {registryAgents.map((agent) => (
                  <button
                    key={agent.id}
                    onClick={() => {
                      onSelect(agent);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs transition-colors",
                      selectedAgent?.id === agent.id
                        ? "bg-primary/10 text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <StatusDot status="online" />
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-muted">
                      {agentIcons[agent.id] ?? <Bot size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {agent.type === "local" ? "本地" : agent.type === "remote" ? "远程" : "工具"}
                      </div>
                    </div>
                    {selectedAgent?.id === agent.id && (
                      <Check size={14} className="text-primary" />
                    )}
                  </button>
                ))}
              </>
            )}

            {/* Extra detected agents */}
            {extraDetected.length > 0 && (
              <>
                {registryAgents.length > 0 && (
                  <div className="mx-2 my-1 border-t border-border" />
                )}
                <p className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  自动检测
                </p>
                {extraDetected.map((agent) => (
                  <div
                    key={agent.id}
                    className="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-xs text-muted-foreground"
                  >
                    <StatusDot status={agent.status} />
                    <span className="flex h-6 w-6 items-center justify-center rounded bg-muted">
                      {(() => {
                        const IconComp = agent.icon;
                        return <IconComp size={14} />;
                      })()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{agent.name}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {agent.category === "local" ? "本地" : "远程"} · 自动检测
                      </div>
                    </div>
                    <span className="text-[9px] text-emerald-400">可用</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ChatClient() {
  const [input, setInput] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editTitleValue, setEditTitleValue] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<RegisteredAgent | null>(null);

  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const createConversation = useAppStore((s) => s.createConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearActiveConversation = useAppStore((s) => s.clearActiveConversation);
  const updateConversationTitle = useAppStore((s) => s.updateConversationTitle);
  const togglePinConversation = useAppStore((s) => s.togglePinConversation);

  // Auto-select default agent on mount
  useEffect(() => {
    const registry = getAgentRegistry();
    const defaultAgent = registry.getDefaultChatAgent();
    if (defaultAgent) {
      setSelectedAgent(defaultAgent);
    }
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

  // Sort conversations: pinned first, then by updatedAt
  const sortedConversations = useMemo(() => {
    const filtered = searchQuery
      ? conversations.filter(
          (c) =>
            c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            c.messages.some((m) => m.content.toLowerCase().includes(searchQuery.toLowerCase())),
        )
      : conversations;

    return [...filtered].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return b.updatedAt - a.updatedAt;
    });
  }, [conversations, searchQuery]);

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }, []);

  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  // Handle conversation switch - clear unread
  function handleSelectConversation(id: string) {
    setActiveConversation(id);
    // Clear unread count
    const conv = useAppStore.getState().conversations.find((c) => c.id === id);
    if (conv && (conv.unreadCount ?? 0) > 0) {
      useAppStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, unreadCount: 0 } : c,
        ),
      }));
    }
  }

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
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Mock assistant reply with sources
    const agentLabel = selectedAgent ? selectedAgent.name : "AI";
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `收到你的消息：**"${text}"**\n\n这是来自 **${agentLabel}** 的模拟回复。连接真实后端后，将启用 AI 对话能力。\n\n你可以向我提问关于你的知识库的问题，我会基于上下文给出回答。`,
        timestamp: Date.now(),
        sources: [
          { title: "项目架构概览", url: "#" },
          { title: "API 设计模式", url: "#" },
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
    if (editTitleValue.trim()) {
      updateConversationTitle(convId, editTitleValue.trim());
    }
    setEditingTitleId(null);
  }

  function handleDeleteConversation(id: string) {
    setDeleteTarget(id);
  }

  function confirmDelete() {
    if (deleteTarget) {
      deleteConversation(deleteTarget);
      setDeleteTarget(null);
    }
  }

  function handleRegenerate() {
    if (!activeConversationId || messages.length === 0) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    const agentLabel = selectedAgent ? selectedAgent.name : "AI";
    setTimeout(() => {
      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: `重新生成回复：**"${lastUserMsg.content}"**\n\n这是来自 **${agentLabel}** 重新生成的模拟回复。`,
        timestamp: Date.now(),
        sources: [{ title: "更新的参考", url: "#" }],
      };
      addMessage(reply);
    }, 600);
  }

  return (
    <div className="flex h-full">
      {/* ─── Conversation List Sidebar ──────────────────────────────── */}
      {sidebarOpen && (
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
          {/* Sidebar header */}
          <div className="flex items-center justify-between border-b border-border px-3 py-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              对话列表
            </span>
            <button
              onClick={handleNewChat}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="新建对话"
            >
              <Plus size={16} />
            </button>
          </div>

          {/* Search */}
          <div className="px-3 py-2">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索对话..."
                className="w-full rounded-md border border-border bg-muted/50 py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary transition-colors"
              />
            </div>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto px-2 py-1">
            {sortedConversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MessageSquare size={24} className="mb-2 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">
                  {searchQuery ? "未找到匹配的对话" : "暂无对话"}
                </p>
                {!searchQuery && (
                  <button
                    onClick={handleNewChat}
                    className="mt-2 text-xs text-primary hover:underline"
                  >
                    新建对话
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-0.5">
                {sortedConversations.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conv={conv}
                    isActive={conv.id === activeConversationId}
                    onSelect={() => handleSelectConversation(conv.id)}
                    onDelete={() => handleDeleteConversation(conv.id)}
                    onTogglePin={() => togglePinConversation(conv.id)}
                    onStartEdit={() => handleStartEditTitle(conv.id, conv.title)}
                    isEditing={editingTitleId === conv.id}
                    editValue={editTitleValue}
                    onEditChange={setEditTitleValue}
                    onSaveEdit={() => handleSaveTitle(conv.id)}
                    onCancelEdit={() => setEditingTitleId(null)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Main Chat Area ────────────────────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <span className="text-sm font-medium">
              {activeConversation ? activeConversation.title : "新对话"}
            </span>
            {activeConversation && (
              <span className="text-[10px] text-muted-foreground">
                {messages.length} 条消息
              </span>
            )}
            <div className="ml-2">
              <AgentSelector
                selectedAgent={selectedAgent}
                onSelect={setSelectedAgent}
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeConversation && (
              <>
                <button
                  onClick={() => togglePinConversation(activeConversation.id)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title={activeConversation.pinned ? "取消置顶" : "置顶"}
                >
                  {activeConversation.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <button
                  onClick={handleClear}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  title="清空对话"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Bot className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-medium">有什么可以帮你的？</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                随意提问。你的知识库将提供上下文，帮助生成更准确的回答。
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {["总结我的笔记", "OpenMate 是什么？", "解释一下架构"].map((q) => (
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
                      {formatTimeFull(msg.timestamp)}
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
                      参考来源
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {messages[messages.length - 1].sources!.map((src, i) => (
                        <a
                          key={i}
                          href={src.url}
                          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                        >
                          <ExternalLink size={10} />
                          {src.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}

              {/* Copy and regenerate buttons for last assistant message */}
              {messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" && (
                  <div className="ml-11 flex items-center gap-1">
                    <CopyButton text={messages[messages.length - 1].content} />
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
                placeholder="输入消息... (Enter 发送，Shift+Enter 换行)"
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
              OpenMate 可能会犯错，请核实重要信息。
            </p>
          </div>
        </div>
      </div>

      {/* ─── Workspace Sidebar ─────────────────────────────────────── */}
      <WorkspaceSidebar
        messageCount={messages.length}
        activeAgentName={selectedAgent?.name}
        activeAgentStatus="online"
      />

      {/* ─── Delete Confirmation Dialog ─────────────────────────────── */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-80 rounded-xl border border-border bg-card p-5 shadow-xl">
            <h3 className="text-sm font-medium">删除对话</h3>
            <p className="mt-2 text-xs text-muted-foreground">
              确定要删除这个对话吗？此操作不可撤销。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

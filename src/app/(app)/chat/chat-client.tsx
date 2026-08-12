"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useAppStore, type ChatMessage, type Conversation, type ToolCall, type FilePreview } from "@/stores/app-store";
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
  ChevronRight,
  Server,
  Globe,
  Cpu,
  BrainCircuit,
  Wrench,
  FileCode,
  CheckCircle2,
  XCircle,
  Loader2,
  Terminal,
  Paperclip,
  AtSign,
  Slash,
  Image as ImageIcon,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { cn } from "@/lib/utils";
import {
  getAgentRegistry,
  type RegisteredAgent,
} from "@/lib/agent-registry";
import { getAgentDetector } from "@/lib/agent-detector";
import {
  type DetectedAgent,
  type AgentRuntimeStatus,
} from "@/lib/agent-types";
import { WorkspaceSidebar } from "@/components/workspace-sidebar";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(timestamp: number) {
  const date = new Date(timestamp);
  const now = new Date();
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

// ─── Slash Commands ──────────────────────────────────────────────────────────

const SLASH_COMMANDS = [
  { command: "/clear", description: "清空当前对话" },
  { command: "/model", description: "切换模型" },
  { command: "/agent", description: "切换 Agent" },
  { command: "/export", description: "导出对话" },
  { command: "/help", description: "查看帮助" },
];

// ─── Sub Components ──────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] transition-colors",
        copied
          ? "bg-emerald-500/10 text-emerald-400"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      title="复制"
    >
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {label ?? (copied ? "已复制" : "复制")}
    </button>
  );
}

function RegenerateButton({ onRegenerate }: { onRegenerate: () => void }) {
  return (
    <button
      onClick={onRegenerate}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="重新生成"
    >
      <RefreshCw size={11} />
      重新生成
    </button>
  );
}

function EditButton({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      onClick={onEdit}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="编辑"
    >
      <Pencil size={11} />
      编辑
    </button>
  );
}

// ─── Code Block with Syntax Highlighting ─────────────────────────────────────

function CodeBlock({ className, children }: { className?: string; children: React.ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";
  const code = String(children).replace(/\n$/, "");

  if (!match) {
    return (
      <code className="rounded bg-muted/80 px-1.5 py-0.5 text-[13px] font-mono text-foreground">
        {children}
      </code>
    );
  }

  return (
    <div className="group/code relative my-2 rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-mono text-muted-foreground">{language}</span>
        <CopyButton text={code} label="复制代码" />
      </div>
      <SyntaxHighlighter
        style={oneDark}
        language={language}
        PreTag="div"
        customStyle={{
          margin: 0,
          padding: "0.75rem 1rem",
          background: "transparent",
          fontSize: "13px",
          lineHeight: "1.6",
        }}
        codeTagProps={{
          style: {
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

// ─── Markdown Renderer ──────────────────────────────────────────────────────

const markdownComponents: Components = {
  code({ className, children, ...props }) {
    const isInline = !className;
    if (isInline) {
      return (
        <code className="rounded bg-muted/80 px-1.5 py-0.5 text-[13px] font-mono text-foreground" {...props}>
          {children}
        </code>
      );
    }
    return <CodeBlock className={className}>{children}</CodeBlock>;
  },
  pre({ children }) {
    return <>{children}</>;
  },
  table({ children }) {
    return (
      <div className="my-2 overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return <thead className="bg-muted/50">{children}</thead>;
  },
  th({ children }) {
    return <th className="border-b border-border px-3 py-2 text-left text-xs font-medium">{children}</th>;
  },
  td({ children }) {
    return <td className="border-b border-border px-3 py-2 text-sm">{children}</td>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary underline underline-offset-2 hover:text-primary/80"
      >
        {children}
      </a>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-2 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground">
        {children}
      </blockquote>
    );
  },
  ul({ children }) {
    return <ul className="my-1 list-disc pl-5 space-y-0.5">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-1 list-decimal pl-5 space-y-0.5">{children}</ol>;
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-3 text-lg font-semibold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-1.5 mt-2.5 text-base font-semibold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>;
  },
  hr() {
    return <hr className="my-3 border-border" />;
  },
  p({ children }) {
    return <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>;
  },
};

// ─── Tool Call Card ──────────────────────────────────────────────────────────

function ToolCallCard({ call }: { call: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 size={14} className="animate-spin text-blue-400" />,
    success: <CheckCircle2 size={14} className="text-emerald-400" />,
    error: <XCircle size={14} className="text-red-400" />,
  }[call.status];

  const statusBorder = {
    running: "border-blue-500/30",
    success: "border-emerald-500/30",
    error: "border-red-500/30",
  }[call.status];

  const statusBg = {
    running: "bg-blue-500/5",
    success: "bg-emerald-500/5",
    error: "bg-red-500/5",
  }[call.status];

  return (
    <div className={cn("my-2 rounded-lg border transition-colors", statusBorder, statusBg)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
        />
        <Wrench size={13} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-medium">{call.name}</span>
        {statusIcon}
      </button>

      {expanded && (
        <div className="border-t border-border/50 px-3 py-2 space-y-2">
          {/* Args */}
          {Object.keys(call.args).length > 0 && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">参数</p>
              <pre className="rounded bg-muted/50 p-2 text-[11px] font-mono overflow-x-auto">
                {JSON.stringify(call.args, null, 2)}
              </pre>
            </div>
          )}
          {/* Result */}
          {call.result !== undefined && (
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">结果</p>
              <pre className={cn(
                "rounded p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap",
                call.status === "error" ? "bg-red-500/10 text-red-300" : "bg-muted/50",
              )}>
                {call.result}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── File Preview Card ───────────────────────────────────────────────────────

function FilePreviewCard({ file }: { file: FilePreview }) {
  const [expanded, setExpanded] = useState(false);
  const previewLines = file.content.split("\n").slice(0, 8).join("\n");
  const hasMore = file.lineCount > 8;

  return (
    <div className="my-2 rounded-lg border border-border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-muted/30 px-3 py-2 text-left"
      >
        <FileCode size={14} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 text-xs font-mono font-medium truncate">{file.path}</span>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {file.lineCount} 行 · {file.language}
        </span>
        <CopyButton text={file.content} label="复制" />
        <ChevronRight
          size={12}
          className={cn("shrink-0 text-muted-foreground transition-transform", expanded && "rotate-90")}
        />
      </button>
      <div className="border-t border-border">
        <SyntaxHighlighter
          style={oneDark}
          language={file.language}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: "0.5rem 0.75rem",
            background: "transparent",
            fontSize: "12px",
            lineHeight: "1.5",
            maxHeight: expanded ? "none" : "200px",
            overflow: expanded ? "auto" : "hidden",
          }}
        >
          {expanded ? file.content : previewLines}
        </SyntaxHighlighter>
        {hasMore && !expanded && (
          <div className="border-t border-border bg-muted/20 px-3 py-1 text-center">
            <span className="text-[10px] text-muted-foreground">
              还有 {file.lineCount - 8} 行，点击展开查看全部
            </span>
          </div>
        )}
      </div>
    </div>
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

// ─── Message Bubble ─────────────────────────────────────────────────────────

function MessageBubble({
  msg,
  onCopy,
  onRegenerate,
  onEdit,
}: {
  msg: ChatMessage;
  onCopy: () => void;
  onRegenerate?: () => void;
  onEdit?: () => void;
}) {
  const isUser = msg.role === "user";
  const isSystem = msg.role === "system";

  if (isSystem) {
    return (
      <div className="flex justify-center py-2">
        <div className="rounded-full bg-muted/50 px-3 py-1">
          <p className="text-[11px] text-muted-foreground">{msg.content}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Bot size={16} />
        </div>
      )}

      <div className={cn("max-w-[80%] space-y-1", isUser ? "items-end" : "items-start")}>
        {/* Message content */}
        <div
          className={cn(
            "rounded-2xl px-4 py-2.5 text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card text-card-foreground border border-border rounded-bl-md",
          )}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{msg.content}</p>
          ) : (
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <ReactMarkdown components={markdownComponents}>{msg.content}</ReactMarkdown>
            </div>
          )}
        </div>

        {/* Tool calls */}
        {!isUser && msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="space-y-1">
            {msg.toolCalls.map((call) => (
              <ToolCallCard key={call.id} call={call} />
            ))}
          </div>
        )}

        {/* File previews */}
        {!isUser && msg.filePreviews && msg.filePreviews.length > 0 && (
          <div className="space-y-1">
            {msg.filePreviews.map((file, i) => (
              <FilePreviewCard key={i} file={file} />
            ))}
          </div>
        )}

        {/* Sources */}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              参考来源
            </p>
            <div className="flex flex-wrap gap-1.5">
              {msg.sources.map((src, i) => (
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

        {/* Footer: time + actions */}
        <div
          className={cn(
            "flex items-center gap-1",
            isUser ? "justify-end" : "justify-start",
          )}
        >
          <span className="text-[10px] text-muted-foreground">
            {formatTimeFull(msg.timestamp)}
          </span>
          <span className="text-muted-foreground/30">·</span>
          <CopyButton text={msg.content} />
          {!isUser && onRegenerate && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <RegenerateButton onRegenerate={onRegenerate} />
            </>
          )}
          {isUser && onEdit && (
            <>
              <span className="text-muted-foreground/30">·</span>
              <EditButton onEdit={onEdit} />
            </>
          )}
        </div>
      </div>

      {isUser && (
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User size={16} />
        </div>
      )}
    </div>
  );
}

// ─── Slash Command Menu ──────────────────────────────────────────────────────

function SlashCommandMenu({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (command: string) => void;
}) {
  const filtered = SLASH_COMMANDS.filter((c) =>
    c.command.toLowerCase().includes(query.toLowerCase()),
  );

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 mb-1 w-56 rounded-lg border border-border bg-card p-1 shadow-lg">
      <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        命令
      </p>
      {filtered.map((cmd) => (
        <button
          key={cmd.command}
          onClick={() => onSelect(cmd.command)}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent"
        >
          <Terminal size={12} className="shrink-0 text-muted-foreground" />
          <span className="font-mono font-medium">{cmd.command}</span>
          <span className="flex-1 text-muted-foreground">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Drag & Drop Overlay ─────────────────────────────────────────────────────

function DragDropOverlay() {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary/5">
      <div className="flex flex-col items-center gap-2">
        <Paperclip size={24} className="text-primary" />
        <p className="text-sm font-medium text-primary">拖放文件到此处上传</p>
      </div>
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
  const [isDragging, setIsDragging] = useState(false);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
  const [editMsgValue, setEditMsgValue] = useState("");

  const conversations = useAppStore((s) => s.conversations);
  const activeConversationId = useAppStore((s) => s.activeConversationId);
  const setActiveConversation = useAppStore((s) => s.setActiveConversation);
  const createConversation = useAppStore((s) => s.createConversation);
  const deleteConversation = useAppStore((s) => s.deleteConversation);
  const addMessage = useAppStore((s) => s.addMessage);
  const clearActiveConversation = useAppStore((s) => s.clearActiveConversation);
  const updateConversationTitle = useAppStore((s) => s.updateConversationTitle);
  const togglePinConversation = useAppStore((s) => s.togglePinConversation);

  useEffect(() => {
    const registry = getAgentRegistry();
    const defaultAgent = registry.getDefaultChatAgent();
    if (defaultAgent) {
      setSelectedAgent(defaultAgent);
    }
  }, []);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragCounterRef = useRef(0);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const messages = activeConversation?.messages ?? [];

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

  // Slash command detection
  useEffect(() => {
    if (input.startsWith("/")) {
      setShowSlashMenu(true);
      setSlashQuery(input);
    } else {
      setShowSlashMenu(false);
      setSlashQuery("");
    }
  }, [input]);

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounterRef.current = 0;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const fileNames = files.map((f) => f.name).join(", ");
      setInput((prev) => prev + (prev ? "\n" : "") + `[附件: ${fileNames}]`);
    }
  }, []);

  function handleSelectConversation(id: string) {
    setActiveConversation(id);
    const conv = useAppStore.getState().conversations.find((c) => c.id === id);
    if (conv && (conv.unreadCount ?? 0) > 0) {
      useAppStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === id ? { ...c, unreadCount: 0 } : c,
        ),
      }));
    }
  }

  function handleSlashCommand(command: string) {
    setInput("");
    setShowSlashMenu(false);

    switch (command) {
      case "/clear":
        handleClear();
        break;
      case "/help":
        const helpMsg: ChatMessage = {
          id: uid(),
          role: "system",
          content: "可用命令: /clear (清空对话) · /model (切换模型) · /agent (切换Agent) · /export (导出对话) · /help (帮助)",
          timestamp: Date.now(),
        };
        addMessage(helpMsg);
        break;
      default:
        const sysMsg: ChatMessage = {
          id: uid(),
          role: "system",
          content: `命令 ${command} 暂未实现`,
          timestamp: Date.now(),
        };
        addMessage(sysMsg);
    }
  }

  function handleSend() {
    const text = input.trim();
    if (!text) return;

    // Handle slash commands
    if (text.startsWith("/")) {
      handleSlashCommand(text);
      return;
    }

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
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }

    // Mock assistant reply with tool calls
    const agentLabel = selectedAgent ? selectedAgent.name : "AI";
    setTimeout(() => {
      const hasToolCall = text.toLowerCase().includes("运行") || text.toLowerCase().includes("执行") || text.toLowerCase().includes("命令");
      const hasFileRead = text.toLowerCase().includes("读取") || text.toLowerCase().includes("查看") || text.toLowerCase().includes("文件");

      const toolCalls: ToolCall[] | undefined = hasToolCall
        ? [
            {
              id: uid(),
              name: "terminal",
              args: { command: text.includes("npm") ? "npm install" : "echo 'Hello'" },
              result: "执行完成，退出码 0",
              status: "success",
            },
          ]
        : undefined;

      const filePreviews: FilePreview[] | undefined = hasFileRead
        ? [
            {
              path: "src/index.ts",
              language: "typescript",
              content: 'import { createApp } from "./app";\n\nconst app = createApp();\napp.listen(3000, () => {\n  console.log("Server running");\n});',
              lineCount: 6,
            },
          ]
        : undefined;

      const reply: ChatMessage = {
        id: uid(),
        role: "assistant",
        content: hasToolCall
          ? "已执行命令。\n\n```bash\necho 'Hello'\n```\n\n执行完成，退出码 0。"
          : hasFileRead
            ? '这是文件 `src/index.ts` 的内容：'
            : '收到你的消息：**"' + text + '"**\n\n这是来自 **' + agentLabel + '** 的模拟回复。连接真实后端后，将启用 AI 对话能力。\n\n你可以向我提问关于你的知识库的问题，我会基于上下文给出回答。',
        timestamp: Date.now(),
        sources: hasToolCall || hasFileRead
          ? undefined
          : [
              { title: "项目架构概览", url: "#" },
              { title: "API 设计模式", url: "#" },
            ],
        toolCalls,
        filePreviews,
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
        content: '重新生成回复：**"' + lastUserMsg.content + '"**\n\n这是来自 **' + agentLabel + '** 重新生成的模拟回复。',
        timestamp: Date.now(),
        sources: [{ title: "更新的参考", url: "#" }],
      };
      addMessage(reply);
    }, 600);
  }

  function handleEditMessage(msgId: string, currentContent: string) {
    setEditingMsgId(msgId);
    setEditMsgValue(currentContent);
    setInput(currentContent);
    textareaRef.current?.focus();
  }

  function handleSaveEdit() {
    if (editingMsgId && editMsgValue.trim()) {
      // Update the message in store
      useAppStore.setState((s) => ({
        conversations: s.conversations.map((c) =>
          c.id === activeConversationId
            ? {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === editingMsgId ? { ...m, content: editMsgValue.trim() } : m,
                ),
              }
            : c,
        ),
      }));
    }
    setEditingMsgId(null);
    setEditMsgValue("");
    setInput("");
  }

  return (
    <div className="flex h-full">
      {/* ─── Conversation List Sidebar ──────────────────────────────── */}
      {sidebarOpen && (
        <div className="flex w-72 shrink-0 flex-col border-r border-border bg-sidebar">
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
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  onCopy={() => navigator.clipboard.writeText(msg.content)}
                  onRegenerate={
                    msg.role === "assistant" && msg.id === messages[messages.length - 1].id
                      ? handleRegenerate
                      : undefined
                  }
                  onEdit={
                    msg.role === "user" ? () => handleEditMessage(msg.id, msg.content) : undefined
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Input bar */}
        <div
          className="relative shrink-0 border-t border-border bg-background px-4 py-3 md:pb-3 pb-18"
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
        >
          {isDragging && <DragDropOverlay />}

          <div className="mx-auto max-w-3xl">
            <div className="relative">
              {/* Slash command menu */}
              {showSlashMenu && (
                <SlashCommandMenu
                  query={slashQuery}
                  onSelect={handleSlashCommand}
                />
              )}

              <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/50 p-2">
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title="附件"
                  onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.multiple = true;
                    input.onchange = () => {
                      const files = Array.from(input.files ?? []);
                      if (files.length > 0) {
                        const fileNames = files.map((f) => f.name).join(", ");
                        setInput((prev) => prev + (prev ? "\n" : "") + "[附件: " + fileNames + "]");
                      }
                    };
                    input.click();
                  }}
                >
                  <Paperclip size={16} />
                </button>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (editingMsgId) {
                        handleSaveEdit();
                      } else {
                        handleSend();
                      }
                    }
                    if (e.key === "Escape" && editingMsgId) {
                      setEditingMsgId(null);
                      setEditMsgValue("");
                      setInput("");
                    }
                  }}
                  placeholder={
                    editingMsgId
                      ? "编辑消息... (Enter 保存，Esc 取消)"
                      : "输入消息... (/ 唤出命令，Enter 发送，Shift+Enter 换行)"
                  }
                  rows={1}
                  className="max-h-40 min-h-[36px] flex-1 resize-none bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
                />

                <button
                  onClick={editingMsgId ? handleSaveEdit : handleSend}
                  disabled={!input.trim()}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
                  title="发送 (Enter)"
                >
                  <Send size={16} />
                </button>
              </div>
            </div>

            <div className="mt-2 flex items-center justify-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">Enter</kbd>
                发送
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">Shift+Enter</kbd>
                换行
              </span>
              <span className="flex items-center gap-1">
                <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-mono">/</kbd>
                命令
              </span>
            </div>
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

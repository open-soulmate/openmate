"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Bot,
  BarChart3,
  PanelRightClose,
  PanelRightOpen,
  MessageSquare,
  Hash,
  Clock,
  Zap,
} from "lucide-react";

interface WorkspaceSidebarProps {
  messageCount: number;
  activeAgentName?: string;
  activeAgentStatus?: "online" | "offline" | "error";
}

interface KnowledgeRef {
  id: string;
  title: string;
  type: "document" | "note" | "link";
}

const mockKnowledgeRefs: KnowledgeRef[] = [
  { id: "k1", title: "项目架构概览", type: "document" },
  { id: "k2", title: "API 设计模式", type: "note" },
  { id: "k3", title: "技术选型对比", type: "link" },
];

export function WorkspaceSidebar({
  messageCount,
  activeAgentName,
  activeAgentStatus = "online",
}: WorkspaceSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l border-border bg-sidebar py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="展开工作区"
        >
          <PanelRightOpen size={16} />
        </button>
        <div className="mt-4 space-y-3">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title="知识引用"
          >
            <BookOpen size={14} />
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title="Agent 状态"
          >
            <Bot size={14} />
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title="对话统计"
          >
            <BarChart3 size={14} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-64 shrink-0 flex-col border-l border-border bg-sidebar">
      {/* Header */}
      <div className="flex h-11 shrink-0 items-center justify-between border-b border-border px-3">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          工作区
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelRightClose size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Knowledge References */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">知识引用</h3>
          </div>
          <div className="space-y-1.5">
            {mockKnowledgeRefs.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-2 transition-colors hover:border-primary/30"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                  {ref.type === "document" ? (
                    <BookOpen size={12} />
                  ) : ref.type === "note" ? (
                    <MessageSquare size={12} />
                  ) : (
                    <Hash size={12} />
                  )}
                </div>
                <span className="truncate text-xs text-foreground">
                  {ref.title}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Agent Status */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Bot size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">Agent 状态</h3>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {activeAgentName ?? "未选择 Agent"}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      activeAgentStatus === "online"
                        ? "bg-emerald-400"
                        : activeAgentStatus === "error"
                          ? "bg-destructive"
                          : "bg-muted-foreground",
                    )}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {activeAgentStatus === "online"
                      ? "在线"
                      : activeAgentStatus === "error"
                        ? "异常"
                        : "离线"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Conversation Stats */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">对话统计</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={<MessageSquare size={14} />}
              label="消息数"
              value={String(messageCount)}
            />
            <StatCard
              icon={<Hash size={14} />}
              label="Token 数"
              value={messageCount > 0 ? `~${messageCount * 120}` : "0"}
            />
            <StatCard
              icon={<Clock size={14} />}
              label="耗时"
              value={messageCount > 0 ? `${messageCount * 0.6}s` : "0s"}
            />
            <StatCard
              icon={<Zap size={14} />}
              label="引用数"
              value={String(mockKnowledgeRefs.length)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-2.5">
      <div className="mb-1 flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[10px]">{label}</span>
      </div>
      <p className="text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

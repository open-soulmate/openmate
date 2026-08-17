"use client";

import React, { useState, useRef, useEffect, useCallback, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useAppStore,
  type AgentGroup,
  type GroupChatMessage,
  type AgentNode,
} from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
import { useTranslation } from "react-i18next";
  Send,
  ArrowLeft,
  Users,
  Crown,
  Bot,
  Server,
  Plug,
  Play,
  Hand,
  Zap,
  AtSign,
  X,
  Settings,
  MessageSquare,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  soma: Server,
  ai: Bot,
  mcp: Plug,
};

const AGENT_COLORS: Record<string, string> = {
  soma: "text-emerald-400",
  ai: "text-violet-400",
  mcp: "text-amber-400",
};

const AGENT_BG_COLORS: Record<string, string> = {
  soma: "bg-emerald-500/10",
  ai: "bg-violet-500/10",
  mcp: "bg-amber-500/10",
};

const AGENT_BORDER_COLORS: Record<string, string> = {
  soma: "border-emerald-500/30",
  ai: "border-violet-500/30",
  mcp: "border-amber-500/30",
};

// ─── Mock agent response generator ──────────────────────────────────────────

function generateAgentResponse(agent: AgentNode, userMessage: string): string {
  const responses: Record<string, string[]> = {
    soma: [
      `已从数据源采集相关信息。关于"${userMessage.slice(0, 20)}"，采集到 3 条相关数据记录。`,
      {t('groups.ta1887')}
    ],
    ai: [
      `{t("group-chat.text2")} ${agent.name}，我分析了您的问题。"${userMessage.slice(0, 20)}" 这个话题很有趣，以下是我的见解：这需要从多个角度来考虑。`,
      {t('groups.t772fb')}
    ],
    mcp: [
      `{t("group-chat.text4")} ${agent.tools?.length ?? 0} {t("group-chat.done")}。`,
      {t('groups.tf3975')}
    ],
  };
  const pool = responses[agent.type] ?? responses.ai;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Member List Sidebar ─────────────────────────────────────────────────────

function MemberList({
  group,
  agents,
  meetingActive,
}: {
  group: AgentGroup;
  agents: AgentNode[];
  meetingActive: boolean;
}) {
  const master = agents.find((a) => a.id === group.masterAgentId);
  const members = group.memberAgentIds
    .map((id) => agents.find((a) => a.id === id))
    .filter(Boolean) as AgentNode[];

  return (
    <div className="flex w-56 shrink-0 flex-col border-r border-border bg-sidebar">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center gap-2">
          <Users size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {t('groups.tc5828')}
          </span>
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {members.length} {t("group-chat.text5")} · {members.filter((m) => m.status === "online").length} {t("group-chat.online")}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {/* Master agent */}
        {master && (
          <div className="mb-2">
            <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              {t('groups.t32782')}
            </p>
            <MemberItem agent={master} isMaster meetingActive={meetingActive} />
          </div>
        )}

        {/* Other members */}
        <div>
          <p className="mb-1 px-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {t('groups.tab5de')}
          </p>
          {members
            .filter((m) => m.id !== group.masterAgentId)
            .map((agent) => (
              <MemberItem key={agent.id} agent={agent} meetingActive={meetingActive} />
            ))}
        </div>
      </div>

      {/* Group info */}
      <div className="border-t border-border px-3 py-2">
        <p className="text-[10px] text-muted-foreground">
          {t("group-chat.text6")}: {group.dispatchMode === "auto" ? t("group-chat.auto") : t("group-chat.manual")}
        </p>
      </div>
    </div>
  );
}

function MemberItem({
  agent,
  isMaster,
  meetingActive,
}: {
  agent: AgentNode;
  isMaster?: boolean;
  meetingActive?: boolean;
}) {
  const Icon = AGENT_ICONS[agent.type] ?? Bot;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        "hover:bg-sidebar-accent",
        meetingActive && isMaster && "bg-primary/5",
      )}
    >
      <div className={cn(
        "relative flex h-8 w-8 items-center justify-center rounded-full border",
        AGENT_BORDER_COLORS[agent.type],
        AGENT_BG_COLORS[agent.type],
      )}>
        <Icon size={14} className={AGENT_COLORS[agent.type]} />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-sidebar",
            agent.status === "online" ? "bg-emerald-400" : agent.status === "error" ? "bg-destructive" : "bg-muted-foreground/40",
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="truncate text-xs font-medium">{agent.name}</span>
          {isMaster && <Crown size={10} className="shrink-0 text-amber-400" />}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {agent.status === "online" ? t("group-chat.online") : agent.status === "error" ? t("group-chat.error") : t("group-chat.offline")}
        </span>
      </div>
    </div>
  );
}

// ─── Chat Message Bubble ─────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: GroupChatMessage }) {
  if (msg.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[70%] rounded-2xl bg-primary px-4 py-2.5 text-primary-foreground rounded-br-md">
          <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
          <p className="mt-1 text-[10px] text-primary-foreground/60">
            {formatTime(msg.timestamp)}
          </p>
        </div>
      </div>
    );
  }

  const Icon = AGENT_ICONS[msg.agentType ?? "ai"] ?? Bot;
  const color = AGENT_COLORS[msg.agentType ?? "ai"];
  const bgColor = AGENT_BG_COLORS[msg.agentType ?? "ai"];
  const borderColor = AGENT_BORDER_COLORS[msg.agentType ?? "ai"];

  return (
    <div className="flex items-start gap-3">
      <div className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border",
        borderColor,
        bgColor,
      )}>
        <Icon size={14} className={color} />
      </div>
      <div className="max-w-[70%]">
        <div className="flex items-center gap-2 mb-1">
          <span className={cn("text-xs font-medium", color)}>
            {msg.agentName ?? "Agent"}
          </span>
          <span className="text-[10px] text-muted-foreground">
            {formatTime(msg.timestamp)}
          </span>
        </div>
        <div className="rounded-2xl rounded-bl-md border border-border bg-card px-4 py-2.5">
          <p className="whitespace-pre-wrap text-sm text-card-foreground">
            {msg.content}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GroupChatClient({
  const { t } = useTranslation(); groupIdPromise }: { groupIdPromise: Promise<{ id: string }> }) {
  const { id: groupId } = use(groupIdPromise);
  const router = useRouter();

  const groups = useAppStore((s) => s.groups);
  const agents = useAppStore((s) => s.agentNodes);
  const groupMessages = useAppStore((s) => s.groupMessages);
  const addGroupMessage = useAppStore((s) => s.addGroupMessage);
  const clearGroupMessages = useAppStore((s) => s.clearGroupMessages);

  const group = groups.find((g) => g.id === groupId);
  const messages = groupMessages[groupId] ?? [];

  const [input, setInput] = useState("");
  const [meetingActive, setMeetingActive] = useState(false);
  const [meetingIndex, setMeetingIndex] = useState(0);
  const [mentionSuggestions, setMentionSuggestions] = useState<AgentNode[]>([]);
  const [showMentions, setShowMentions] = useState(false);
  const [selectedMention, setSelectedMention] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Auto-grow textarea
  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }, []);

  useEffect(() => {
    autoGrow();
  }, [input, autoGrow]);

  // Detect @mention
  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);

    // Check for @ trigger
    const atMatch = val.match(/@(\S*)$/);
    if (atMatch && group) {
      const query = atMatch[1].toLowerCase();
      const memberAgents = group.memberAgentIds
        .map((id) => agents.find((a) => a.id === id))
        .filter(Boolean) as AgentNode[];
      const filtered = memberAgents.filter((a) =>
        a.name.toLowerCase().includes(query),
      );
      setMentionSuggestions(filtered);
      setShowMentions(filtered.length > 0);
    } else {
      setShowMentions(false);
    }
  }

  function insertMention(agent: AgentNode) {
    setInput((prev) => prev.replace(/@\S*$/, `@${agent.name} `));
    setSelectedMention(agent.id);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  // Send message
  function handleSend() {
    const text = input.trim();
    if (!text || !group) return;

    const now = Date.now();

    // Add user message
    const userMsg: GroupChatMessage = {
      id: uid(),
      role: "user",
      content: text,
      timestamp: now,
    };
    addGroupMessage(groupId, userMsg);
    setInput("");
    setSelectedMention(null);

    // Determine which agent(s) should respond
    const mentionMatch = text.match(/@(\S+)/);
    let targetAgentIds: string[] = [];

    if (mentionMatch) {
      // Direct @mention to specific agent
      const mentionName = mentionMatch[1];
      const target = group.memberAgentIds
        .map((id) => agents.find((a) => a.id === id))
        .find((a) => a && a.name.toLowerCase() === mentionName.toLowerCase());
      if (target) {
        targetAgentIds = [target.id];
      }
    }

    if (targetAgentIds.length === 0) {
      if (group.dispatchMode === "auto") {
        // Auto dispatch: master agent analyzes and assigns
        const master = agents.find((a) => a.id === group.masterAgentId);
        if (master) {
          // Master agent responds first, then assigns to others
          setTimeout(() => {
            const masterMsg: GroupChatMessage = {
              id: uid(),
              role: "agent",
              {t('groups.te8ced')}
              agentId: master.id,
              agentName: master.name,
              agentType: master.type,
              timestamp: Date.now(),
            };
            addGroupMessage(groupId, masterMsg);

            // Then other agents respond
            const otherMembers = group.memberAgentIds
              .filter((id) => id !== group.masterAgentId)
              .map((id) => agents.find((a) => a.id === id))
              .filter(Boolean) as AgentNode[];

            otherMembers.forEach((agent, i) => {
              setTimeout(() => {
                const agentMsg: GroupChatMessage = {
                  id: uid(),
                  role: "agent",
                  content: generateAgentResponse(agent, text),
                  agentId: agent.id,
                  agentName: agent.name,
                  agentType: agent.type,
                  timestamp: Date.now(),
                };
                addGroupMessage(groupId, agentMsg);

                // Master summarizes after all responded
                if (i === otherMembers.length - 1) {
                  setTimeout(() => {
                    const summaryMsg: GroupChatMessage = {
                      id: uid(),
                      role: "agent",
                      {t('groups.tbb6a3')}
                      agentId: master.id,
                      agentName: master.name,
                      agentType: master.type,
                      timestamp: Date.now(),
                    };
                    addGroupMessage(groupId, summaryMsg);
                  }, 800);
                }
              }, 600 * (i + 1));
            });
          }, 400);
        }
      } else {
        // Manual dispatch: just respond with master
        const master = agents.find((a) => a.id === group.masterAgentId);
        if (master) {
          setTimeout(() => {
            const msg: GroupChatMessage = {
              id: uid(),
              role: "agent",
              {t('groups.t73cf2')}
              agentId: master.id,
              agentName: master.name,
              agentType: master.type,
              timestamp: Date.now(),
            };
            addGroupMessage(groupId, msg);
          }, 400);
        }
      }
    } else {
      // Direct mention: only mentioned agent responds
      targetAgentIds.forEach((agentId, i) => {
        const agent = agents.find((a) => a.id === agentId);
        if (!agent) return;
        setTimeout(() => {
          const msg: GroupChatMessage = {
            id: uid(),
            role: "agent",
            content: generateAgentResponse(agent, text),
            agentId: agent.id,
            agentName: agent.name,
            agentType: agent.type,
            timestamp: Date.now(),
          };
          addGroupMessage(groupId, msg);
        }, 500 * (i + 1));
      });
    }
  }

  // Meeting mode: each agent speaks in turn
  function startMeeting() {
    if (!group) return;
    setMeetingActive(true);
    setMeetingIndex(0);

    const master = agents.find((a) => a.id === group.masterAgentId);
    const members = group.memberAgentIds
      .map((id) => agents.find((a) => a.id === id))
      .filter(Boolean) as AgentNode[];

    // Master opens the meeting
    if (master) {
      const openMsg: GroupChatMessage = {
        id: uid(),
        role: "agent",
        {t('groups.t45b13')}
        agentId: master.id,
        agentName: master.name,
        agentType: master.type,
        timestamp: Date.now(),
      };
      addGroupMessage(groupId, openMsg);
    }

    // Each member speaks
    const otherMembers = members.filter((m) => m.id !== group.masterAgentId);
    otherMembers.forEach((agent, i) => {
      setTimeout(() => {
        const topics = [
          t("group-chat.text7"),
          t("group-chat.current"),
          t("group-chat.user"),
          t("group-chat.text8"),
          t("group-chat.text9"),
        ];
        const msg: GroupChatMessage = {
          id: uid(),
          role: "agent",
          content: topics[i % topics.length],
          agentId: agent.id,
          agentName: agent.name,
          agentType: agent.type,
          timestamp: Date.now(),
        };
        addGroupMessage(groupId, msg);
        setMeetingIndex(i + 1);

        // Master closes after last speaker
        if (i === otherMembers.length - 1 && master) {
          setTimeout(() => {
            const closeMsg: GroupChatMessage = {
              id: uid(),
              role: "agent",
              {t('groups.tf7d21')}
              agentId: master.id,
              agentName: master.name,
              agentType: master.type,
              timestamp: Date.now(),
            };
            addGroupMessage(groupId, closeMsg);
            setMeetingActive(false);
          }, 1000);
        }
      }, 1200 * (i + 1));
    });
  }

  // Group not found
  if (!group) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
          <Users className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-sm font-medium">{t("group-chat.text10")}</h3>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('groups.t79cf6')}
        </p>
        <Link
          href="/groups"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <ArrowLeft size={14} />
          {t('groups.t791f3')}
        </Link>
      </div>
    );
  }

  const master = agents.find((a) => a.id === group.masterAgentId);

  return (
    <div className="flex h-full">
      {/* Member sidebar */}
      <MemberList group={group} agents={agents} meetingActive={meetingActive} />

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-3">
            <Link
              href="/groups"
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h2 className="text-sm font-medium">{group.name}</h2>
              <p className="text-[11px] text-muted-foreground">
                {group.memberAgentIds.length} {t("group-chat.text5")} · {group.dispatchMode === "auto" ? t("group-chat.auto") : t("group-chat.manual")}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startMeeting}
              disabled={meetingActive}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                meetingActive
                  ? "bg-amber-500/20 text-amber-400 cursor-not-allowed"
                  : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20",
              )}
            >
              <Play size={12} />
              {meetingActive ? t("group-chat.text11") : t("group-chat.text12")}
            </button>
            <button
              onClick={() => clearGroupMessages(groupId)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title={t("group-chat.message")}
            >
              <MessageSquare size={14} />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Users className="h-7 w-7 text-primary" />
              </div>
              <h2 className="mb-2 text-lg font-medium">
                {group.name}
              </h2>
              <p className="max-w-sm text-sm text-muted-foreground mb-4">
                {group.description || t("group-chat.start")}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                <button
                  onClick={() => setInput(t("group-chat.status"))}
                  className="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                >
                  {t('groups.t1ae18')}
                </button>
                <button
                  onClick={startMeeting}
                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-500/20"
                >
                  <Play size={12} className="inline mr-1" />
                  {t('groups.td67a7')}
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-5">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} />
              ))}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="shrink-0 border-t border-border bg-background px-4 py-3">
          <div className="mx-auto max-w-3xl">
            {/* Mention suggestions */}
            {showMentions && (
              <div className="mb-2 rounded-lg border border-border bg-card shadow-lg overflow-hidden">
                {mentionSuggestions.map((agent) => {
                  const Icon = AGENT_ICONS[agent.type] ?? Bot;
                  return (
                    <button
                      key={agent.id}
                      onClick={() => insertMention(agent)}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                    >
                      <Icon size={14} className={AGENT_COLORS[agent.type]} />
                      <span className="font-medium">{agent.name}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {agent.type} · {agent.status === "online" ? t("group-chat.online") : t("group-chat.offline")}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-end gap-2 rounded-2xl border border-border bg-muted/50 p-2">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={t("group-chat.text13")}
                rows={1}
                className="max-h-30 min-h-[36px] flex-1 resize-none bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />

              <button
                onClick={handleSend}
                disabled={!input.trim() || meetingActive}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
              >
                <Send size={16} />
              </button>
            </div>

            {/* Status bar */}
            <div className="mt-2 flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {meetingActive ? (
                  <span className="text-amber-400">
                    <Play size={10} className="inline mr-1" />
                    {t('groups.t73f81')}
                  </span>
                ) : (
                  <span>
                    {t("group-chat.text14")}: {master?.name ?? t("group-chat.settings")} · {t("group-chat.text15")} @Agent{t("group-chat.name")}
                  </span>
                )}
              </p>
              {selectedMention && (
                <button
                  onClick={() => {
                    setSelectedMention(null);
                    setInput((prev) => prev.replace(/@\S+\s?/, ""));
                  }}
                  className="flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  <X size={10} />
                  {t('groups.t78f51')}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

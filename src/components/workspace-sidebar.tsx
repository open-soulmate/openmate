"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
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
  RefreshCw,
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

interface VitalStats {
  cpu_percent?: number;
  memory_percent?: number;
  disk_percent?: number;
  uptime_seconds?: number;
}

export function WorkspaceSidebar({
  messageCount,
  activeAgentName,
  activeAgentStatus = "online",
}: WorkspaceSidebarProps) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);
  const [knowledgeRefs, setKnowledgeRefs] = useState<KnowledgeRef[]>([]);
  const [vitalStats, setVitalStats] = useState<VitalStats | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const apiBase = getApiBaseUrl();

  const fetchKnowledge = useCallback(async () => {
    if (!apiBase) return;
    try {
      const userId = localStorage.getItem("openmate-user-id") || "default";
      const res = await fetch(`${apiBase}/api/knowledge/?user_id=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        const items = (Array.isArray(data) ? data : data.knowledge_bases || data.items || []).slice(0, 5).map((k: any) => ({
          id: k.id || k.kb_id,
          title: k.name || k.title || t("workspace.unnamed"),
          type: "document" as const,
        }));
        setKnowledgeRefs(items);
      }
    } catch {}
  }, [apiBase, t]);

  const fetchVital = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/vital/metrics`);
      if (res.ok) {
        const text = await res.text();
        const parse = (name: string) => {
          const match = text.match(new RegExp(`${name}\\s+([\\d.]+)`));
          return match ? parseFloat(match[1]) : undefined;
        };
        setVitalStats({
          cpu_percent: parse("vital_cpu_percent"),
          memory_percent: parse("vital_memory_percent"),
          disk_percent: parse("vital_disk_percent"),
        });
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchKnowledge();
    fetchVital();
    setTokenCount(messageCount * 120);
  }, [fetchKnowledge, fetchVital, messageCount]);

  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-l border-border bg-sidebar py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t("workspace.expand")}
        >
          <PanelRightOpen size={16} />
        </button>
        <div className="mt-4 space-y-3">
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title={t("workspace.knowledgeRefs")}
          >
            <BookOpen size={14} />
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title={t("workspace.agentStatus")}
          >
            <Bot size={14} />
          </div>
          <div
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground cursor-pointer"
            title={t("workspace.chatStats")}
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
          {t("nav.workspace")}
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { fetchKnowledge(); fetchVital(); }}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("workspace.refresh")}
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <PanelRightClose size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Knowledge References */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <BookOpen size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">{t("workspace.knowledgeRefs")}</h3>
          </div>
          <div className="space-y-1.5">
            {knowledgeRefs.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1">{t("workspace.noKnowledge")}</p>
            ) : (
              knowledgeRefs.map((ref) => (
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
              ))
            )}
          </div>
        </section>

        {/* Agent Status */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Bot size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">{t("workspace.agentStatus")}</h3>
          </div>
          <div className="rounded-md border border-border bg-card p-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-foreground truncate">
                  {activeAgentName ?? t("workspace.noAgent")}
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
                      ? t("workspace.online")
                      : activeAgentStatus === "error"
                        ? t("system.error")
                        : t("workspace.offline")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* System Vitals */}
        {vitalStats && (vitalStats.cpu_percent !== undefined || vitalStats.memory_percent !== undefined) && (
          <section>
            <div className="mb-2 flex items-center gap-2">
              <Zap size={14} className="text-muted-foreground" />
              <h3 className="text-xs font-medium text-foreground">{t("workspace.systemStatus")}</h3>
            </div>
            <div className="space-y-2">
              {vitalStats.cpu_percent !== undefined && (
                <VitalBar label={t("workspace.cpu")} value={vitalStats.cpu_percent} />
              )}
              {vitalStats.memory_percent !== undefined && (
                <VitalBar label={t("workspace.memory")} value={vitalStats.memory_percent} />
              )}
              {vitalStats.disk_percent !== undefined && (
                <VitalBar label={t("workspace.disk")} value={vitalStats.disk_percent} />
              )}
            </div>
          </section>
        )}

        {/* Conversation Stats */}
        <section>
          <div className="mb-2 flex items-center gap-2">
            <BarChart3 size={14} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground">{t("workspace.chatStats")}</h3>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <StatCard
              icon={<MessageSquare size={14} />}
              label={t("workspace.messages")}
              value={String(messageCount)}
            />
            <StatCard
              icon={<Hash size={14} />}
              label={t("workspace.tokens")}
              value={tokenCount > 0 ? `~${tokenCount}` : "0"}
            />
            <StatCard
              icon={<Clock size={14} />}
              label={t("workspace.duration")}
              value={messageCount > 0 ? `${messageCount * 0.6}s` : "0s"}
            />
            <StatCard
              icon={<BookOpen size={14} />}
              label={t("workspace.knowledgeBase")}
              value={String(knowledgeRefs.length)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function VitalBar({ label, value }: { label: string; value: number }) {
  const color = value > 80 ? "bg-red-500" : value > 50 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-medium">{value.toFixed(1)}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${Math.min(value, 100)}%` }} />
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

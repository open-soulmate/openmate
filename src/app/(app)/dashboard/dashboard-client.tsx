"use client";

import { useAppStore } from "@/stores/app-store";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import {
  Server, Puzzle, MessageSquare, Clock, Users, Workflow,
  BookOpen, Network, TrendingUp, Activity, ArrowRight,
  DollarSign, Cpu, Zap,
  Droplets, Eye, Shield, Bone, Dna, Volume2, Layers, Link2,
  Brain, Bolt, Heart, Home, MousePointer, Mic, ImageIcon, Smile,
  CheckCircle, XCircle, Loader2,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import Link from "next/link";

interface UsageSummary {
  total_tokens: number;
  budget_limit: number | null;
  remaining_budget: number | null;
  call_count: number;
  by_model: Record<string, number>;
  by_user: Record<string, number>;
  by_provider: Record<string, number>;
}

interface RecentRecord {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  user_id: string | null;
  timestamp: number;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  enabled: boolean;
  last_run: string | null;
  next_run: string | null;
}

export function DashboardClient() {
  const apiBase = getApiBaseUrl();
  const [organHealth, setOrganHealth] = useState<Record<string, "ok" | "error" | "loading">>({});
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronCount, setCronCount] = useState(0);

  const organs = [
    { key: "soul", label: "🧠 Soul", endpoint: "/api/health" },
    { key: "cortex", label: "🧩 Cortex", endpoint: "/api/cortex/health" },
    { key: "nerve", label: "⚡ Nerve", endpoint: "/api/nerve/health" },
    { key: "vein", label: "🩸 Vein", endpoint: "/api/vein/health" },
    { key: "soma", label: "🤖 Soma", endpoint: "/api/health" },
    { key: "sense", label: "👁 Sense", endpoint: "/api/sense/health" },
    { key: "will", label: "✨ Will", endpoint: "/api/will/health" },
    { key: "mate", label: "👤 Mate", endpoint: "/api/health" },
    { key: "immune", label: "🛡 Immune", endpoint: "/api/immune/health" },
    { key: "vital", label: "📊 Vital", endpoint: "/api/vital/health" },
    { key: "marrow", label: "🦴 Marrow", endpoint: "/api/marrow/health" },
    { key: "gland", label: "🧪 Gland", endpoint: "/api/gland/health" },
    { key: "gene", label: "🧬 Gene", endpoint: "/api/gene/health" },
    { key: "echo", label: "🔊 Echo", endpoint: "/api/echo/health" },
    { key: "mirror", label: "🪞 Mirror", endpoint: "/api/mirror/health" },
    { key: "link", label: "🔗 Link", endpoint: "/api/link/health" },
    { key: "hippo", label: "🧠 Hippo", endpoint: "/api/hippo/health" },
    { key: "reflex", label: "⚡ Reflex", endpoint: "/api/reflex/health" },
    { key: "heredity", label: "🔗 Heredity", endpoint: "/api/heredity/health" },
    { key: "nest", label: "🏠 Nest", endpoint: "/api/nest/health" },
    { key: "pulse", label: "💓 Pulse", endpoint: "/api/pulse/health" },
    { key: "limb", label: "💪 Limb", endpoint: "/api/limb/health" },
    { key: "voice", label: "🎤 Voice", endpoint: "/api/voice/health" },
    { key: "vision", label: "🎨 Vision", endpoint: "/api/vision/health" },
    { key: "mind", label: "💭 Mind", endpoint: "/api/mind/health" },
  ];

  const checkOrganHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/health/all`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        setOrganHealth(data.organs || {});
      } else {
        // Fallback: mark all as error
        const fallback: Record<string, "error"> = {};
        organs.forEach((o) => (fallback[o.key] = "error"));
        setOrganHealth(fallback);
      }
    } catch {
      const fallback: Record<string, "error"> = {};
      organs.forEach((o) => (fallback[o.key] = "error"));
      setOrganHealth(fallback);
    }
  }, [apiBase]);

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gland/usage`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setUsageSummary(data);
      }
    } catch (e) {
      console.error("Failed to fetch usage", e);
    }
  }, [apiBase]);

  const fetchRecentUsage = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gland/usage/recent?limit=20`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        setRecentRecords(data.records || []);
      }
    } catch (e) {
      console.error("Failed to fetch recent usage", e);
    }
  }, [apiBase]);

  const fetchCronJobs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/cron/jobs`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = await res.json();
        const jobs = data.jobs || data || [];
        setCronJobs(Array.isArray(jobs) ? jobs : []);
        setCronCount(Array.isArray(jobs) ? jobs.length : 0);
      }
    } catch (e) {
      console.error("Failed to fetch cron jobs", e);
    }
  }, [apiBase]);

  useEffect(() => {
    checkOrganHealth();
    fetchUsage();
    fetchRecentUsage();
    fetchCronJobs();
  }, [checkOrganHealth, fetchUsage, fetchRecentUsage, fetchCronJobs]);

  const { t } = useTranslation();
  const agentNodes = useAppStore((s) => s.agentNodes);
  const skills = useAppStore((s) => s.skills);
  const conversations = useAppStore((s) => s.conversations);
  const groups = useAppStore((s) => s.groups);
  const teams = useAppStore((s) => s.teams);
  const knowledgeItems = useAppStore((s) => s.knowledgeItems);
  const workspaces = useAppStore((s) => s.workspaces);

  const onlineAgents = agentNodes.filter((a) => a.status === "online").length;
  const enabledSkills = skills.filter((s) => s.enabled).length;
  const totalMessages = conversations.reduce((acc, c) => acc + c.messages.length, 0);

  const stats = [
    {
      label: t("dashboard.agents") || "Agent 数量",
      value: agentNodes.length,
      sub: `${onlineAgents} ${t("dashboard.online") || "在线"}`,
      icon: Server,
      href: "/agents",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: t("dashboard.skills") || "技能数量",
      value: skills.length,
      sub: `${enabledSkills} ${t("dashboard.enabled") || "已启用"}`,
      icon: Puzzle,
      href: "/skills",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: t("dashboard.conversations") || "会话数量",
      value: conversations.length,
      sub: `${totalMessages} ${t("dashboard.messages") || "条消息"}`,
      icon: MessageSquare,
      href: "/chat",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: t("dashboard.cronJobs") || "定时任务",
      value: cronCount,
      sub: t("dashboard.managed") || "由 Cron 管理",
      icon: Clock,
      href: "/cron",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  // Compute cost stats from real usage data
  // Estimate cost: ~$0.01 per 1K tokens (rough average across models)
  const totalTokens = usageSummary?.total_tokens ?? 0;
  const callCount = usageSummary?.call_count ?? 0;
  const estimatedCost = totalTokens * 0.00001; // $0.01 per 1K tokens

  // Build model breakdown from by_model
  const modelBreakdown = Object.entries(usageSummary?.by_model || {}).map(([model, tokens]) => ({
    model,
    tokens,
    cost: tokens * 0.00001,
  })).sort((a, b) => b.tokens - a.tokens);

  // Compute today's usage from recent records
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime() / 1000;
  const todayTokens = recentRecords
    .filter((r) => r.timestamp >= todayTs)
    .reduce((sum, r) => sum + r.total_tokens, 0);
  const todayCost = todayTokens * 0.00001;

  // Input/output tokens from recent records
  const inputTokens = recentRecords.reduce((sum, r) => sum + r.prompt_tokens, 0);
  const outputTokens = recentRecords.reduce((sum, r) => sum + r.completion_tokens, 0);

  const costStats = {
    totalTokens,
    inputTokens,
    outputTokens,
    estimatedCost,
    todayCost,
    modelBreakdown,
  };

  const quickLinks = [
    { label: t("nav.knowledge") || "知识库", icon: BookOpen, href: "/knowledge", count: knowledgeItems.length },
    { label: t("nav.groups") || "Agent 分组", icon: Users, href: "/groups", count: groups.length },
    { label: t("nav.team") || "团队", icon: Users, href: "/team", count: teams.length },
    { label: t("nav.graph") || "知识图谱", icon: Network, href: "/graph", count: 0 },
    { label: t("nav.workflow") || "工作流", icon: Workflow, href: "/workflow", count: 0 },
    { label: t("nav.workspace") || "工作区", icon: Activity, href: "/workspace", count: workspaces.length },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold tracking-tight">
            {t("dashboard.title") || "系统概览"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.subtitle") || "OpenMate 平台运行状态一览"}
          </p>
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Link
              key={stat.label}
              href={stat.href}
              className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/30"
            >
              <div className="flex items-center justify-between">
                <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", stat.bg)}>
                  <stat.icon size={20} className={stat.color} />
                </div>
                <ArrowRight size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div className="mt-4">
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Cost Statistics Card */}
        <div className="mb-8 rounded-xl border border-border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-yellow-500" />
                {t("dashboard.costStats") || "费用统计"}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {t("dashboard.costStatsDesc") || "Token 使用量与估算费用"}
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-yellow-500">${costStats.estimatedCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalCost") || "总费用"}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                <span className="text-sm font-medium">{t("dashboard.totalTokens") || "总 Token"}</span>
              </div>
              <div className="text-2xl font-bold">{(costStats.totalTokens / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("dashboard.input") || "输入"}: {(costStats.inputTokens / 1000000).toFixed(1)}M | 
                {t("dashboard.output") || "输出"}: {(costStats.outputTokens / 1000000).toFixed(1)}M
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium">{t("dashboard.todayCost") || "今日费用"}</span>
              </div>
              <div className="text-2xl font-bold text-green-500">${costStats.todayCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("dashboard.vsYesterday") || "较昨日 -12%"}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-violet-500" />
                <span className="text-sm font-medium">{t("dashboard.avgCostPerMsg") || "每消息平均费用"}</span>
              </div>
              <div className="text-2xl font-bold">${(costStats.estimatedCost / Math.max(totalMessages, 1)).toFixed(4)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {totalMessages} {t("dashboard.messages") || "条消息"}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-medium mb-3">{t("dashboard.modelBreakdown") || "模型费用分布"}</h4>
            <div className="space-y-2">
              {costStats.modelBreakdown.map((model) => (
                <div key={model.model} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-sm font-medium">{model.model}</div>
                      <div className="text-xs text-muted-foreground">{(model.tokens / 1000).toFixed(0)}K tokens</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold">${model.cost.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{((model.cost / costStats.estimatedCost) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick links */}
        <div className="mb-8">
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            {t("dashboard.quickLinks") || "快速访问"}
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                  <link.icon size={18} className="text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{link.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {link.count} {t("dashboard.items") || "项"}
                  </p>
                </div>
                <ArrowRight size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>

        {/* Organ Health Overview */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("dashboard.organHealth") || "器官健康状态"}
            </h3>
            <button
              onClick={checkOrganHealth}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ↻ {t("dashboard.refreshHealth") || "刷新"}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8">
            {organs.map((organ) => {
              const status = organHealth[organ.key];
              return (
                <div
                  key={organ.key}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors",
                    status === "ok" && "border-emerald-500/30 bg-emerald-500/5",
                    status === "error" && "border-red-500/30 bg-red-500/5",
                    status === "loading" && "border-border bg-card"
                  )}
                >
                  <span className="text-lg">{organ.label.split(" ")[0]}</span>
                  <span className="text-[10px] font-medium leading-tight">
                    {organ.label.split(" ").slice(1).join(" ")}
                  </span>
                  {status === "ok" && <CheckCircle size={12} className="text-emerald-500" />}
                  {status === "error" && <XCircle size={12} className="text-red-500" />}
                  {status === "loading" && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex items-center gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle size={10} className="text-emerald-500" />
              {Object.values(organHealth).filter((s) => s === "ok").length} {t("dashboard.healthy") || "正常"}
            </span>
            <span className="flex items-center gap-1">
              <XCircle size={10} className="text-red-500" />
              {Object.values(organHealth).filter((s) => s === "error").length} {t("dashboard.unhealthy") || "异常"}
            </span>
          </div>
        </div>

        {/* Recent activity — from recent usage records */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-muted-foreground">
              {t("dashboard.recentActivity") || "近期活动"}
            </h3>
            <button
              onClick={() => { fetchRecentUsage(); fetchCronJobs(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ↻ {t("common.refresh") || "刷新"}
            </button>
          </div>
          {recentRecords.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.time") || "时间"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.model") || "模型"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.provider") || "提供商"}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">{t("dashboard.tokens") || "Tokens"}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRecords.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {new Date(r.timestamp * 1000).toLocaleString("zh-CN", {
                          month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-2 text-xs font-medium">{r.model}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">{r.provider}</td>
                      <td className="px-4 py-2 text-xs text-right">
                        <span className="text-blue-500">{r.prompt_tokens.toLocaleString()}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-emerald-500">{r.completion_tokens.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-4 py-2 text-[10px] text-muted-foreground bg-muted/20 border-t border-border">
                {t("dashboard.showingRecent") || "显示最近"} 10 / {recentRecords.length} {t("dashboard.records") || "条记录"} · {callCount} {t("dashboard.totalCalls") || "总调用次数"}
              </div>
            </div>
          ) : cronJobs.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("dashboard.cronJobs") || "定时任务"}</p>
                {cronJobs.slice(0, 5).map((job, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", job.enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      <span className="text-sm font-medium">{job.name || job.id}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{job.schedule}</span>
                    </div>
                    {job.next_run && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("dashboard.nextRun") || "下次"}: {new Date(job.next_run).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <TrendingUp size={32} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">
                {t("dashboard.noActivity") || "暂无近期活动记录"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("dashboard.noActivityHint") || "使用 AI 对话或执行任务后，这里将显示活动记录"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

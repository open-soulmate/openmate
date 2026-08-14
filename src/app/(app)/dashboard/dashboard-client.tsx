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

export function DashboardClient() {
  const apiBase = getApiBaseUrl();
  const [organHealth, setOrganHealth] = useState<Record<string, "ok" | "error" | "loading">>({});

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
    const initial: Record<string, "loading"> = {};
    organs.forEach((o) => (initial[o.key] = "loading"));
    setOrganHealth(initial);

    const results: Record<string, "ok" | "error"> = {};
    await Promise.allSettled(
      organs.map(async (organ) => {
        try {
          const res = await fetch(`${apiBase}${organ.endpoint}`, { signal: AbortSignal.timeout(5000) });
          results[organ.key] = res.ok ? "ok" : "error";
        } catch {
          results[organ.key] = "error";
        }
      })
    );
    setOrganHealth(results);
  }, [apiBase]);

  useEffect(() => { checkOrganHealth(); }, [checkOrganHealth]);

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
      value: 0,
      sub: t("dashboard.managed") || "由 Cron 管理",
      icon: Clock,
      href: "/cron",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    },
  ];

  // Mock cost data for demo
  const costStats = {
    totalTokens: 1250000,
    inputTokens: 850000,
    outputTokens: 400000,
    estimatedCost: 21.50,
    todayCost: 3.25,
    modelBreakdown: [
      { model: 'GPT-4o', tokens: 750000, cost: 15.00 },
      { model: 'Claude Sonnet', tokens: 350000, cost: 4.50 },
      { model: 'Gemini Pro', tokens: 150000, cost: 2.00 },
    ],
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

        {/* Recent activity placeholder */}
        <div>
          <h3 className="mb-4 text-sm font-medium text-muted-foreground">
            {t("dashboard.recentActivity") || "近期活动"}
          </h3>
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <TrendingUp size={32} className="mx-auto mb-3 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              {t("dashboard.noActivity") || "暂无近期活动记录"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

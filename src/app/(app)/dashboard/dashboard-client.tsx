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
  CheckCircle, XCircle, Loader2, HardDrive, AlertTriangle,
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

interface SystemMetrics {
  system: {
    cpu_percent: number;
    memory_percent: number;
    memory_used_mb: number;
    memory_total_mb: number;
    disk_percent: number;
    disk_used_gb: number;
    disk_total_gb: number;
  };
  app: {
    request_qps: number;
    latency_p99_ms: number;
    error_rate: number;
    total_requests: number;
    total_errors: number;
  };
  alerts: {
    total: number;
    active: number;
  };
}

export function DashboardClient() {
  const apiBase = getApiBaseUrl();
  const [organHealth, setOrganHealth] = useState<Record<string, "ok" | "error" | "loading">>({});
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [recentRecords, setRecentRecords] = useState<RecentRecord[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [cronCount, setCronCount] = useState(0);
  const [sysMetrics, setSysMetrics] = useState<SystemMetrics | null>(null);

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
    { key: "trajectory", label: "📊 Trajectory", endpoint: "/api/trajectory/health" },
    { key: "mcp", label: "🔌 MCP", endpoint: "/api/mcp/health" },
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

  const fetchSysMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vital/stats`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        setSysMetrics(await res.json());
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    checkOrganHealth();
    fetchUsage();
    fetchRecentUsage();
    fetchCronJobs();
    fetchSysMetrics();
    const metricsInterval = setInterval(fetchSysMetrics, 10000);
    return () => clearInterval(metricsInterval);
  }, [checkOrganHealth, fetchUsage, fetchRecentUsage, fetchCronJobs, fetchSysMetrics]);

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
      label: t("dashboard.agents"),
      value: agentNodes.length,
      sub: `${onlineAgents} ${t("dashboard.online")}`,
      icon: Server,
      href: "/agents",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      label: t("dashboard.skills"),
      value: skills.length,
      sub: `${enabledSkills} ${t("dashboard.enabled")}`,
      icon: Puzzle,
      href: "/skills",
      color: "text-violet-500",
      bg: "bg-violet-500/10",
    },
    {
      label: t("dashboard.conversations"),
      value: conversations.length,
      sub: `${totalMessages} ${t("dashboard.messages")}`,
      icon: MessageSquare,
      href: "/chat",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      label: t("dashboard.cronJobs"),
      value: cronCount,
      sub: t("dashboard.managed"),
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
    { label: t("nav.knowledge"), icon: BookOpen, href: "/knowledge", count: knowledgeItems.length },
    { label: t("nav.groups"), icon: Users, href: "/groups", count: groups.length },
    { label: t("nav.team"), icon: Users, href: "/team", count: teams.length },
    { label: t("nav.graph"), icon: Network, href: "/graph", count: 0 },
    { label: t("nav.workflow"), icon: Workflow, href: "/workflow", count: 0 },
    { label: t("nav.workspace"), icon: Activity, href: "/workspace", count: workspaces.length },
  ];

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-3 lg:px-6 py-4 lg:py-8">
        {/* Header */}
        <div className="mb-8">
          <h2 className="text-xl lg:text-2xl font-bold tracking-tight">
            {t("dashboard.title")}
          </h2>
          <p className="mt-1 text-xs lg:text-sm text-muted-foreground">
            {t("dashboard.subtitle")}
          </p>
        </div>

        {/* Stat cards */}
        <div className="mb-8 grid grid-cols-1 gap-2 lg:gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <p className="text-xl lg:text-2xl font-bold">{stat.value}</p>
                <p className="text-xs lg:text-sm text-muted-foreground">{stat.label}</p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            </Link>
          ))}
        </div>

        {/* Cost Statistics Card */}
        <div className="mb-8 rounded-xl border border-border bg-card p-3 lg:p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-yellow-500" />
                {t("dashboard.costStats")}
              </h3>
              <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                {t("dashboard.costStatsDesc")}
              </p>
            </div>
            <div className="text-right">
              <div className="text-xl lg:text-2xl font-bold text-yellow-500">${costStats.estimatedCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground">{t("dashboard.totalCost")}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-4 mb-6">
            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Cpu className="w-4 h-4 text-blue-500" />
                <span className="text-xs lg:text-sm font-medium">{t("dashboard.totalTokens")}</span>
              </div>
              <div className="text-xl lg:text-2xl font-bold">{(costStats.totalTokens / 1000000).toFixed(1)}M</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("dashboard.input")}: {(costStats.inputTokens / 1000000).toFixed(1)}M | 
                {t("dashboard.output")}: {(costStats.outputTokens / 1000000).toFixed(1)}M
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 text-green-500" />
                <span className="text-xs lg:text-sm font-medium">{t("dashboard.todayCost")}</span>
              </div>
              <div className="text-xl lg:text-2xl font-bold text-green-500">${costStats.todayCost.toFixed(2)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {t("dashboard.vsYesterday")}
              </div>
            </div>

            <div className="p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-violet-500" />
                <span className="text-xs lg:text-sm font-medium">{t("dashboard.avgCostPerMsg")}</span>
              </div>
              <div className="text-xl lg:text-2xl font-bold">${(costStats.estimatedCost / Math.max(totalMessages, 1)).toFixed(4)}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {totalMessages} {t("dashboard.messages")}
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-xs lg:text-sm font-medium mb-3">{t("dashboard.modelBreakdown")}</h4>
            <div className="space-y-2">
              {costStats.modelBreakdown.map((model) => (
                <div key={model.model} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Cpu className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <div className="text-xs lg:text-sm font-medium">{model.model}</div>
                      <div className="text-xs text-muted-foreground">{(model.tokens / 1000).toFixed(0)}K tokens</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs lg:text-sm font-bold">${model.cost.toFixed(2)}</div>
                    <div className="text-xs text-muted-foreground">{((model.cost / costStats.estimatedCost) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* System Metrics */}
        {sysMetrics && (
          <div className="mb-8 rounded-xl border border-border bg-card p-3 lg:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-emerald-500" />
                  {t("dashboard.systemMetrics")}
                </h3>
                <p className="text-xs lg:text-sm text-muted-foreground mt-1">
                  {t("dashboard.systemMetricsDesc")}
                </p>
              </div>
              <button onClick={fetchSysMetrics} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                ↻ {t("common.refresh")}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-4 mb-4">
              {/* CPU */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-blue-500" />
                    <span className="text-xs lg:text-sm font-medium">CPU</span>
                  </div>
                  <span className={cn("text-lg font-bold", sysMetrics.system.cpu_percent > 80 ? "text-red-500" : sysMetrics.system.cpu_percent > 50 ? "text-amber-500" : "text-emerald-500")}>
                    {sysMetrics.system.cpu_percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", sysMetrics.system.cpu_percent > 80 ? "bg-red-500" : sysMetrics.system.cpu_percent > 50 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(sysMetrics.system.cpu_percent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Memory */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-violet-500" />
                    <span className="text-xs lg:text-sm font-medium">{t("dashboard.memory")}</span>
                  </div>
                  <span className={cn("text-lg font-bold", sysMetrics.system.memory_percent > 85 ? "text-red-500" : sysMetrics.system.memory_percent > 60 ? "text-amber-500" : "text-emerald-500")}>
                    {sysMetrics.system.memory_percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", sysMetrics.system.memory_percent > 85 ? "bg-red-500" : sysMetrics.system.memory_percent > 60 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(sysMetrics.system.memory_percent, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {(sysMetrics.system.memory_used_mb / 1024).toFixed(1)} / {(sysMetrics.system.memory_total_mb / 1024).toFixed(1)} GB
                </div>
              </div>

              {/* Disk */}
              <div className="p-4 rounded-lg bg-muted/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-amber-500" />
                    <span className="text-xs lg:text-sm font-medium">{t("dashboard.disk")}</span>
                  </div>
                  <span className={cn("text-lg font-bold", sysMetrics.system.disk_percent > 90 ? "text-red-500" : sysMetrics.system.disk_percent > 75 ? "text-amber-500" : "text-emerald-500")}>
                    {sysMetrics.system.disk_percent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all duration-500", sysMetrics.system.disk_percent > 90 ? "bg-red-500" : sysMetrics.system.disk_percent > 75 ? "bg-amber-500" : "bg-emerald-500")}
                    style={{ width: `${Math.min(sysMetrics.system.disk_percent, 100)}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1">
                  {sysMetrics.system.disk_used_gb.toFixed(0)} / {sysMetrics.system.disk_total_gb.toFixed(0)} GB
                </div>
              </div>
            </div>

            {/* App metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <Zap className="w-4 h-4 text-blue-500" />
                <div>
                  <div className="text-xs text-muted-foreground">QPS</div>
                  <div className="text-xs lg:text-sm font-bold">{sysMetrics.app.request_qps.toFixed(1)}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <Clock className="w-4 h-4 text-amber-500" />
                <div>
                  <div className="text-xs text-muted-foreground">P99 {t("dashboard.latency")}</div>
                  <div className="text-xs lg:text-sm font-bold">{sysMetrics.app.latency_p99_ms.toFixed(0)}ms</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <Activity className="w-4 h-4 text-emerald-500" />
                <div>
                  <div className="text-xs text-muted-foreground">{t("dashboard.totalRequests")}</div>
                  <div className="text-xs lg:text-sm font-bold">{sysMetrics.app.total_requests.toLocaleString()}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/30">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <div>
                  <div className="text-xs text-muted-foreground">{t("dashboard.activeAlerts")}</div>
                  <div className={cn("text-xs lg:text-sm font-bold", sysMetrics.alerts.active > 0 ? "text-red-500" : "text-emerald-500")}>{sysMetrics.alerts.active}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Quick links */}
        <div className="mb-8">
          <h3 className="mb-4 text-xs lg:text-sm font-medium text-muted-foreground">
            {t("dashboard.quickLinks")}
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
                  <p className="text-xs lg:text-sm font-medium">{link.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {link.count} {t("dashboard.items")}
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
            <h3 className="text-xs lg:text-sm font-medium text-muted-foreground">
              {t("dashboard.organHealth")}
            </h3>
            <button
              onClick={checkOrganHealth}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ↻ {t("dashboard.refreshHealth")}
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
          <div className="mt-2 flex items-center gap-2 lg:gap-4 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckCircle size={10} className="text-emerald-500" />
              {Object.values(organHealth).filter((s) => s === "ok").length} {t("dashboard.healthy")}
            </span>
            <span className="flex items-center gap-1">
              <XCircle size={10} className="text-red-500" />
              {Object.values(organHealth).filter((s) => s === "error").length} {t("dashboard.unhealthy")}
            </span>
          </div>
        </div>

        {/* Recent activity — from recent usage records */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs lg:text-sm font-medium text-muted-foreground">
              {t("dashboard.recentActivity")}
            </h3>
            <button
              onClick={() => { fetchRecentUsage(); fetchCronJobs(); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              ↻ {t("common.refresh")}
            </button>
          </div>
          {recentRecords.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <table className="w-full text-xs lg:text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-2 lg:px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.time")}</th>
                    <th className="px-2 lg:px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.model")}</th>
                    <th className="px-2 lg:px-4 py-2.5 text-left font-medium text-muted-foreground text-xs">{t("dashboard.provider")}</th>
                    <th className="px-2 lg:px-4 py-2.5 text-right font-medium text-muted-foreground text-xs">{t("dashboard.tokens")}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRecords.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-2 lg:px-4 py-2 text-xs text-muted-foreground">
                        {new Date(r.timestamp * 1000).toLocaleString(undefined, {
                          month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
                        })}
                      </td>
                      <td className="px-2 lg:px-4 py-2 text-xs font-medium">{r.model}</td>
                      <td className="px-2 lg:px-4 py-2 text-xs text-muted-foreground">{r.provider}</td>
                      <td className="px-2 lg:px-4 py-2 text-xs text-right">
                        <span className="text-blue-500">{r.prompt_tokens.toLocaleString()}</span>
                        <span className="text-muted-foreground mx-1">→</span>
                        <span className="text-emerald-500">{r.completion_tokens.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="px-2 lg:px-4 py-2 text-[10px] text-muted-foreground bg-muted/20 border-t border-border">
                {t("dashboard.showingRecent")} 10 / {recentRecords.length} {t("dashboard.records")} · {callCount} {t("dashboard.totalCalls")}
              </div>
            </div>
          ) : cronJobs.length > 0 ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <div className="px-2 lg:px-4 py-3 space-y-2">
                <p className="text-xs font-medium text-muted-foreground mb-2">{t("dashboard.cronJobs")}</p>
                {cronJobs.slice(0, 5).map((job, i) => (
                  <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <div className={cn("w-2 h-2 rounded-full", job.enabled ? "bg-emerald-500" : "bg-muted-foreground/30")} />
                      <span className="text-xs lg:text-sm font-medium">{job.name || job.id}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{job.schedule}</span>
                    </div>
                    {job.next_run && (
                      <span className="text-[10px] text-muted-foreground">
                        {t("dashboard.nextRun")}: {new Date(job.next_run).toLocaleString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <TrendingUp size={32} className="mx-auto mb-3 text-muted-foreground/50" />
              <p className="text-xs lg:text-sm text-muted-foreground">
                {t("dashboard.noActivity")}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {t("dashboard.noActivityHint")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

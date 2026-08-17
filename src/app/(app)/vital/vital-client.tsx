"use client";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  Activity, RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle,
  Clock, Wifi, Cpu, HardDrive, MemoryStick, Network, AlertTriangle,
  TrendingUp, TrendingDown, Server, Database, Zap, Shield, BarChart3,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface ComponentStatus {
  name: string;
  status: string;
  latency_ms: number;
  message: string;
}

interface HealthReport {
  status: string;
  components: ComponentStatus[];
  ts: number;
}

interface SystemMetrics {
  cpu_percent: number;
  memory_percent: number;
  memory_used_mb: number;
  memory_total_mb: number;
  disk_percent: number;
  disk_used_gb: number;
  disk_total_gb: number;
  net_sent_bytes: number;
  net_recv_bytes: number;
  request_qps: number;
  latency_p99_ms: number;
  error_rate: number;
  requests_total: number;
  errors_total: number;
  knowledge_entries: number;
  agents_online: number;
  search_count: number;
}

interface Alert {
  rule: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  resolved: boolean;
  ts: number;
}

interface HistoryEntry {
  ts: number;
  cpu: number;
  mem: number;
  mem_mb: number;
  disk: number;
  qps: number;
  p99: number;
  err_rate: number;
  requests: number;
  errors: number;
  knowledge: number;
}

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  up: { color: "text-emerald-500", bg: "bg-emerald-500/8", border: "border-emerald-500/20", icon: CheckCircle2, label: "UP" },
  down: { color: "text-red-500", bg: "bg-red-500/8", border: "border-red-500/20", icon: XCircle, label: "DOWN" },
  skipped: { color: "text-yellow-500", bg: "bg-yellow-500/8", border: "border-yellow-500/20", icon: AlertCircle, label: "SKIPPED" },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts * 1000;
  if (diff < 60_000) return t('common.justNow');
  if (diff < 3_600_000) return t('vital.t44780', { floordiff60000: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('vital.t56992', { floordiff3600000: Math.floor(diff / 3_600_000) });
  return t('vital.t94234', { floordiff86400000: Math.floor(diff / 86_400_000) });
}

function GaugeBar({ value, max = 100, color = "emerald", label, detail }: {
  value: number; max?: number; color?: string; label: string; detail?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const colorClass = pct > 90 ? "bg-red-500" : pct > 70 ? "bg-yellow-500" : `bg-${color}-500`;
  const textClass = pct > 90 ? "text-red-500" : pct > 70 ? "text-yellow-500" : `text-${color}-500`;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={cn("text-xs font-semibold tabular-nums", textClass)}>
          {detail || `${pct.toFixed(1)}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700 ease-out", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function VitalClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();

  // Health state
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Metrics state
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  // Alerts state
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyMinutes, setHistoryMinutes] = useState(30);

  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<"health" | "metrics" | "alerts" | "history">("metrics");

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/vital/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthReport = await res.json();
      setHealth(data);
      setHealthError(null);
    } catch (e) {
      setHealthError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setHealthLoading(false);
    }
  }, [apiBase]);

  const fetchMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/vital/metrics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // Parse Prometheus-style metrics
      const parsed: Record<string, number> = {};
      text.split("\n").forEach(line => {
        const [key, val] = line.split(" ");
        if (key && val) {
          const name = key.replace("vital_", "");
          parsed[name] = parseFloat(val);
        }
      });
      setMetrics(parsed as unknown as SystemMetrics);
    } catch {
      // silent
    } finally {
      setMetricsLoading(false);
    }
  }, [apiBase]);

  const fetchAlerts = useCallback(async () => {
    setAlertsLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/vital/alerts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAlerts(data.alerts || []);
    } catch {
      // silent
    } finally {
      setAlertsLoading(false);
    }
  }, [apiBase]);

  const fetchHistory = useCallback(async (minutes?: number) => {
    setHistoryLoading(true);
    try {
      const m = minutes ?? historyMinutes;
      const res = await fetch(`${apiBase}/api/vital/history?minutes=${m}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setHistory(data.data || []);
    } catch {
      // silent
    } finally {
      setHistoryLoading(false);
    }
  }, [apiBase, historyMinutes]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchHealth(), fetchMetrics(), fetchAlerts(), fetchHistory()]);
    setLastFetch(new Date());
  }, [fetchHealth, fetchMetrics, fetchAlerts, fetchHistory]);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(fetchAll, 30_000);
    return () => clearInterval(timer);
  }, [fetchAll]);

  const upCount = health?.components.filter(c => c.status === "up").length || 0;
  const downCount = health?.components.filter(c => c.status === "down").length || 0;
  const totalCount = health?.components.length || 0;
  const avgLatency = health ? Math.round(health.components.reduce((s, c) => s + c.latency_ms, 0) / (totalCount || 1)) : 0;
  const activeAlerts = alerts.filter(a => !a.resolved).length;
  const criticalAlerts = alerts.filter(a => !a.resolved && a.severity === "critical").length;

  const tabs = [
    { key: "metrics" as const, label: t("vital.tabMetrics")), icon: Activity },
    { key: "health" as const, label: t("vital.tabHealth")), icon: Server, badge: downCount > 0 ? downCount : undefined },
    { key: "history" as const, label: t("vital.tabHistory")), icon: BarChart3 },
    { key: "alerts" as const, label: t("vital.tabAlerts")), icon: AlertTriangle, badge: activeAlerts > 0 ? activeAlerts : undefined },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500/10">
            <Activity size={18} className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-base font-semibold">{t("vital.title"))}</h1>
            <p className="text-xs text-muted-foreground">{t("vital.subtitle"))}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastFetch && (
            <span className="text-[10px] text-muted-foreground">
              {lastFetch.toLocaleTimeString("zh-CN")}
            </span>
          )}
          <button
            onClick={fetchAll}
            disabled={healthLoading || metricsLoading || alertsLoading}
            className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
          >
            {(healthLoading || metricsLoading || alertsLoading) ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <RefreshCw size={12} />
            )}
            {t("common.refresh"))}
          </button>
        </div>
      </div>

      {/* Overview Cards */}
      {metrics && (
        <div className="border-b border-border px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={Cpu}
              label="CPU"
              value={`${(metrics.cpu_percent || 0).toFixed(1)}%`}
              status={(metrics.cpu_percent || 0) > 90 ? "critical" : (metrics.cpu_percent || 0) > 70 ? "warning" : "ok"}
            />
            <MetricCard
              icon={MemoryStick}
              label=t('vital.memory')
              value={`${(metrics.memory_percent || 0).toFixed(1)}%`}
              detail={`${((metrics.memory_used_mb || 0) / 1024).toFixed(1)} / ${((metrics.memory_total_mb || 0) / 1024).toFixed(1)} GB`}
              status={(metrics.memory_percent || 0) > 90 ? "critical" : (metrics.memory_percent || 0) > 70 ? "warning" : "ok"}
            />
            <MetricCard
              icon={HardDrive}
              label=t('vital.disk')
              value={`${(metrics.disk_percent || 0).toFixed(1)}%`}
              detail={`${(metrics.disk_used_gb || 0).toFixed(0)} / ${(metrics.disk_total_gb || 0).toFixed(0)} GB`}
              status={(metrics.disk_percent || 0) > 95 ? "critical" : (metrics.disk_percent || 0) > 85 ? "warning" : "ok"}
            />
            <MetricCard
              icon={Network}
              label=t('vital.network')
              value={`${formatBytes(metrics.net_sent_bytes || 0)} ↑`}
              detail={`${formatBytes(metrics.net_recv_bytes || 0)} ↓`}
              status="ok"
            />
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border px-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-colors -mb-px",
                activeTab === tab.key
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon size={14} />
              {tab.label}
              {tab.badge !== undefined && tab.badge > 0 && (
                <span className="ml-1 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Error banner */}
        {healthError && activeTab === "health" && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500 flex items-center gap-2">
            <XCircle size={16} />
            {t("vital.fetchError"))}: {healthError}
          </div>
        )}

        {/* Metrics Tab */}
        {activeTab === "metrics" && metrics && (
          <div className="space-y-6">
            {/* Resource Gauges */}
            <Section title=t('vital.t79389') icon={Server}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <GaugeBar value={metrics.cpu_percent || 0} label=t('vital.t49714') color="blue" />
                  <GaugeBar value={metrics.memory_percent || 0} label=t('vital.t08568') color="purple" detail={`${((metrics.memory_used_mb || 0) / 1024).toFixed(1)} / ${((metrics.memory_total_mb || 0) / 1024).toFixed(1)} GB`} />
                  <GaugeBar value={metrics.disk_percent || 0} label=t('vital.t74325') color="amber" detail={`${(metrics.disk_used_gb || 0).toFixed(0)} / ${(metrics.disk_total_gb || 0).toFixed(0)} GB`} />
                </div>
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <MiniStat label=t('vital.t88308') value={(metrics.request_qps || 0).toFixed(1)} icon={Zap} />
                    <MiniStat label=t('vital.t88060') value={`${(metrics.latency_p99_ms || 0).toFixed(0)}ms`} icon={Clock} />
                    <MiniStat label=t('vital.t28120') value={String(metrics.requests_total || 0)} icon={TrendingUp} />
                    <MiniStat label=t('vital.errorRate') value={`${((metrics.error_rate || 0) * 100).toFixed(2)}%`} icon={AlertCircle} danger={(metrics.error_rate || 0) > 0.01} />
                  </div>
                </div>
              </div>
            </Section>

            {/* Business Metrics */}
            <Section title=t('vital.business') icon={Database}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard label=t('vital.knowledgeEntries') value={String(metrics.knowledge_entries || 0)} icon={Database} color="blue" />
                <StatCard label=t('vital.t19958') value={String(metrics.agents_online || 0)} icon={Server} color="emerald" />
                <StatCard label=t('vital.searchCount') value={String(metrics.search_count || 0)} icon={Activity} color="purple" />
                <StatCard label=t('vital.t30852') value={String(metrics.errors_total || 0)} icon={AlertCircle} color={Number(metrics.errors_total) > 0 ? "red" : "emerald"} />
              </div>
            </Section>

            {/* Network */}
            <Section title=t('vital.t05491') icon={Network}>
              <div className="grid grid-cols-2 gap-3">
                <StatCard label=t('vital.t52240') value={formatBytes(metrics.net_sent_bytes || 0)} icon={TrendingUp} color="blue" />
                <StatCard label=t('vital.t85863') value={formatBytes(metrics.net_recv_bytes || 0)} icon={TrendingDown} color="emerald" />
              </div>
            </Section>
          </div>
        )}

        {/* Health Tab */}
        {activeTab === "health" && health && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-3">
              <OverviewCard
                label={t("vital.overallStatus"))}
                value={health.status.toUpperCase()}
                icon={health.status === "ok" ? CheckCircle2 : XCircle}
                valueClass={health.status === "ok" ? "text-emerald-500" : "text-red-500"}
              />
              <OverviewCard
                label={t("vital.healthyNodes"))}
                value={`${upCount}/${totalCount}`}
                icon={Wifi}
                valueClass="text-emerald-500"
              />
              <OverviewCard
                label={t("vital.errorNodes"))}
                value={String(downCount)}
                icon={XCircle}
                valueClass={downCount > 0 ? "text-red-500" : "text-emerald-500"}
              />
              <OverviewCard
                label={t("vital.avgLatency"))}
                value={`${avgLatency}mst('vital.t46068')${Math.max(...history.map(h => h.cpu)).toFixed(1)}%`}
                    icon={Cpu}
                    color="blue"
                  />
                  <StatCard
                    label=t('vital.t10312')
                    value={`${Math.max(...history.map(h => h.mem)).toFixed(1)}%t('vital.t08136')${x},${y}`;
    });
    return { ...s, path: `M${points.join("L")}`, max };
  });

  // Y-axis ticks (5 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1];

  // X-axis labels (show ~6 evenly spaced)
  const xLabelCount = Math.min(6, data.length);
  const xStep = Math.floor((data.length - 1) / (xLabelCount - 1));
  const xLabels = Array.from({ length: xLabelCount }, (_, i) => {
    const idx = Math.min(i * xStep, data.length - 1);
    const d = new Date(data[idx].ts * 1000);
    return {
      x: pad.left + (idx / (data.length - 1)) * cw,
      label: d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }),
    };
  });

  return (
    <div className="space-y-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
        {/* Grid lines */}
        {yTicks.map(t => {
          const y = pad.top + ch - t * ch;
          return (
            <g key={t}>
              <line x1={pad.left} y1={y} x2={pad.left + cw} y2={y} stroke="currentColor" strokeOpacity={0.08} />
              <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={10} fill="currentColor" opacity={0.4}>
                {Math.round(t * seriesMax[0])}
              </text>
            </g>
          );
        })}

        {/* X-axis labels */}
        {xLabels.map((xl, i) => (
          <text key={i} x={xl.x} y={H - 4} textAnchor="middle" fontSize={10} fill="currentColor" opacity={0.4}>
            {xl.label}
          </text>
        ))}

        {/* Data lines */}
        {paths.map(p => (
          <path
            key={p.key}
            d={p.path}
            fill="none"
            stroke={p.color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}

        {/* Area fill for first series */}
        {paths.length > 0 && (
          <path
            d={`${paths[0].path}L${pad.left + cw},${pad.top + ch}L${pad.left},${pad.top + ch}Z`}
            fill={paths[0].color}
            fillOpacity={0.06}
          />
        )}
      </svg>

      {/* Legend */}
      <div className="flex items-center gap-4 justify-center">
        {series.map(s => (
          <div key={s.key} className="flex items-center gap-1.5">
            <div className="w-3 h-0.5 rounded-full" style={{ backgroundColor: s.color }} />
            <span className="text-[11px] text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

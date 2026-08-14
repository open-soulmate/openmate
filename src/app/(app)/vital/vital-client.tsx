"use client";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Activity, RefreshCw, Loader2, CheckCircle2, XCircle, AlertCircle, Clock, Wifi } from "lucide-react";
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

const STATUS_CONFIG: Record<string, { color: string; bg: string; border: string; icon: typeof CheckCircle2; label: string }> = {
  up: { color: "text-emerald-500", bg: "bg-emerald-500/8", border: "border-emerald-500/20", icon: CheckCircle2, label: "UP" },
  down: { color: "text-red-500", bg: "bg-red-500/8", border: "border-red-500/20", icon: XCircle, label: "DOWN" },
  skipped: { color: "text-yellow-500", bg: "bg-yellow-500/8", border: "border-yellow-500/20", icon: AlertCircle, label: "SKIPPED" },
};

export function VitalClient() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/vital/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthReport = await res.json();
      setHealth(data);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  const upCount = health?.components.filter(c => c.status === "up").length || 0;
  const downCount = health?.components.filter(c => c.status === "down").length || 0;
  const totalCount = health?.components.length || 0;
  const avgLatency = health ? Math.round(health.components.reduce((s, c) => s + c.latency_ms, 0) / (totalCount || 1)) : 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-emerald-500" />
          <h1 className="text-lg font-semibold">{t("vital.title") || "生命体征 · 系统监控"}</h1>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
            {t("vital.subtitle") || "健康检查 · 性能监控"}
          </span>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Error banner */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500 flex items-center gap-2">
            <XCircle size={16} />
            {t("vital.fetchError") || "获取健康数据失败"}: {error}
          </div>
        )}

        {/* Overview cards */}
        {health && (
          <div className="grid grid-cols-4 gap-4">
            <OverviewCard
              label={t("vital.overallStatus") || "整体状态"}
              value={health.status.toUpperCase()}
              icon={health.status === "up" ? CheckCircle2 : XCircle}
              valueClass={health.status === "up" ? "text-emerald-500" : "text-red-500"}
            />
            <OverviewCard
              label={t("vital.healthyNodes") || "健康节点"}
              value={`${upCount}/${totalCount}`}
              icon={Wifi}
              valueClass="text-emerald-500"
            />
            <OverviewCard
              label={t("vital.errorNodes") || "异常节点"}
              value={String(downCount)}
              icon={XCircle}
              valueClass={downCount > 0 ? "text-red-500" : "text-emerald-500"}
            />
            <OverviewCard
              label={t("vital.avgLatency") || "平均延迟"}
              value={`${avgLatency}ms`}
              icon={Clock}
              valueClass="text-muted-foreground"
            />
          </div>
        )}

        {/* Component list */}
        {health && (
          <div className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground mb-3">
              {t("vital.components") || "组件状态"} ({totalCount})
            </h2>
            {health.components.map((comp) => {
              const cfg = STATUS_CONFIG[comp.status] || STATUS_CONFIG.down;
              const Icon = cfg.icon;
              return (
                <div
                  key={comp.name}
                  className={cn(
                    "flex items-center rounded-xl border p-4 transition-colors",
                    cfg.border, cfg.bg
                  )}
                >
                  <Icon size={16} className={cn("shrink-0", cfg.color)} />
                  <span className="ml-3 text-sm font-medium min-w-[140px] capitalize">
                    {comp.name}
                  </span>
                  <span className={cn(
                    "ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    cfg.color, cfg.bg
                  )}>
                    {cfg.label}
                  </span>
                  <span className="ml-auto text-xs text-muted-foreground font-mono tabular-nums">
                    {comp.latency_ms}ms
                  </span>
                  {comp.message && comp.message !== "ok" && (
                    <span className="ml-3 text-xs text-muted-foreground truncate max-w-[200px]">
                      {comp.message}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Loading state */}
        {!health && !error && (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={28} className="animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">{t("vital.checking") || "正在检查系统状态..."}</p>
          </div>
        )}

        {/* Footer */}
        {health && (
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-4 border-t border-border">
            <span>
              {t("vital.lastUpdated") || "最后更新"}: {lastFetch?.toLocaleString("zh-CN")}
            </span>
            <span>{t("vital.autoRefresh") || "每 30 秒自动刷新"}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function OverviewCard({ label, value, icon: Icon, valueClass }: {
  label: string; value: string; icon: React.ElementType; valueClass: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={14} className="text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <div className={cn("text-xl font-semibold", valueClass)}>{value}</div>
    </div>
  );
}

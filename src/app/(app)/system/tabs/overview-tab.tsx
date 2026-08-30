"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, Cpu, HardDrive, MemoryStick, Database,
  Puzzle, Zap, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Loader2, Server, Clock, Play, Pause,
} from "lucide-react";

interface OrganStatus {
  [key: string]: string;
}

interface SystemMetrics {
  cpu_percent: number;
  memory: {
    total_mb: number;
    used_mb: number;
    percent: number;
  };
  disk: {
    total_gb: number;
    used_gb: number;
    percent: number;
  };
}

interface OverviewData {
  timestamp: number;
  elapsed_ms: number;
  version: string;
  system_status: string;
  organs: {
    organs: OrganStatus;
    healthy_count: number;
    total_count: number;
    status: string;
  };
  metrics: SystemMetrics | { error: string };
  knowledge: { total_entries: number };
  plugins: { total_plugins: number; active_plugins: number };
  gland: { total_tokens: number; call_count: number };
}

const ORGAN_EMOJI: Record<string, string> = {
  soul: "🧠", cortex: "🧩", nerve: "⚡", vein: "🩸",
  sense: "👁", will: "✨", immune: "🛡", vital: "📊",
  gland: "🧪", gene: "🧬", echo: "🔊", mirror: "🪞",
  link: "🔗",
};

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  if (status === "ok") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500"><CheckCircle className="h-3 w-3" /> {t("system.ok")}</span>;
  }
  if (status === "degraded") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500"><AlertTriangle className="h-3 w-3" /> {t("system.degraded")}</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500"><XCircle className="h-3 w-3" /> {t("system.error")}</span>;
}

function MetricBar({ label, value, max, icon: Icon, color, unit }: {
  label: string; value: number; max: number; icon: React.ElementType; color: string; unit?: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("rounded-lg p-1.5", color === "text-blue-500" ? "bg-blue-500/10" : color === "text-emerald-500" ? "bg-emerald-500/10" : "bg-violet-500/10")}>
            <Icon size={14} className={color} />
          </div>
          <span className="text-xs lg:text-sm font-medium">{label}</span>
        </div>
        <span className="text-xs lg:text-sm font-bold">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {value}{unit || ""}
      </p>
    </div>
  );
}

export function OverviewTab() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(0);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshInterval, setRefreshInterval] = useState(15);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchOverview = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/system/overview`, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(() => fetchOverview(true), refreshInterval * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [autoRefresh, refreshInterval, fetchOverview]);

  const metrics = data?.metrics && !("error" in data.metrics) ? data.metrics as SystemMetrics : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Server size={20} className="text-violet-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{t("system.systemOverview")}</h1>
            <p className="text-xs text-muted-foreground">
              v{data?.version} · {data?.elapsed_ms}ms · {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "—"}
              {autoRefresh && <span className="ml-1 text-emerald-500">● {t("system.live") || "LIVE"}</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn("flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors",
              autoRefresh ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-border text-muted-foreground hover:bg-accent")}>
            {autoRefresh ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {autoRefresh ? t("system.autoRefreshOn") || "Auto" : t("system.autoRefreshOff") || "Paused"}
          </button>
          {autoRefresh && (
            <select value={refreshInterval} onChange={(e) => setRefreshInterval(Number(e.target.value))}
              className="rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground">
              <option value={5}>5s</option>
              <option value={15}>15s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>
          )}
          <button onClick={() => fetchOverview()} disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs lg:text-sm hover:bg-accent transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {t("system.refresh")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-3 lg:space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 lg:p-4 text-xs lg:text-sm text-red-500">
            {error}
          </div>
        )}

        {data && (
          <div className={cn("rounded-xl border p-3 lg:p-4 flex items-center justify-between",
            data.system_status === "ok" ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5")}>
            <div className="flex items-center gap-3">
              <Activity size={20} className={data.system_status === "ok" ? "text-emerald-500" : "text-amber-500"} />
              <div>
                <p className="font-medium">{t("system.systemStatus")}</p>
                <p className="text-xs lg:text-sm text-muted-foreground">
                  {t("system.organsHealthy", { count: data.organs.healthy_count, total: data.organs.total_count })}
                </p>
              </div>
            </div>
            <StatusBadge status={data.system_status} />
          </div>
        )}

        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-4">
            <MetricBar label={t("system.cpu")} value={metrics.cpu_percent} max={100} icon={Cpu} color="text-blue-500" unit="%" />
            <MetricBar label={t("system.memory")} value={metrics.memory.used_mb} max={metrics.memory.total_mb} icon={MemoryStick} color="text-emerald-500" unit=" MB" />
            <MetricBar label={t("system.disk")} value={metrics.disk.used_gb} max={metrics.disk.total_gb} icon={HardDrive} color="text-violet-500" unit=" GB" />
          </div>
        )}

        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4">
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Database size={14} className="text-blue-500" />
                <span className="text-xs text-muted-foreground">{t("system.knowledge")}</span>
              </div>
              <p className="text-xl lg:text-2xl font-bold">{data.knowledge.total_entries}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Puzzle size={14} className="text-emerald-500" />
                <span className="text-xs text-muted-foreground">{t("system.plugins")}</span>
              </div>
              <p className="text-xl lg:text-2xl font-bold">{data.plugins.active_plugins}<span className="text-xs lg:text-sm text-muted-foreground">/{data.plugins.total_plugins}</span></p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-amber-500" />
                <span className="text-xs text-muted-foreground">{t("system.tokensUsed")}</span>
              </div>
              <p className="text-xl lg:text-2xl font-bold">{data.gland.total_tokens.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-violet-500" />
                <span className="text-xs text-muted-foreground">{t("system.apiCalls")}</span>
              </div>
              <p className="text-xl lg:text-2xl font-bold">{data.gland.call_count}</p>
            </div>
          </div>
        )}

        {data && (
          <div>
            <h2 className="text-xs lg:text-sm font-semibold mb-3">{t("system.organHealth")}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Object.entries(data.organs.organs).map(([name, status]) => (
                <div key={name} className={cn("rounded-lg border p-3 flex items-center gap-2 transition-colors",
                  status === "ok" ? "border-border bg-card" : "border-red-500/20 bg-red-500/5")}>
                  <span className="text-lg">{ORGAN_EMOJI[name] || "🔧"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate capitalize">{name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      {status === "ok" ? (
                        <CheckCircle className="h-3 w-3 text-emerald-500" />
                      ) : (
                        <XCircle className="h-3 w-3 text-red-500" />
                      )}
                      <span className={cn("text-[10px]", status === "ok" ? "text-emerald-500" : "text-red-500")}>
                        {status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

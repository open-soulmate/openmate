"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, RefreshCw, CheckCircle, XCircle, Loader2,
  Server, Clock, Cpu, HardDrive, MemoryStick,
  Gauge, AlertTriangle, Info, Wifi, WifiOff,
} from "lucide-react";
import { PageLayout } from '@/components/page-layout';

interface OrganResult {
  key: string;
  label: string;
  category: string;
  status: "ok" | "error";
  status_code: number;
  response_time_ms: number;
}

interface SystemInfo {
  hostname: string;
  os: string;
  arch: string;
  python: string;
  cpu_count: number;
  cpu_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_percent: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_percent: number;
  uptime_seconds: number;
}

interface DiagnosticsSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  avg_response_ms: number;
  max_response_ms: number;
  overall: string;
}

interface CheckAllResult {
  summary: DiagnosticsSummary;
  system: SystemInfo;
  organs: OrganResult[];
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusBadge({ status }: { status: "ok" | "error" }) {
  return status === "ok" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
      <CheckCircle size={10} /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
      <XCircle size={10} /> ERROR
    </span>
  );
}

function GaugeBar({ value, max, label, color }: { value: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = pct < 60 ? "bg-emerald-500" : pct < 85 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ResponseTimeBar({ ms }: { ms: number }) {
  const width = Math.min(ms / 10, 100);
  const color = ms < 50 ? "bg-emerald-500" : ms < 200 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${width}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">{ms.toFixed(1)}ms</span>
    </div>
  );
}

export function DiagnosticsClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [data, setData] = useState<CheckAllResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/diagnostics/check-all`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        setData(await res.json());
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    runCheck();
    const interval = setInterval(runCheck, 60000);
    return (
        <PageLayout title="Diagnostics">
          
        </PageLayout>
      ) => clearInterval(interval);
  }, [runCheck]);

  // Sort organs by response time
  const sortedOrgans = data?.organs
    ? [...data.organs].sort((a, b) => a.response_time_ms - b.response_time_ms)
    : [];

  // Group organs by category
  const grouped = sortedOrgans.reduce<Record<string, OrganResult[]>>((acc, o) => {
    (acc[o.category] = acc[o.category] || []).push(o);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    core: t("diagnostics.coreLayer") || "Core",
    platform: t("diagnostics.platformLayer") || "Platform",
    advanced: t("diagnostics.advancedLayer") || "Advanced",
    system: t("diagnostics.systemLayer") || "System",
    service: t("diagnostics.serviceLayer") || "Service",
    organ: t("diagnostics.organLayer") || "Organ",
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-orange-500" />
          <h1 className="text-lg font-semibold">{t("diagnostics.title") || "Diagnostics"}</h1>
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
            {t("diagnostics.badge") || "Health Check"}
          </span>
          {data && (
            data.summary.overall === "ok" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                <Wifi size={10} /> All OK
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                <WifiOff size={10} /> Issues
              </span>
            )
          )}
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs lg:text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? (t("diagnostics.checking") || "Checking...") : (t("diagnostics.refresh") || "Refresh")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-3 lg:space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 lg:p-4 text-xs lg:text-sm text-red-500">
            {error}
          </div>
        )}

        {data && (
          <>
            {/* Health Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4">
              <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.totalOrgans") || "Total"}</span>
                  <div className="rounded-lg p-1.5 bg-blue-500/10"><Server size={14} className="text-blue-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{data.summary.total}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="text-emerald-500">{data.summary.healthy}</span> ok ·
                  <span className="text-red-500 ml-1">{data.summary.unhealthy}</span> error
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.avgResponse") || "Avg Response"}</span>
                  <div className="rounded-lg p-1.5 bg-amber-500/10"><Clock size={14} className="text-amber-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{data.summary.avg_response_ms}<span className="text-xs lg:text-sm font-normal ml-0.5">ms</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">max {data.summary.max_response_ms.toFixed(1)}ms</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">CPU</span>
                  <div className="rounded-lg p-1.5 bg-violet-500/10"><Cpu size={14} className="text-violet-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{data.system.cpu_percent}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.system.cpu_count} cores</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.memory") || "Memory"}</span>
                  <div className="rounded-lg p-1.5 bg-emerald-500/10"><MemoryStick size={14} className="text-emerald-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{data.system.memory_percent}%</p>
                <p className="text-xs text-muted-foreground mt-0.5">{data.system.memory_used_gb}G / {data.system.memory_total_gb}G</p>
              </div>
            </div>

            {/* System Gauges */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                <Gauge size={14} className="text-orange-500" />
                {t("diagnostics.systemGauges") || "System Gauges"}
              </h3>
              <GaugeBar value={data.system.cpu_percent} max={100} label="CPU" color="violet" />
              <GaugeBar value={data.system.memory_percent} max={100} label={`${t("diagnostics.memory") || "Memory"} (${data.system.memory_used_gb}G / ${data.system.memory_total_gb}G)`} color="emerald" />
              <GaugeBar value={data.system.disk_percent} max={100} label={`${t("diagnostics.disk") || "Disk"} (${data.system.disk_used_gb}G / ${data.system.disk_total_gb}G)`} color="blue" />
            </div>

            {/* System Info */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2 mb-4">
                <Info size={14} className="text-blue-500" />
                {t("diagnostics.systemInfo") || "System Info"}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4 text-xs lg:text-sm">
                <div><span className="text-muted-foreground">{t("diagnostics.hostname") || "Hostname"}: </span><span className="font-mono">{data.system.hostname}</span></div>
                <div><span className="text-muted-foreground">{t("diagnostics.os") || "OS"}: </span>{data.system.os}</div>
                <div><span className="text-muted-foreground">{t("diagnostics.arch") || "Arch"}: </span>{data.system.arch}</div>
                <div><span className="text-muted-foreground">Python: </span><span className="font-mono">{data.system.python}</span></div>
                <div><span className="text-muted-foreground">{t("diagnostics.uptime") || "Uptime"}: </span>{formatUptime(data.system.uptime_seconds)}</div>
              </div>
            </div>

            {/* Organ List — grouped by category, sorted by response time */}
            {Object.entries(grouped).map(([category, organs]) => (
              <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                      <Gauge size={14} className="text-orange-500" />
                      {categoryLabels[category] || category}
                    </h3>
                    <span className="text-[10px] text-muted-foreground">
                      {organs.filter((o) => o.status === "ok").length}/{organs.length} {t("diagnostics.healthy") || "healthy"}
                    </span>
                  </div>
                </div>
                <div className="divide-y divide-border">
                  {organs.map((organ) => (
                    <div key={organ.key} className="flex items-center gap-2 lg:gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                      <StatusBadge status={organ.status} />
                      <span className="text-xs lg:text-sm font-medium flex-1">{organ.label}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                        {organ.key}
                      </span>
                      <ResponseTimeBar ms={organ.response_time_ms} />
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Overall Status Banner */}
            <div
              className={cn(
                "rounded-xl border p-5 flex items-center gap-2 lg:gap-4",
                data.summary.overall === "ok"
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-amber-500/30 bg-amber-500/5"
              )}
            >
              {data.summary.overall === "ok" ? (
                <CheckCircle size={24} className="text-emerald-500 shrink-0" />
              ) : (
                <AlertTriangle size={24} className="text-amber-500 shrink-0" />
              )}
              <div>
                <p className="text-xs lg:text-sm font-semibold">
                  {data.summary.overall === "ok"
                    ? (t("diagnostics.allOk") || "All systems operational")
                    : (t("diagnostics.partialError") || "Some systems have issues")}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.summary.healthy}/{data.summary.total} {t("diagnostics.organHealth") || "organs healthy"} ·
                  {t("diagnostics.avgResponse") || "Avg"} {data.summary.avg_response_ms}ms ·
                  {data.system.hostname} ({data.system.os})
                </p>
              </div>
            </div>
          </>
        )}

        {/* Loading state */}
        {!data && loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-orange-500" />
          </div>
        )}
      </div>
    </div>
  );
}

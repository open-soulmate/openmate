"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import {
  Activity, CheckCircle, XCircle, Loader2, RefreshCw,
  Server, Clock, Cpu, HardDrive, MemoryStick, Settings,
  ChevronRight, ChevronDown, Zap, AlertTriangle, Info,
  Gauge, Globe, Database, Shield,
} from "lucide-react";

interface OrganResult {
  key: string;
  label: string;
  category: string;
  status: "ok" | "error";
  status_code: number;
  response_time_ms: number;
  error?: string;
  detail?: Record<string, unknown>;
}

interface SystemInfo {
  hostname: string;
  os: string;
  arch: string;
  python: string;
  cpu_count: number;
  cpu_percent?: number;
  memory_total_gb?: number;
  memory_used_gb?: number;
  memory_percent?: number;
  disk_total_gb?: number;
  disk_used_gb?: number;
  disk_percent?: number;
  uptime_seconds?: number;
  load_avg_1m?: number;
  load_avg_5m?: number;
  load_avg_15m?: number;
  has_psutil: boolean;
}

interface CheckAllResult {
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    avg_response_ms: number;
    max_response_ms: number;
    overall: string;
  };
  system: SystemInfo;
  organs: OrganResult[];
}

interface ConfigChange {
  key: string;
  default: unknown;
  current: unknown;
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

function ResponseTimeBar({ ms }: { ms: number }) {
  const width = Math.min(ms / 10, 100); // 1000ms = 100%
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
  const [configChanges, setConfigChanges] = useState<ConfigChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expandedOrgan, setExpandedOrgan] = useState<string | null>(null);
  const [organDetails, setOrganDetails] = useState<Record<string, OrganResult>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [checkRes, configRes] = await Promise.all([
        fetch(`${apiBase}/api/diagnostics/check-all`, { signal: AbortSignal.timeout(15000) }),
        fetch(`${apiBase}/api/diagnostics/config-diff`, { signal: AbortSignal.timeout(5000) }),
      ]);
      if (checkRes.ok) setData(await checkRes.json());
      else setError(`HTTP ${checkRes.status}`);
      if (configRes.ok) {
        const cd = await configRes.json();
        setConfigChanges(cd.changes || []);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Check failed");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { runCheck(); }, [runCheck]);

  const toggleOrgan = async (key: string) => {
    if (expandedOrgan === key) {
      setExpandedOrgan(null);
      return;
    }
    setExpandedOrgan(key);
    if (!organDetails[key]) {
      setDetailLoading(key);
      try {
        const res = await fetch(`${apiBase}/api/diagnostics/organs/${key}`);
        if (res.ok) {
          const detail = await res.json();
          setOrganDetails((prev) => ({ ...prev, [key]: detail }));
        }
      } catch { /* ignore */ }
      finally { setDetailLoading(null); }
    }
  };

  // Group organs by category
  const grouped = data?.organs.reduce<Record<string, OrganResult[]>>((acc, o) => {
    (acc[o.category] = acc[o.category] || []).push(o);
    return acc;
  }, {}) || {};

  const categoryLabels: Record<string, string> = {
    core: t("diagnostics.coreLayer"),
    platform: t("diagnostics.platformLayer"),
    advanced: t("diagnostics.advancedLayer"),
    system: t("diagnostics.systemLayer"),
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-orange-500" />
          <h1 className="text-lg font-semibold">{t("diagnostics.title")}</h1>
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
            {t("diagnostics.deepInspection")}
          </span>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {loading ? (t("diagnostics.checking") || "检测中...") : t("diagnostics.refresh")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.totalOrgans")}</span>
                <div className="rounded-lg p-1.5 bg-blue-500/10"><Server size={14} className="text-blue-500" /></div>
              </div>
              <p className="text-2xl font-bold">{data.summary.total}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="text-emerald-500">{data.summary.healthy}</span> {t('diagnostics.healthyLabel')} ·
                <span className="text-red-500 ml-1">{data.summary.unhealthy}</span> {t('diagnostics.unhealthyLabel')}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.avgResponse")}</span>
                <div className="rounded-lg p-1.5 bg-amber-500/10"><Clock size={14} className="text-amber-500" /></div>
              </div>
              <p className="text-2xl font-bold">{data.summary.avg_response_ms}<span className="text-sm font-normal ml-0.5">ms</span></p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('diagnostics.maxLabel')} {data.summary.max_response_ms.toFixed(1)}ms</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">CPU</span>
                <div className="rounded-lg p-1.5 bg-violet-500/10"><Cpu size={14} className="text-violet-500" /></div>
              </div>
              <p className="text-2xl font-bold">
                {data.system.cpu_percent !== undefined ? `${data.system.cpu_percent}%` : `${data.system.cpu_count}${t('diagnostics.cores')}`}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.system.has_psutil ? `${data.system.cpu_count} ${t('diagnostics.coresLabel')}` : `Load: ${data.system.load_avg_1m?.toFixed(2)}`}
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">{t("diagnostics.memory")}</span>
                <div className="rounded-lg p-1.5 bg-emerald-500/10"><MemoryStick size={14} className="text-emerald-500" /></div>
              </div>
              <p className="text-2xl font-bold">
                {data.system.memory_percent !== undefined ? `${data.system.memory_percent}%` : "N/A"}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.system.memory_used_gb !== undefined ? `${data.system.memory_used_gb}G / ${data.system.memory_total_gb}G` : "psutil not installed"}
              </p>
            </div>
          </div>
        )}

        {/* System Info */}
        {data && (
          <div className="rounded-xl border border-border bg-card p-5">
            <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
              <Info size={14} className="text-blue-500" />
              {t("diagnostics.systemInfo")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span className="text-muted-foreground">{t("diagnostics.hostname")}:</span> <span className="font-mono">{data.system.hostname}</span></div>
              <div><span className="text-muted-foreground">{t("diagnostics.os")}:</span> {data.system.os}</div>
              <div><span className="text-muted-foreground">{t("diagnostics.arch")}:</span> {data.system.arch}</div>
              <div><span className="text-muted-foreground">Python:</span> <span className="font-mono">{data.system.python}</span></div>
              {data.system.disk_percent !== undefined && (
                <>
                  <div><span className="text-muted-foreground">{t("diagnostics.disk")}:</span> {data.system.disk_percent}% ({data.system.disk_used_gb}G / {data.system.disk_total_gb}G)</div>
                </>
              )}
              {data.system.uptime_seconds !== undefined && (
                <div><span className="text-muted-foreground">{t("diagnostics.uptime")}:</span> {formatUptime(data.system.uptime_seconds)}</div>
              )}
            </div>
          </div>
        )}

        {/* Organ Health — grouped by category */}
        {data && Object.entries(grouped).map(([category, organs]) => (
          <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Gauge size={14} className="text-orange-500" />
                  {categoryLabels[category] || category}
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {organs.filter((o) => o.status === "ok").length}/{organs.length} {t('diagnostics.healthyLabel')}
                </span>
              </div>
            </div>
            <div className="divide-y divide-border">
              {organs.map((organ) => (
                <div key={organ.key}>
                  <button
                    onClick={() => toggleOrgan(organ.key)}
                    className="flex w-full items-center gap-3 px-5 py-3 hover:bg-muted/30 transition-colors text-left"
                  >
                    <StatusBadge status={organ.status} />
                    <span className="text-sm font-medium flex-1">{organ.label}</span>
                    <ResponseTimeBar ms={organ.response_time_ms} />
                    {detailLoading === organ.key ? (
                      <Loader2 size={14} className="animate-spin text-muted-foreground" />
                    ) : expandedOrgan === organ.key ? (
                      <ChevronDown size={14} className="text-muted-foreground" />
                    ) : (
                      <ChevronRight size={14} className="text-muted-foreground" />
                    )}
                  </button>
                  {/* Expanded detail */}
                  {expandedOrgan === organ.key && organDetails[organ.key] && (
                    <div className="px-5 pb-4 pt-0">
                      <div className="rounded-lg bg-muted/50 p-4 text-xs space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <div><span className="text-muted-foreground">{t('diagnostics.statusCode')}:</span> {organDetails[organ.key].status_code}</div>
                          <div><span className="text-muted-foreground">{t('diagnostics.responseTimeLabel')}:</span> {organDetails[organ.key].response_time_ms}ms</div>
                          <div><span className="text-muted-foreground">{t('diagnostics.categoryLabel')}:</span> {organDetails[organ.key].category}</div>
                        </div>
                        {organDetails[organ.key].error && (
                          <div className="text-red-500">{t('diagnostics.errorLabel')}: {organDetails[organ.key].error}</div>
                        )}
                        {organDetails[organ.key].detail && (
                          <pre className="whitespace-pre-wrap rounded bg-background p-3 text-[11px] font-mono max-h-40 overflow-y-auto">
                            {JSON.stringify(organDetails[organ.key].detail, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Config Changes */}
        {configChanges.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Settings size={14} className="text-violet-500" />
                {t("diagnostics.configChanges")}
                <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-500">
                  {configChanges.length} {t('diagnostics.itemsLabel')}
                </span>
              </h3>
            </div>
            <div className="divide-y divide-border">
              {configChanges.map((change) => (
                <div key={change.key} className="flex items-center gap-4 px-5 py-3 text-xs">
                  <span className="font-mono font-medium text-foreground w-48 truncate">{change.key}</span>
                  <span className="text-muted-foreground flex-1 truncate">
                    {t('diagnostics.defaultLabel')}: <span className="font-mono">{JSON.stringify(change.default)}</span>
                  </span>
                  <span className="text-amber-500 font-mono truncate">
                    {t('diagnostics.currentLabel')}: {JSON.stringify(change.current)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Overall Status Banner */}
        {data && (
          <div className={cn(
            "rounded-xl border p-5 flex items-center gap-4",
            data.summary.overall === "ok"
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          )}>
            {data.summary.overall === "ok" ? (
              <CheckCircle size={24} className="text-emerald-500 shrink-0" />
            ) : (
              <AlertTriangle size={24} className="text-amber-500 shrink-0" />
            )}
            <div>
              <p className="text-sm font-semibold">
                {data.summary.overall === "ok" ? (t("diagnostics.allOk") || "所有系统正常运行") : (t("diagnostics.partialError") || "部分系统异常")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.summary.healthy}/{data.summary.total} {t('diagnostics.organHealthLabel')} · {t("diagnostics.avgResponse")} {data.summary.avg_response_ms}ms ·
                {t('diagnostics.systemLabel')} {data.system.hostname} ({data.system.os})
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

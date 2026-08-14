"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, RefreshCw, CheckCircle, XCircle, AlertTriangle,
  Cpu, HardDrive, MemoryStick, Wifi, Clock, TrendingUp,
} from "lucide-react";

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

interface Alert {
  rule: string;
  severity: string;
  message: string;
  value: number;
  threshold: number;
  resolved: boolean;
  ts: number;
}

function StatusIcon({ status }: { status: string }) {
  if (status === "up") return <CheckCircle size={16} className="text-emerald-500" />;
  if (status === "down") return <XCircle size={16} className="text-red-500" />;
  return <AlertTriangle size={16} className="text-amber-500" />;
}

function MetricBar({ label, value, max = 100, unit = "%", color = "bg-blue-500" }: {
  label: string; value: number; max?: number; unit?: string; color?: string;
}) {
  const pct = Math.min((value / max) * 100, 100);
  const isHigh = pct > 80;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-medium", isHigh ? "text-red-500" : "text-foreground")}>
          {value.toFixed(1)}{unit}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", isHigh ? "bg-red-500" : color)}
          style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function VitalClient() {
  const { t } = useTranslation();
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [metrics, setMetrics] = useState<Record<string, number>>({});
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tab, setTab] = useState<"health" | "metrics" | "alerts">("health");
  const apiBase = getApiBaseUrl();

  const fetchAll = useCallback(async () => {
    try {
      const [hRes, mRes, aRes] = await Promise.all([
        fetch(`${apiBase}/api/vital/health`),
        fetch(`${apiBase}/api/vital/metrics`),
        fetch(`${apiBase}/api/vital/alerts`),
      ]);
      if (hRes.ok) setHealth(await hRes.json());
      if (aRes.ok) {
        const data = await aRes.json();
        setAlerts(data.alerts || []);
      }
      if (mRes.ok) {
        const text = await mRes.text();
        const parsed: Record<string, number> = {};
        text.split("\n").forEach(line => {
          const [name, val] = line.trim().split(/\s+/);
          if (name && val) parsed[name] = parseFloat(val);
        });
        setMetrics(parsed);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const tabs = [
    { id: "health" as const, label: t("vital.health") || "健康检查", icon: Activity },
    { id: "metrics" as const, label: t("vital.metrics") || "系统指标", icon: TrendingUp },
    { id: "alerts" as const, label: t("vital.alerts") || "告警", icon: AlertTriangle },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-emerald-500" />
          <h1 className="text-lg font-semibold">{t("vital.title") || "体征 · 系统监控"}</h1>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
            {t("vital.subtitle") || "健康检查 · 指标采集 · 告警"}
          </span>
          {health && (
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium",
              health.status === "up" ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
              {health.status === "up" ? "系统正常" : "存在异常"}
            </span>
          )}
        </div>
        <button onClick={fetchAll}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
                tab === tabItem.id ? "bg-emerald-500/10 text-emerald-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
              {tabItem.id === "alerts" && alerts.filter(a => !a.resolved).length > 0 && (
                <span className="ml-1 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] text-white">
                  {alerts.filter(a => !a.resolved).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Health Tab */}
        {tab === "health" && health && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {health.components.map((comp) => (
                <div key={comp.name} className={cn("rounded-xl border p-4",
                  comp.status === "up" ? "border-emerald-500/20 bg-emerald-500/5" : "border-red-500/20 bg-red-500/5")}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <StatusIcon status={comp.status} />
                      <span className="font-medium text-sm capitalize">{comp.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{comp.latency_ms}ms</span>
                  </div>
                  {comp.message && (
                    <p className="text-xs text-muted-foreground mt-1 font-mono">{comp.message}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="text-xs text-muted-foreground text-right">
              <Clock size={12} className="inline mr-1" />
              更新于 {new Date(health.ts * 1000).toLocaleString("zh-CN")}
            </div>
          </div>
        )}

        {/* Metrics Tab */}
        {tab === "metrics" && (
          <div className="space-y-6">
            {/* System Metrics */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Cpu size={16} className="text-blue-500" /> {t("vital.system") || "系统资源"}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <MetricBar label="CPU" value={metrics.vital_cpu_percent || 0} color="bg-blue-500" />
                <MetricBar label={t("vital.memory") || "内存"} value={metrics.vital_memory_percent || 0} color="bg-violet-500" />
                <MetricBar label={t("vital.disk") || "磁盘"} value={metrics.vital_disk_percent || 0} color="bg-amber-500" />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{t("vital.memoryUsage") || "内存使用"}</span>
                    <span className="font-medium">
                      {(metrics.vital_memory_used_mb || 0).toFixed(0)} / {(metrics.vital_memory_total_mb || 0).toFixed(0)} MB
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Network */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <Wifi size={16} className="text-cyan-500" /> {t("vital.network") || "网络"}
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.netSent") || "发送"}</span>
                  <p className="text-lg font-bold">{((metrics.vital_net_sent_bytes || 0) / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.netRecv") || "接收"}</span>
                  <p className="text-lg font-bold">{((metrics.vital_net_recv_bytes || 0) / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              </div>
            </div>

            {/* App Metrics */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <TrendingUp size={16} className="text-emerald-500" /> {t("vital.appMetrics") || "应用指标"}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">QPS</span>
                  <p className="text-lg font-bold">{(metrics.vital_request_qps || 0).toFixed(1)}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">P99 延迟</span>
                  <p className="text-lg font-bold">{(metrics.vital_latency_p99_ms || 0).toFixed(0)}ms</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.errorRate") || "错误率"}</span>
                  <p className="text-lg font-bold">{((metrics.vital_error_rate || 0) * 100).toFixed(2)}%</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.totalRequests") || "总请求"}</span>
                  <p className="text-lg font-bold">{(metrics.vital_requests_total || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Business Metrics */}
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-medium flex items-center gap-2">
                <HardDrive size={16} className="text-amber-500" /> {t("vital.business") || "业务指标"}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.knowledgeEntries") || "知识条目"}</span>
                  <p className="text-lg font-bold">{(metrics.vital_knowledge_entries || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.agentsOnline") || "在线Agent"}</span>
                  <p className="text-lg font-bold">{(metrics.vital_agents_online || 0)}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3">
                  <span className="text-xs text-muted-foreground">{t("vital.searchCount") || "搜索次数"}</span>
                  <p className="text-lg font-bold">{(metrics.vital_search_count || 0).toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Alerts Tab */}
        {tab === "alerts" && (
          <div className="space-y-4">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <CheckCircle size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t("vital.noAlerts") || "暂无告警"}</p>
                <p className="text-xs mt-1">{t("vital.allNormal") || "系统运行正常"}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.severity") || "级别"}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.rule") || "规则"}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.message") || "消息"}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.value") || "值"}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.threshold") || "阈值"}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("vital.status") || "状态"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((a, i) => (
                      <tr key={i} className={cn("border-b border-border last:border-0 hover:bg-muted/30",
                        !a.resolved && "bg-red-500/5")}>
                        <td className="px-4 py-2.5">
                          <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium",
                            a.severity === "critical" ? "bg-red-500/10 text-red-500" :
                            a.severity === "warning" ? "bg-amber-500/10 text-amber-500" :
                            "bg-blue-500/10 text-blue-500")}>
                            {a.severity}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-xs">{a.rule}</td>
                        <td className="px-4 py-2.5 text-xs">{a.message}</td>
                        <td className="px-4 py-2.5 text-xs font-mono">{a.value}</td>
                        <td className="px-4 py-2.5 text-xs font-mono">{a.threshold}</td>
                        <td className="px-4 py-2.5">
                          {a.resolved ? (
                            <span className="text-emerald-500 text-xs">已恢复</span>
                          ) : (
                            <span className="text-red-500 text-xs">活跃</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

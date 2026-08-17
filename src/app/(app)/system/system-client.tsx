"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, Cpu, HardDrive, MemoryStick, Database,
  Puzzle, Zap, CheckCircle, XCircle, AlertTriangle,
  RefreshCw, Loader2, Server, Clock, Rocket,
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
    error_count?: number;
    total_count: number;
    status: string;
    latency?: {
      avg_ms: number;
      slowest: Array<{ organ: string; ms: number }>;
    };
  };
  metrics: SystemMetrics | { error: string };
  knowledge: { total_entries: number };
  plugins: { total_plugins: number; active_plugins: number };
  gland: { total_tokens: number; call_count: number };
}

const ORGAN_EMOJI: Record<string, string> = {
  // Core brain
  soul: "🧠", cortex: "🧩", "cortex-enhanced": "🧩",
  // Nervous system
  nerve: "⚡",
  // Circulatory
  vein: "🩸",
  // Sensory
  sense: "👁",
  // Will / automation
  will: "✨",
  // Vital signs
  vital: "📊",
  // Model gateway
  gland: "🧪",
  // Security
  immune: "🛡",
  // Backup
  marrow: "🦴",
  // Templates
  gene: "🧬",
  // Messaging
  echo: "🔊",
  // Sandbox
  mirror: "🪞",
  // Integration
  link: "🔗",
  // Phase 4
  hippo: "🧠", reflex: "⚡", heredity: "🔗",
  nest: "🏠", pulse: "💓", limb: "💪",
  voice: "🎤", vision: "🎨", mind: "💭",
  // Intelligence / analytics
  intelligence: "📈",
  // Trajectory
  trajectory: "📊",
  // MCP
  mcp: "🔌",
  // Learning
  learn: "📚",
  // Diagnostics
  diagnostics: "🩺",
  // Soma
  "soma-connector": "🤖",
  // Event stream
  "event-stream": "📡",
  // Capture
  capture: "📷",
  // Pipeline
  pipeline: "⚙️",
  // Topology
  topology: "🌐",
  // Graph
  graph: "🕸",
  // Entity
  entity: "🏷",
  // Tags
  tag: "🔖",
  // User
  user: "👤",
  // LLM
  llm: "🤖",
  // Agent
  agent: "🤖",
  // Export
  export: "📤",
  // Search
  search: "🔍",
  // Chat
  chat: "💬",
  // Workspace
  workspace: "📁",
  // Workflow
  workflow: "🔄",
  // Collaboration
  collab: "🤝",
  // Marketplace
  marketplace: "🛒",
  // Skills
  skills: "🧩",
  // Notifications
  notifications: "🔔",
  // Knowledge
  knowledge: "📖",
  // Healer
  healer: "💊",
  // Timeline
  timeline: "📜",
  // Benchmark
  benchmark: "🏁",
  // System
  "system-overview": "🖥",
};

function StatusBadge({ status }: { status: string }) {
  if (status === "ok") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500"><CheckCircle className="h-3 w-3" /> OK</span>;
  }
  if (status === "degraded") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500"><AlertTriangle className="h-3 w-3" /> Degraded</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500"><XCircle className="h-3 w-3" /> Error</span>;
}

function MetricBar({ label, value, max, icon: Icon, color }: {
  label: string; value: number; max: number; icon: React.ElementType; color: string;
}) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("rounded-lg p-1.5", color === "text-blue-500" ? "bg-blue-500/10" : color === "text-emerald-500" ? "bg-emerald-500/10" : "bg-violet-500/10")}>
            <Icon size={14} className={color} />
          </div>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <span className="text-sm font-bold">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", pct > 90 ? "bg-red-500" : pct > 70 ? "bg-amber-500" : "bg-emerald-500")}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {label === "CPU" ? `${value}%` : label === "Memory" ? `${value} MB` : `${value} GB`}
      </p>
    </div>
  );
}

export function SystemOverviewClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastRefresh, setLastRefresh] = useState(0);
  const [bootstrapState, setBootstrapState] = useState<any>(null);
  const [bootstrapping, setBootstrapping] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
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
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // Fetch bootstrap status
  useEffect(() => {
    fetch(`${apiBase}/api/system/bootstrap/status`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setBootstrapState(data); })
      .catch(() => {});
  }, [apiBase, lastRefresh]);

  const handleBootstrap = async (force = false) => {
    setBootstrapping(true);
    try {
      const res = await fetch(`${apiBase}/api/system/bootstrap/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force }),
      });
      const data = await res.json();
      setBootstrapState(data);
      fetchOverview();
    } catch {} finally { setBootstrapping(false); }
  };

  const metrics = data?.metrics && !("error" in data.metrics) ? data.metrics as SystemMetrics : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-violet-500/10 p-2">
            <Server size={20} className="text-violet-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">System Overview</h1>
            <p className="text-xs text-muted-foreground">
              v{data?.version} · {data?.elapsed_ms}ms · {lastRefresh ? new Date(lastRefresh).toLocaleTimeString() : "—"}
            </p>
          </div>
        </div>
        <button onClick={fetchOverview} disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent transition-colors disabled:opacity-50">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* System Status Banner */}
        {data && (
          <div className={cn("rounded-xl border p-4 flex items-center justify-between",
            data.system_status === "ok" ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5")}>
            <div className="flex items-center gap-3">
              <Activity size={20} className={data.system_status === "ok" ? "text-emerald-500" : "text-amber-500"} />
              <div>
                <p className="font-medium">System Status</p>
                <p className="text-sm text-muted-foreground">
                  {data.organs.healthy_count}/{data.organs.total_count} organs healthy
                </p>
              </div>
            </div>
            <StatusBadge status={data.system_status} />
          </div>
        )}

        {/* Resource Metrics */}
        {metrics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricBar label="CPU" value={metrics.cpu_percent} max={100} icon={Cpu} color="text-blue-500" />
            <MetricBar label="Memory" value={metrics.memory.used_mb} max={metrics.memory.total_mb} icon={MemoryStick} color="text-emerald-500" />
            <MetricBar label="Disk" value={metrics.disk.used_gb} max={metrics.disk.total_gb} icon={HardDrive} color="text-violet-500" />
          </div>
        )}

        {/* Quick Stats */}
        {data && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Database size={14} className="text-blue-500" />
                <span className="text-xs text-muted-foreground">Knowledge</span>
              </div>
              <p className="text-2xl font-bold">{data.knowledge.total_entries}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Puzzle size={14} className="text-emerald-500" />
                <span className="text-xs text-muted-foreground">Plugins</span>
              </div>
              <p className="text-2xl font-bold">{data.plugins.active_plugins}<span className="text-sm text-muted-foreground">/{data.plugins.total_plugins}</span></p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Zap size={14} className="text-amber-500" />
                <span className="text-xs text-muted-foreground">Tokens Used</span>
              </div>
              <p className="text-2xl font-bold">{data.gland.total_tokens.toLocaleString()}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-violet-500" />
                <span className="text-xs text-muted-foreground">API Calls</span>
              </div>
              <p className="text-2xl font-bold">{data.gland.call_count}</p>
            </div>
          </div>
        )}

        {/* Bootstrap Status */}
        {bootstrapState && (
          <div className={cn("rounded-xl border p-4",
            bootstrapState.bootstrapped ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5")}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Rocket size={20} className={bootstrapState.bootstrapped ? "text-emerald-500" : "text-amber-500"} />
                <div>
                  <p className="font-medium">System Bootstrap</p>
                  <p className="text-xs text-muted-foreground">
                    {bootstrapState.bootstrapped
                      ? `Initialized at ${new Date(bootstrapState.bootstrapped_at * 1000).toLocaleString()}`
                      : "Not initialized — click to auto-configure default integrations"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleBootstrap(!bootstrapState.bootstrapped)}
                disabled={bootstrapping}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
                  bootstrapState.bootstrapped
                    ? "border border-border hover:bg-accent"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
              >
                {bootstrapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                {bootstrapState.bootstrapped ? "Re-run" : "Initialize"}
              </button>
            </div>
            {bootstrapState.items && Object.keys(bootstrapState.items).length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(bootstrapState.items).map(([key, ok]) => (
                  <span key={key} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                    ok ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                    {ok ? <CheckCircle className="h-2.5 w-2.5" /> : <XCircle className="h-2.5 w-2.5" />}
                    {key.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Organ Grid */}
        {data && (
          <div>
            <h2 className="text-sm font-semibold mb-3">Organ Health</h2>
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

        {/* Latency Report */}
        {data?.organs?.latency && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <Clock size={16} className="text-amber-500" />
              <h2 className="text-sm font-semibold">Organ Response Latency</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                avg {data.organs.latency.avg_ms}ms
              </span>
            </div>
            <div className="space-y-2">
              {data.organs.latency.slowest.map((item) => {
                const maxMs = data.organs.latency!.slowest[0]?.ms || 1;
                const pct = (item.ms / maxMs) * 100;
                return (
                  <div key={item.organ} className="flex items-center gap-3">
                    <span className="text-sm w-5 text-center">{ORGAN_EMOJI[item.organ] || "🔧"}</span>
                    <span className="text-xs font-medium w-32 truncate capitalize">{item.organ}</span>
                    <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn("h-full rounded-full transition-all",
                          item.ms > 300 ? "bg-red-500" : item.ms > 150 ? "bg-amber-500" : "bg-emerald-500"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">{item.ms}ms</span>
                  </div>
                );
              })}
            </div>
            <p className="mt-2 text-[10px] text-muted-foreground">Top 5 slowest organs</p>
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Shield,
  Trash2,
  Database,
  RefreshCw,
  Download,
  Activity,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  HardDrive,
  Clock,
} from "lucide-react";

interface ActionResult {
  action: string;
  status: string;
  data?: any;
  error?: string;
  cleared?: number;
  cleaned?: number;
  total?: number;
}

interface SystemOverview {
  timestamp: number;
  health: {
    status: string;
    healthy: number;
    total: number;
    organs: Record<string, string>;
  };
  stats: Record<string, any>;
}

export function AdminClient() {
  const apiBase = getApiBaseUrl();
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [actions, setActions] = useState<Record<string, { loading: boolean; result: ActionResult | null }>>({});

  const fetchOverview = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/admin/overview`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        setOverview(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch overview", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 30000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const runAction = async (name: string, endpoint: string, method: string = "POST", body?: any) => {
    setActions((prev) => ({ ...prev, [name]: { loading: true, result: null } }));
    try {
      const opts: RequestInit = {
        method,
        signal: AbortSignal.timeout(30000),
        headers: body ? { "Content-Type": "application/json" } : {},
      };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(`${apiBase}${endpoint}`, opts);
      const data = await res.json();
      setActions((prev) => ({ ...prev, [name]: { loading: false, result: data } }));
      // Refresh overview after action
      setTimeout(fetchOverview, 1000);
    } catch (e: any) {
      setActions((prev) => ({
        ...prev,
        [name]: { loading: false, result: { action: name, status: "error", error: e.message } },
      }));
    }
  };

  const healthyOrgans = overview?.health?.healthy ?? 0;
  const totalOrgans = overview?.health?.total ?? 0;
  const allHealthy = healthyOrgans === totalOrgans;

  const veinStats = overview?.stats?.vein;
  const glandStats = overview?.stats?.gland;
  const trajectoryStats = overview?.stats?.trajectory;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <Shield size={20} className="text-primary" />
          <h1 className="text-lg font-semibold">System Admin</h1>
        </div>
        <button
          onClick={fetchOverview}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted px-3 text-xs font-medium hover:bg-accent"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {/* System Status */}
        <div className="mb-6 grid gap-4 sm:grid-cols-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              {allHealthy ? (
                <CheckCircle size={16} className="text-green-500" />
              ) : (
                <XCircle size={16} className="text-red-500" />
              )}
              <span className="text-sm font-medium">System Health</span>
            </div>
            <p className="text-2xl font-bold">{healthyOrgans}/{totalOrgans}</p>
            <p className="text-xs text-muted-foreground">organs online</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <HardDrive size={16} className="text-blue-500" />
              <span className="text-sm font-medium">File Store</span>
            </div>
            <p className="text-2xl font-bold">{veinStats?.store?.total_files ?? 0}</p>
            <p className="text-xs text-muted-foreground">files stored</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={16} className="text-amber-500" />
              <span className="text-sm font-medium">LLM Usage</span>
            </div>
            <p className="text-2xl font-bold">{glandStats?.total_tokens?.toLocaleString() ?? 0}</p>
            <p className="text-xs text-muted-foreground">tokens used</p>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity size={16} className="text-violet-500" />
              <span className="text-sm font-medium">Trajectories</span>
            </div>
            <p className="text-2xl font-bold">{trajectoryStats?.total_sessions ?? 0}</p>
            <p className="text-xs text-muted-foreground">sessions recorded</p>
          </div>
        </div>

        {/* Quick Actions */}
        <h2 className="mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">Quick Actions</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Clear Caches */}
          <ActionCard
            icon={<Trash2 size={18} />}
            title="Clear All Caches"
            description="Clear cached data across Vein, Reflex, and Voice components"
            color="text-red-500"
            bg="bg-red-500/10"
            loading={actions["clearCaches"]?.loading}
            result={actions["clearCaches"]?.result}
            onRun={() => runAction("clearCaches", "/api/admin/caches/clear")}
          />

          {/* Cleanup Expired */}
          <ActionCard
            icon={<RefreshCw size={18} />}
            title="Cleanup Expired Data"
            description="Remove expired sessions, uploads, sandboxes, and cache entries"
            color="text-amber-500"
            bg="bg-amber-500/10"
            loading={actions["cleanup"]?.loading}
            result={actions["cleanup"]?.result}
            onRun={() => runAction("cleanup", "/api/admin/cleanup")}
          />

          {/* Run Backup */}
          <ActionCard
            icon={<Database size={18} />}
            title="Run Backup Now"
            description="Create an immediate backup of knowledge bases and configuration"
            color="text-blue-500"
            bg="bg-blue-500/10"
            loading={actions["backup"]?.loading}
            result={actions["backup"]?.result}
            onRun={() => runAction("backup", "/api/admin/backup", "POST", {
              name: `backup-${new Date().toISOString().slice(0, 10)}`,
              description: "Manual backup via admin panel",
              include_knowledge: true,
              include_config: true,
              include_memories: true,
            })}
          />

          {/* Export Config */}
          <ActionCard
            icon={<Download size={18} />}
            title="Export System Config"
            description="Download current system configuration as JSON"
            color="text-green-500"
            bg="bg-green-500/10"
            loading={actions["exportConfig"]?.loading}
            result={actions["exportConfig"]?.result}
            onRun={async () => {
              setActions((prev) => ({ ...prev, exportConfig: { loading: true, result: null } }));
              try {
                const res = await fetch(`${apiBase}/api/admin/export/config`, { signal: AbortSignal.timeout(10000) });
                const data = await res.json();
                // Download as file
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `opensoul-config-${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                URL.revokeObjectURL(url);
                setActions((prev) => ({ ...prev, exportConfig: { loading: false, result: { action: "exportConfig", status: "ok" } } }));
              } catch (e: any) {
                setActions((prev) => ({ ...prev, exportConfig: { loading: false, result: { action: "exportConfig", status: "error", error: e.message } } }));
              }
            }}
          />

          {/* Health Check */}
          <ActionCard
            icon={<Activity size={18} />}
            title="Full Health Check"
            description="Run comprehensive health check on all 25+ components"
            color="text-violet-500"
            bg="bg-violet-500/10"
            loading={actions["healthCheck"]?.loading}
            result={actions["healthCheck"]?.result}
            onRun={() => runAction("healthCheck", "/api/diagnostics/check-all", "GET")}
          />

          {/* Refresh Overview */}
          <ActionCard
            icon={<Clock size={18} />}
            title="Refresh Overview"
            description="Force refresh system overview data from all components"
            color="text-cyan-500"
            bg="bg-cyan-500/10"
            loading={false}
            result={null}
            onRun={fetchOverview}
          />
        </div>

        {/* Organ Grid */}
        {overview?.health?.organs && (
          <>
            <h2 className="mt-8 mb-4 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Organ Status ({healthyOrgans}/{totalOrgans})
            </h2>
            <div className="grid gap-2 grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              {Object.entries(overview.health.organs).map(([name, status]) => (
                <div
                  key={name}
                  className={`rounded-md border px-3 py-2 text-center text-xs ${
                    status === "ok"
                      ? "border-green-500/30 bg-green-500/5 text-green-600"
                      : "border-red-500/30 bg-red-500/5 text-red-600"
                  }`}
                >
                  <div className="font-medium capitalize">{name}</div>
                  <div className="text-[10px] opacity-70">{status}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  title,
  description,
  color,
  bg,
  loading,
  result,
  onRun,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  bg: string;
  loading?: boolean;
  result: ActionResult | null;
  onRun: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 items-center justify-center rounded-md ${bg} ${color}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onRun}
          disabled={loading}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : null}
          {loading ? "Running..." : "Execute"}
        </button>

        {result && (
          <span className={`text-xs ${result.status === "ok" ? "text-green-500" : "text-red-500"}`}>
            {result.status === "ok" ? (
              <>
                <CheckCircle size={12} className="inline mr-1" />
                {result.cleared !== undefined
                  ? `Cleared ${result.cleared}/${result.total}`
                  : result.cleaned !== undefined
                  ? `Cleaned ${result.cleaned}/${result.total}`
                  : "Done"}
              </>
            ) : (
              <>
                <XCircle size={12} className="inline mr-1" />
                {result.error || "Failed"}
              </>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

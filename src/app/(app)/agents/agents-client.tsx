"use client";

import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import {
  Server, Bot, Users, RefreshCw, Loader2, Trash2,
  CheckCircle2, XCircle, AlertCircle, Zap, Activity,
  Search, Clock, Wifi, WifiOff,
} from "lucide-react";
import { useTranslation } from "react-i18next";

interface AgentNode {
  node_id: string;
  name?: string;
  status: string;
  last_heartbeat?: string;
  capabilities?: string[];
  endpoint?: string;
  version?: string;
}

interface AgentStats {
  total_nodes: number;
  online_count: number;
  offline_count: number;
  degraded_count?: number;
  uptime_hours?: number;
  requests_total?: number;
}

interface HealthStatus {
  status: string;
  message?: string;
  timestamp?: string;
}

export function AgentsClient() {
  const { t } = useTranslation();
  const [nodes, setNodes] = useState<AgentNode[]>([]);
  const [stats, setStats] = useState<AgentStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectResult, setDetectResult] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) {
      setError(t("agents.noApiBase", "API base URL not configured"));
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError("");
    
    try {
      const [nodesRes, statsRes, healthRes] = await Promise.all([
        fetch(`${apiBase}/api/agent/nodes`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => ({ nodes: [] })),
        fetch(`${apiBase}/api/agent/stats`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => null),
        fetch(`${apiBase}/api/agent/health`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => null),
      ]);
      
      setNodes(Array.isArray(nodesRes) ? nodesRes : nodesRes.nodes || []);
      setStats(statsRes);
      setHealth(healthRes);
    } catch (e: unknown) {
      setError(t("agents.fetchError", "Failed to load agent data: {{error}}", {
        error: e instanceof Error ? e.message : String(e)
      }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const removeNode = async (nodeId: string) => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    
    try {
      const res = await fetch(`${apiBase}/api/agent/nodes/${nodeId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      });
      
      if (res.ok) {
        setNodes(prev => prev.filter(n => n.node_id !== nodeId));
        setDeleteConfirm(null);
      } else {
        setError(t("agents.deleteFailed", "Failed to remove node: {{status}}", { status: res.status }));
      }
    } catch (e: unknown) {
      setError(t("agents.deleteError", "Delete error: {{error}}", {
        error: e instanceof Error ? e.message : String(e)
      }));
    }
  };

  const detectAgents = async () => {
    const apiBase = getApiBaseUrl();
    if (!apiBase) return;
    
    setDetecting(true);
    setDetectResult(null);
    
    try {
      const res = await fetch(`${apiBase}/api/agents/detect`, { signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const data = await res.json();
        setDetectResult(t("agents.detectSuccess", "Detected {{count}} agents", { 
          count: data.agents?.length || data.count || 0 
        }));
        // Refresh the list after detection
        fetchAll();
      } else {
        setDetectResult(t("agents.detectFailed", "Detection failed: {{status}}", { status: res.status }));
      }
    } catch (e: unknown) {
      setDetectResult(t("agents.detectError", "Detection error: {{error}}", {
        error: e instanceof Error ? e.message : String(e)
      }));
    } finally {
      setDetecting(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case "online":
      case "healthy":
      case "active":
        return { bg: "bg-emerald-500/10", text: "text-emerald-400", border: "border-emerald-500/20" };
      case "offline":
      case "unhealthy":
      case "inactive":
        return { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/20" };
      case "degraded":
      case "warning":
        return { bg: "bg-amber-500/10", text: "text-amber-400", border: "border-amber-500/20" };
      default:
        return { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" };
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case "online":
      case "healthy":
      case "active":
        return <CheckCircle2 className="h-3.5 w-3.5" />;
      case "offline":
      case "unhealthy":
      case "inactive":
        return <XCircle className="h-3.5 w-3.5" />;
      case "degraded":
      case "warning":
        return <AlertCircle className="h-3.5 w-3.5" />;
      default:
        return <Activity className="h-3.5 w-3.5" />;
    }
  };

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
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
              <Server className="h-5 w-5 text-primary" />
              {t("agents.title", "Agent Nodes")}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("agents.subtitle", "Manage and monitor registered agent nodes")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={detectAgents}
              disabled={detecting}
              className={cn(
                "flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors",
                detecting 
                  ? "bg-muted text-muted-foreground cursor-not-allowed" 
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              {detecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              {t("agents.detect", "Detect Agents")}
            </button>
            <button
              onClick={fetchAll}
              className="rounded-lg border border-border p-2 hover:bg-accent transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Detect Result */}
        {detectResult && (
          <div className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
            {detectResult}
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Stats Cards */}
        <div className="mt-4 flex flex-wrap gap-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Server className="h-3.5 w-3.5" />
              {t("agents.totalNodes", "Total Nodes")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-foreground">
              {stats?.total_nodes || nodes.length}
            </div>
          </div>
          
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Wifi className="h-3.5 w-3.5" />
              {t("agents.online", "Online")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-emerald-400">
              {stats?.online_count ?? nodes.filter(n => n.status === "online" || n.status === "healthy" || n.status === "active").length}
            </div>
          </div>
          
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-red-400">
              <WifiOff className="h-3.5 w-3.5" />
              {t("agents.offline", "Offline")}
            </div>
            <div className="mt-1 text-2xl font-semibold text-red-400">
              {stats?.offline_count ?? nodes.filter(n => n.status === "offline" || n.status === "unhealthy" || n.status === "inactive").length}
            </div>
          </div>
          
          {stats?.degraded_count !== undefined && stats.degraded_count > 0 && (
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-amber-400">
                <AlertCircle className="h-3.5 w-3.5" />
                {t("agents.degraded", "Degraded")}
              </div>
              <div className="mt-1 text-2xl font-semibold text-amber-400">
                {stats.degraded_count}
              </div>
            </div>
          )}
          
          {health && (
            <div className={cn(
              "rounded-lg border px-4 py-3",
              health.status === "ok" || health.status === "healthy"
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-red-500/20 bg-red-500/5"
            )}>
              <div className={cn(
                "flex items-center gap-2 text-xs",
                health.status === "ok" || health.status === "healthy"
                  ? "text-emerald-400"
                  : "text-red-400"
              )}>
                <Zap className="h-3.5 w-3.5" />
                {t("agents.healthStatus", "Health")}
              </div>
              <div className={cn(
                "mt-1 text-2xl font-semibold",
                health.status === "ok" || health.status === "healthy"
                  ? "text-emerald-400"
                  : "text-red-400"
              )}>
                {health.status.toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-6">
        {nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Server className="h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">{t("agents.noNodes", "No agent nodes found")}</p>
            <p className="mt-1 text-sm">
              {t("agents.noNodesHint", "Try detecting available agents or check your configuration")}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nodes.map((node) => {
              const statusColors = getStatusColor(node.status);
              const isDeleting = deleteConfirm === node.node_id;
              
              return (
                <div
                  key={node.node_id}
                  className={cn(
                    "group rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/30 hover:shadow-md"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <Bot className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="font-medium text-foreground">
                          {node.name || node.node_id}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          {node.node_id}
                        </div>
                      </div>
                    </div>
                    <div className={cn(
                      "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      statusColors.bg, statusColors.text, statusColors.border, "border"
                    )}>
                      {getStatusIcon(node.status)}
                      {node.status}
                    </div>
                  </div>

                  {node.endpoint && (
                    <div className="mt-3 text-xs text-muted-foreground">
                      <span className="font-medium">{t("agents.endpoint", "Endpoint")}:</span>{" "}
                      <code className="rounded bg-muted px-1.5 py-0.5">{node.endpoint}</code>
                    </div>
                  )}

                  {node.version && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">{t("agents.version", "Version")}:</span> {node.version}
                    </div>
                  )}

                  {node.capabilities && node.capabilities.length > 0 && (
                    <div className="mt-3">
                      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                        {t("agents.capabilities", "Capabilities")}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {node.capabilities.map((cap) => (
                          <span
                            key={cap}
                            className="rounded bg-accent px-2 py-0.5 text-[11px] text-foreground"
                          >
                            {cap}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {node.last_heartbeat && (
                    <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      {t("agents.lastHeartbeat", "Last heartbeat: {{time}}", {
                        time: new Date(node.last_heartbeat).toLocaleString()
                      })}
                    </div>
                  )}

                  <div className="mt-4 flex items-center justify-end border-t border-border pt-3">
                    {isDeleting ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => removeNode(node.node_id)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 transition-colors"
                        >
                          {t("agents.confirmDelete", "Confirm")}
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
                        >
                          {t("agents.cancel", "Cancel")}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(node.node_id)}
                        className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("agents.remove", "Remove")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  RefreshCw, Plus, Play, Pause, Trash2,
  Camera, Terminal, Settings, Box, Loader2, Layers,
  Sparkles,
} from "lucide-react";

interface Sandbox {
  sandbox_id: string;
  name: string;
  status: string;
  created_at: number;
  snapshot_count: number;
  log_count: number;
}

export function MirrorClient() {
  const { t } = useTranslation();
  const [sandboxes, setSandboxes] = useState<Sandbox[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [selected, setSelected] = useState<Sandbox | null>(null);
  const [logs, setLogs] = useState<any[]>([]);
  const [variables, setVariables] = useState<any>({});
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [loading, setLoading] = useState(false);
  const [logMessage, setLogMessage] = useState("");
  const [varKey, setVarKey] = useState("");
  const [varValue, setVarValue] = useState("");
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/mirror/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchSandboxes = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/mirror/sandboxes`);
      const data = await res.json();
      setSandboxes(data.sandboxes || []);
    } catch {}
  }, [apiBase]);

  const fetchLogs = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/api/mirror/sandboxes/${id}/logs`);
      const data = await res.json();
      setLogs(data.logs || []);
    } catch {}
  }, [apiBase]);

  const fetchVariables = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${apiBase}/api/mirror/sandboxes/${id}/variables`);
      const data = await res.json();
      setVariables(data.variables || {});
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    fetchSandboxes();
  }, [fetchHealth, fetchSandboxes]);

  useEffect(() => {
    if (selected) {
      fetchLogs(selected.sandbox_id);
      fetchVariables(selected.sandbox_id);
    }
  }, [selected, fetchLogs, fetchVariables]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/mirror/sandboxes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(""); setNewDesc("");
        fetchSandboxes();
        fetchHealth();
      }
    } catch {} finally { setLoading(false); }
  };

  const handleSnapshot = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}/snapshot`, { method: "POST" });
      fetchSandboxes();
    } catch {}
  };

  const handlePause = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}/pause`, { method: "POST" });
      fetchSandboxes();
      if (selected?.sandbox_id === id) {
        setSelected({ ...selected, status: "paused" });
      }
    } catch {}
  };

  const handleResume = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}/resume`, { method: "POST" });
      fetchSandboxes();
      if (selected?.sandbox_id === id) {
        setSelected({ ...selected, status: "active" });
      }
    } catch {}
  };

  const handleDestroy = async (id: string) => {
    if (!confirm("确定销毁此沙箱？")) return;
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}`, { method: "DELETE" });
      setSelected(null);
      fetchSandboxes();
      fetchHealth();
    } catch {}
  };

  const handleAddLog = async (id: string) => {
    if (!logMessage.trim()) return;
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: "info", message: logMessage }),
      });
      setLogMessage("");
      fetchLogs(id);
    } catch {}
  };

  const handleSetVariable = async (id: string) => {
    if (!varKey.trim()) return;
    try {
      await fetch(`${apiBase}/api/mirror/sandboxes/${id}/variables`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: varKey, value: varValue }),
      });
      setVarKey(""); setVarValue("");
      fetchVariables(id);
    } catch {}
  };

  const handleCleanup = async () => {
    try {
      await fetch(`${apiBase}/api/mirror/cleanup`, { method: "POST" });
      fetchSandboxes();
      fetchHealth();
    } catch {}
  };

  const statusColor = (s: string) => {
    if (s === "active") return "text-emerald-500";
    if (s === "paused") return "text-amber-500";
    return "text-muted-foreground";
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Layers size={20} className="text-indigo-500" />
          <h1 className="text-lg font-semibold">{t("mirror.title") || "镜像 · 沙箱测试"}</h1>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
            沙箱测试
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCleanup}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted">
            <Sparkles size={12} /> 清理过期
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm text-white hover:bg-indigo-600">
            <Plus size={14} /> 新建沙箱
          </button>
          <button onClick={() => { fetchHealth(); fetchSandboxes(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">总沙箱</span>
              <p className="text-2xl font-bold">{health.total_sandboxes || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">活跃</span>
              <p className="text-2xl font-bold text-emerald-500">{health.active || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">暂停</span>
              <p className="text-2xl font-bold text-amber-500">{health.paused || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">存储目录</span>
              <p className="text-xs font-mono truncate mt-1">{health.sandbox_dir}</p>
            </div>
          </div>
        )}

        <div className="flex gap-6">
          {/* Sandbox List */}
          <div className="w-80 space-y-3">
            {sandboxes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Box size={40} className="mb-3 opacity-30" />
                <p className="text-sm">暂无沙箱</p>
              </div>
            ) : sandboxes.map((sb) => (
              <div key={sb.sandbox_id}
                onClick={() => setSelected(sb)}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 cursor-pointer transition-all hover:shadow-md",
                  selected?.sandbox_id === sb.sandbox_id && "ring-2 ring-indigo-500"
                )}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{sb.name}</span>
                  <span className={cn("text-xs", statusColor(sb.status))}>{sb.status}</span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>快照: {sb.snapshot_count}</span>
                  <span>日志: {sb.log_count}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{selected.name}</h3>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full",
                    selected.status === "active" ? "bg-emerald-500/10 text-emerald-500" :
                    selected.status === "paused" ? "bg-amber-500/10 text-amber-500" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {selected.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  {selected.status === "active" ? (
                    <button onClick={() => handlePause(selected.sandbox_id)}
                      className="flex items-center gap-1 rounded-lg border border-amber-500/30 px-3 py-1.5 text-xs text-amber-600 hover:bg-amber-500/10">
                      <Pause size={12} /> 暂停
                    </button>
                  ) : selected.status === "paused" ? (
                    <button onClick={() => handleResume(selected.sandbox_id)}
                      className="flex items-center gap-1 rounded-lg border border-emerald-500/30 px-3 py-1.5 text-xs text-emerald-600 hover:bg-emerald-500/10">
                      <Play size={12} /> 恢复
                    </button>
                  ) : null}
                  <button onClick={() => handleSnapshot(selected.sandbox_id)}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <Camera size={12} /> 快照
                  </button>
                  <button onClick={() => handleDestroy(selected.sandbox_id)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10">
                    <Trash2 size={12} /> 销毁
                  </button>
                </div>
              </div>

              {/* Variables */}
              <div className="rounded-xl border border-border p-4">
                <h4 className="text-sm font-medium mb-2">变量</h4>
                {Object.keys(variables).length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无变量</p>
                ) : (
                  <div className="space-y-1 mb-3">
                    {Object.entries(variables).map(([k, v]) => (
                      <div key={k} className="flex gap-2 text-xs">
                        <span className="font-mono text-indigo-500">{k}</span>
                        <span className="text-muted-foreground">=</span>
                        <span className="font-mono">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <input value={varKey} onChange={(e) => setVarKey(e.target.value)}
                    placeholder="键" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <input value={varValue} onChange={(e) => setVarValue(e.target.value)}
                    placeholder="值" className="flex-1 rounded border border-border bg-background px-2 py-1 text-xs" />
                  <button onClick={() => handleSetVariable(selected.sandbox_id)}
                    className="rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600">
                    设置
                  </button>
                </div>
              </div>

              {/* Logs */}
              <div className="rounded-xl border border-border p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">日志 ({logs.length})</h4>
                  <div className="flex gap-2">
                    <input value={logMessage} onChange={(e) => setLogMessage(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleAddLog(selected.sandbox_id)}
                      placeholder="添加日志..." className="rounded border border-border bg-background px-2 py-1 text-xs w-48" />
                    <button onClick={() => handleAddLog(selected.sandbox_id)}
                      className="rounded bg-indigo-500 px-2 py-1 text-xs text-white hover:bg-indigo-600">
                      添加
                    </button>
                  </div>
                </div>
                <div className="max-h-60 overflow-y-auto space-y-1">
                  {logs.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无日志</p>
                  ) : logs.map((l, i) => (
                    <div key={i} className="flex gap-2 text-xs">
                      <span className="text-muted-foreground shrink-0">{new Date(l.ts * 1000).toLocaleTimeString("zh-CN")}</span>
                      <span className={cn("font-mono", l.level === "error" ? "text-red-500" : l.level === "warn" ? "text-amber-500" : "text-foreground")}>
                        {l.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold">新建沙箱</h3>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="沙箱名称" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="描述 (可选)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
                <button onClick={handleCreate} disabled={loading}
                  className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : "创建"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

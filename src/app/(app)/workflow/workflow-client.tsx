"use client";
import { useState, useEffect, useCallback } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  Calendar,
  Workflow,
  Filter,
  Loader2,
  AlertCircle,
  CheckCircle,
  Zap,
  Settings,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { getApiBaseUrl, getToken } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

type TaskStatus = "active" | "draft" | "paused" | "completed" | "failed";

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  status: string;
  trigger: string;
  trigger_config: Record<string, unknown>;
  variables: Record<string, unknown>;
  created_at: number;
  updated_at: number;
  node_count: number;
  edge_count: number;
  execution_count: number;
  last_execution: {
    id: string;
    status: string;
    started_at: number;
    finished_at: number | null;
  } | null;
}

const statusConfig: Record<string, { variant: "default" | "success" | "warning" | "destructive"; label: string }> = {
  active: { variant: "success", label: "Active" },
  draft: { variant: "default", label: "Draft" },
  paused: { variant: "warning", label: "Paused" },
  completed: { variant: "success", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
};

const filters: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
];

export function WorkflowClient() {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Create form
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTrigger, setNewTrigger] = useState("manual");

  const apiBase = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const url = activeFilter === "all"
        ? `${apiBase}/api/will/workflows`
        : `${apiBase}/api/will/workflows?status=${activeFilter}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      }
    } catch (e) {
      console.error("Failed to fetch workflows:", e);
    }
    setLoading(false);
  }, [apiBase, activeFilter]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleExecute = async (wf: WorkflowItem) => {
    setActionLoading((prev) => ({ ...prev, [wf.id]: "execute" }));
    try {
      const res = await fetch(`${apiBase}/api/will/workflows/${wf.id}/execute`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      if (res.ok) {
        showToast(`${wf.name} 执行成功`, "success");
        fetchWorkflows();
      } else {
        const data = await res.json();
        showToast(data.detail || "执行失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
    setActionLoading((prev) => ({ ...prev, [wf.id]: "" }));
  };

  const handleTogglePause = async (wf: WorkflowItem) => {
    const newStatus = wf.status === "paused" ? "active" : "paused";
    setActionLoading((prev) => ({ ...prev, [wf.id]: "toggle" }));
    try {
      const res = await fetch(`${apiBase}/api/will/workflows/${wf.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        showToast(`${wf.name} ${newStatus === "paused" ? "已暂停" : "已激活"}`, "success");
        fetchWorkflows();
      }
    } catch {
      showToast("操作失败", "error");
    }
    setActionLoading((prev) => ({ ...prev, [wf.id]: "" }));
  };

  const handleDelete = async (wf: WorkflowItem) => {
    try {
      const res = await fetch(`${apiBase}/api/will/workflows/${wf.id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        showToast(`${wf.name} 已删除`, "success");
        setDeleteTarget(null);
        fetchWorkflows();
      }
    } catch {
      showToast("删除失败", "error");
    }
  };

  const handleCreate = async () => {
    if (!newName) {
      showToast("名称必填", "error");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/will/workflows`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newName,
          description: newDesc,
          trigger: newTrigger,
        }),
      });
      if (res.ok) {
        showToast(`${newName} 已创建`, "success");
        setShowCreate(false);
        setNewName("");
        setNewDesc("");
        setNewTrigger("manual");
        fetchWorkflows();
      } else {
        const data = await res.json();
        showToast(data.detail || "创建失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  };

  const filtered = workflows;

  return (
    <div className="flex h-full flex-col">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Workflow size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">Workflows</h2>
            <p className="text-xs text-muted-foreground">
              {workflows.filter((w) => w.status === "active").length} active · {workflows.length} total
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchWorkflows}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowCreate(!showCreate)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
            <Plus size={14} />
            New Workflow
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        <Filter size={13} className="mr-1 text-muted-foreground" />
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              activeFilter === f.value
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Create form */}
        {showCreate && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Plus size={14} /> 创建新工作流
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="工作流名称 *" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="描述" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <select value={newTrigger} onChange={(e) => setNewTrigger(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                <option value="manual">手动触发</option>
                <option value="cron">定时触发</option>
                <option value="event">事件触发</option>
                <option value="webhook">Webhook</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button onClick={handleCreate} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">创建</button>
            </div>
          </div>
        )}

        {/* Workflow list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Workflow className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">
              {activeFilter === "all" ? "No workflows yet" : `No ${activeFilter} workflows`}
            </h3>
            <p className="mb-4 max-w-xs text-xs text-muted-foreground">
              {activeFilter === "all"
                ? "Create your first workflow to automate repetitive tasks."
                : "Try changing the filter to see other workflows."}
            </p>
            {activeFilter === "all" && (
              <button onClick={() => setShowCreate(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Plus size={14} /> Create Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((wf) => {
              const config = statusConfig[wf.status] || statusConfig.draft;
              const busy = actionLoading[wf.id];

              return (
                <div key={wf.id} className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="text-sm font-medium">{wf.name}</h3>
                        <Badge variant={config.variant}>{config.label}</Badge>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{wf.trigger}</span>
                      </div>
                      {wf.description && (
                        <p className="mb-2 text-xs text-muted-foreground">{wf.description}</p>
                      )}
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          {new Date(wf.created_at * 1000).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Zap size={11} />
                          {wf.node_count} nodes · {wf.edge_count} edges
                        </span>
                        <span className="flex items-center gap-1">
                          <Play size={11} />
                          {wf.execution_count} runs
                        </span>
                        {wf.last_execution && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            最后执行: {new Date(wf.last_execution.started_at * 1000).toLocaleString()}
                            ({wf.last_execution.status})
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {(wf.status === "draft" || wf.status === "paused" || wf.status === "active") && (
                        <button onClick={() => handleExecute(wf)} disabled={!!busy}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="执行">
                          {busy === "execute" ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        </button>
                      )}
                      {(wf.status === "active" || wf.status === "paused") && (
                        <button onClick={() => handleTogglePause(wf)} disabled={!!busy}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title={wf.status === "paused" ? "恢复" : "暂停"}>
                          {busy === "toggle" ? <Loader2 size={13} className="animate-spin" /> : wf.status === "paused" ? <Play size={13} /> : <Pause size={13} />}
                        </button>
                      )}
                      <button onClick={() => setDeleteTarget(wf)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="删除">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <h3 className="text-sm font-medium mb-2">删除工作流</h3>
            <p className="text-xs text-muted-foreground mb-4">
              确定删除 &quot;{deleteTarget.name}&quot;？此操作不可撤销。
            </p>
            <div className="rounded-lg border border-border bg-muted/50 p-3 mb-4">
              <div className="flex items-center gap-2">
                <Workflow size={14} className="text-muted-foreground" />
                <span className="text-sm font-medium">{deleteTarget.name}</span>
              </div>
              {deleteTarget.description && (
                <p className="mt-1 text-xs text-muted-foreground">{deleteTarget.description}</p>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteTarget(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent">
                取消
              </button>
              <button onClick={() => handleDelete(deleteTarget)}
                className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

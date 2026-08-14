"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  GitBranch, Play, Pause, Trash2, RefreshCw, Plus, CheckCircle2,
  XCircle, Clock, Activity, Settings, ChevronRight, Workflow,
  CircleDot, ArrowRight, Eye, Zap,
} from "lucide-react";

interface WorkflowNode {
  id: string;
  node_type: string;
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

interface WorkflowEdge {
  id: string;
  source_node_id: string;
  target_node_id: string;
  condition: string | null;
  label: string;
}

interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  status: string;
  trigger: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  created_at: string;
  updated_at: string;
  run_count: number;
  last_run_at: string | null;
}

interface Execution {
  id: string;
  workflow_id: string;
  workflow_name: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  steps: Array<{
    node_id: string;
    node_label: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    output_data: Record<string, unknown>;
    error: string | null;
    duration_ms: number;
  }>;
  variables: Record<string, unknown>;
  error: string | null;
}

interface WillStats {
  total_workflows: number;
  active_workflows: number;
  total_executions: number;
  successful: number;
  failed: number;
  running: number;
  success_rate: number;
}

export function WillClient() {
  const { t } = useTranslation();
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [stats, setStats] = useState<WillStats | null>(null);
  const [selectedWf, setSelectedWf] = useState<WorkflowItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [showExecDetail, setShowExecDetail] = useState<Execution | null>(null);
  const apiBase = getApiBaseUrl();

  const fetchAll = useCallback(async () => {
    try {
      const [wfsRes, execsRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/api/will/workflows`),
        fetch(`${apiBase}/api/will/executions?limit=20`),
        fetch(`${apiBase}/api/will/stats`),
      ]);
      const [wfsData, execsData, statsData] = await Promise.all([
        wfsRes.json(), execsRes.json(), statsRes.json(),
      ]);
      setWorkflows(wfsData.workflows || []);
      setExecutions(execsData.executions || []);
      setStats(statsData);
    } catch (e) {
      console.error("Failed to fetch will data", e);
    }
  }, [apiBase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      await fetch(`${apiBase}/api/will/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, description: newDesc }),
      });
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      await fetchAll();
    } catch (e) {
      console.error("Create failed", e);
    }
  };

  const handleExecute = async (wfId: string) => {
    try {
      await fetch(`${apiBase}/api/will/workflows/${wfId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: {} }),
      });
      await fetchAll();
    } catch (e) {
      console.error("Execute failed", e);
    }
  };

  const handleDelete = async (wfId: string) => {
    if (!confirm("确定删除此工作流？")) return;
    try {
      await fetch(`${apiBase}/api/will/workflows/${wfId}`, { method: "DELETE" });
      if (selectedWf?.id === wfId) setSelectedWf(null);
      await fetchAll();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleStatusToggle = async (wf: WorkflowItem) => {
    const newStatus = wf.status === "active" ? "paused" : "active";
    try {
      await fetch(`${apiBase}/api/will/workflows/${wf.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await fetchAll();
    } catch (e) {
      console.error("Status toggle failed", e);
    }
  };

  const formatTime = (iso: string | null) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      });
    } catch { return iso; }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "active": case "success": return "text-emerald-500 bg-emerald-500/10";
      case "running": return "text-blue-500 bg-blue-500/10";
      case "failed": case "cancelled": return "text-red-500 bg-red-500/10";
      case "paused": case "waiting": return "text-amber-500 bg-amber-500/10";
      default: return "text-muted-foreground bg-muted";
    }
  };

  const nodeTypeIcon = (type: string) => {
    switch (type) {
      case "trigger": return <Zap size={12} className="text-yellow-500" />;
      case "action": return <Play size={12} className="text-blue-500" />;
      case "condition": return <GitBranch size={12} className="text-amber-500" />;
      case "delay": return <Clock size={12} className="text-violet-500" />;
      case "end": return <CheckCircle2 size={12} className="text-emerald-500" />;
      default: return <CircleDot size={12} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <GitBranch size={20} className="text-violet-500" />
          <h1 className="text-lg font-semibold">{t("will.title") || "意志 · 工作流引擎"}</h1>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-500">
            {t("will.subtitle") || "编排 · 条件 · 执行"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            新建工作流
          </button>
          <button
            onClick={fetchAll}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} />
            刷新
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard icon={Workflow} label="工作流" value={String(stats.total_workflows)} sub={`${stats.active_workflows} 活跃`} color="text-violet-500" bg="bg-violet-500/10" />
            <StatCard icon={Activity} label="总执行" value={String(stats.total_executions)} sub={`成功率 ${stats.success_rate}%`} color="text-blue-500" bg="bg-blue-500/10" />
            <StatCard icon={CheckCircle2} label="成功" value={String(stats.successful)} sub="执行完成" color="text-emerald-500" bg="bg-emerald-500/10" />
            <StatCard icon={XCircle} label="失败" value={String(stats.failed)} sub="执行失败" color="text-red-500" bg="bg-red-500/10" />
            <StatCard icon={Clock} label="运行中" value={String(stats.running)} sub="正在执行" color="text-amber-500" bg="bg-amber-500/10" />
          </div>
        )}

        {/* Create Form */}
        {showCreate && (
          <div className="rounded-xl border border-primary/30 bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold">创建工作流</h3>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="工作流名称"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="描述（可选）"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <div className="flex gap-2">
              <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                创建
              </button>
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
                取消
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Workflow List */}
          <div className="lg:col-span-1 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">工作流列表</h3>
            {workflows.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Workflow size={32} className="mb-2 opacity-30" />
                <p className="text-sm">暂无工作流</p>
                <p className="text-xs mt-1">点击"新建工作流"开始</p>
              </div>
            ) : (
              <div className="space-y-2">
                {workflows.map((wf) => (
                  <div
                    key={wf.id}
                    onClick={() => setSelectedWf(wf)}
                    className={cn(
                      "rounded-xl border p-4 cursor-pointer transition-all",
                      selectedWf?.id === wf.id ? "border-primary bg-primary/5" : "border-border hover:border-primary/30 bg-card",
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium truncate">{wf.name}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(wf.status))}>
                        {wf.status}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate mb-2">{wf.description || "无描述"}</p>
                    <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                      <span>{wf.nodes.length} 节点</span>
                      <span>{wf.edges.length} 连接</span>
                      <span>执行 {wf.run_count} 次</span>
                    </div>
                    <div className="flex items-center gap-1 mt-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleExecute(wf.id); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                        title="执行"
                      >
                        <Play size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStatusToggle(wf); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10 transition-colors"
                        title={wf.status === "active" ? "暂停" : "激活"}
                      >
                        <Pause size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
                        className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Workflow Detail / DAG View */}
          <div className="lg:col-span-2 space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {selectedWf ? `${selectedWf.name} · DAG视图` : "选择一个工作流查看"}
            </h3>
            {selectedWf ? (
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                {/* Nodes */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">节点 ({selectedWf.nodes.length})</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedWf.nodes.map((node) => (
                      <div key={node.id} className="flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs">
                        {nodeTypeIcon(node.node_type)}
                        <span className="font-medium">{node.label || node.node_type}</span>
                        <span className="text-muted-foreground">({node.node_type})</span>
                      </div>
                    ))}
                    {selectedWf.nodes.length === 0 && (
                      <p className="text-xs text-muted-foreground">暂无节点 — 通过 API 添加</p>
                    )}
                  </div>
                </div>

                {/* Edges */}
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">连接 ({selectedWf.edges.length})</h4>
                  <div className="space-y-1">
                    {selectedWf.edges.map((edge) => (
                      <div key={edge.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{edge.source_node_id.slice(-6)}</span>
                        <ArrowRight size={10} />
                        <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{edge.target_node_id.slice(-6)}</span>
                        {edge.condition && (
                          <span className="text-amber-500">if: {edge.condition}</span>
                        )}
                      </div>
                    ))}
                    {selectedWf.edges.length === 0 && (
                      <p className="text-xs text-muted-foreground">暂无连接</p>
                    )}
                  </div>
                </div>

                {/* Meta */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="text-muted-foreground">触发方式</span>
                    <p className="font-medium mt-0.5">{selectedWf.trigger}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="text-muted-foreground">执行次数</span>
                    <p className="font-medium mt-0.5">{selectedWf.run_count}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="text-muted-foreground">创建时间</span>
                    <p className="font-medium mt-0.5">{formatTime(selectedWf.created_at)}</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-3">
                    <span className="text-muted-foreground">最后执行</span>
                    <p className="font-medium mt-0.5">{formatTime(selectedWf.last_run_at)}</p>
                  </div>
                </div>

                {/* Execute Button */}
                <button
                  onClick={() => handleExecute(selectedWf.id)}
                  className="w-full rounded-lg bg-emerald-600 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Play size={14} />
                  执行工作流
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Eye size={40} className="mb-3 opacity-20" />
                <p className="text-sm">从左侧选择工作流查看详情</p>
              </div>
            )}
          </div>
        </div>

        {/* Execution History */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity size={14} className="text-violet-500" />
            执行历史
            <span className="text-xs text-muted-foreground font-normal">最近 {executions.length} 条</span>
          </h3>
          {executions.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">暂无执行记录</p>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">工作流</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">状态</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-20">步骤</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-36">开始时间</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-20">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {executions.map((exec) => (
                    <tr key={exec.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5 font-medium">{exec.workflow_name}</td>
                      <td className="px-4 py-2.5">
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(exec.status))}>
                          {exec.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{exec.steps.length}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(exec.started_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => setShowExecDetail(exec)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Execution Detail Modal */}
        {showExecDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowExecDetail(null)}>
            <div className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl border border-border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">执行详情: {showExecDetail.workflow_name}</h3>
                <button onClick={() => setShowExecDetail(null)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              <div className="space-y-2">
                {showExecDetail.steps.map((step, i) => (
                  <div key={step.node_id} className="flex items-start gap-3 rounded-lg border border-border p-3">
                    <span className="text-xs font-mono text-muted-foreground w-6 text-right">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        {nodeTypeIcon("")}
                        <span className="text-sm font-medium">{step.node_label || step.node_id}</span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", statusColor(step.status))}>
                          {step.status}
                        </span>
                      </div>
                      {step.error && <p className="text-xs text-red-500 mt-1">{step.error}</p>}
                      {step.duration_ms > 0 && <p className="text-[10px] text-muted-foreground mt-1">{step.duration_ms.toFixed(1)}ms</p>}
                    </div>
                  </div>
                ))}
              </div>
              {showExecDetail.error && (
                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-500">
                  {showExecDetail.error}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon size={14} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

"use client"

import { useEffect, useState, useCallback } from "react"
import { getApiBaseUrl } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  Sparkles, Plus, Play, Trash2, RefreshCw, Workflow, CheckCircle,
  XCircle, Loader2, Clock, Activity, ChevronRight, GitBranch,
  AlertTriangle, Pause, Eye,
} from "lucide-react"

interface WorkflowNode {
  id: string
  node_type: string
  label: string
  config: Record<string, unknown>
}

interface WorkflowEdge {
  id: string
  source_node_id: string
  target_node_id: string
  condition: string | null
  label: string
}

interface WorkflowItem {
  id: string
  name: string
  description: string
  status: string
  trigger: string
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: Record<string, unknown>
  created_at: string
  updated_at: string
  run_count: number
  last_run_at: string | null
}

interface Execution {
  id: string
  workflow_id: string
  workflow_name: string
  status: string
  started_at: string
  completed_at: string | null
  steps: Array<{
    node_id: string
    node_label: string
    status: string
    started_at: string | null
    completed_at: string | null
    output_data: Record<string, unknown>
    error: string | null
    duration_ms: number
  }>
  variables: Record<string, unknown>
  error: string | null
  trigger_type: string
}

interface WillHealth {
  status: string
  component: string
  engine: {
    total_workflows: number
    active_workflows: number
    total_executions: number
    successful: number
    failed: number
    running: number
    success_rate: number
  }
}

type ActiveTab = "overview" | "workflows" | "executions"

export function WillClient() {
  const apiBase = getApiBaseUrl()
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")
  const [health, setHealth] = useState<WillHealth | null>(null)
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([])
  const [executions, setExecutions] = useState<Execution[]>([])
  const [loading, setLoading] = useState(true)
  const [executing, setExecuting] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // Create workflow form
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState({ name: "", description: "", trigger: "manual" })

  // Expanded workflow
  const [expandedWf, setExpandedWf] = useState<string | null>(null)

  // Execution detail
  const [selectedExec, setSelectedExec] = useState<Execution | null>(null)

  const refresh = useCallback(async () => {
    try {
      const [h, w, e] = await Promise.all([
        fetch(`${apiBase}/api/will/health`).then(r => r.json()),
        fetch(`${apiBase}/api/will/workflows`).then(r => r.json()).catch(() => ({ workflows: [] })),
        fetch(`${apiBase}/api/will/executions?limit=30`).then(r => r.json()).catch(() => ({ executions: [] })),
      ])
      setHealth(h)
      setWorkflows(w.workflows || [])
      setExecutions(e.executions || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [apiBase])

  useEffect(() => { refresh() }, [refresh])

  const showMsg = (type: "ok" | "err", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreate = async () => {
    if (!createForm.name) return
    try {
      const res = await fetch(`${apiBase}/api/will/workflows`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createForm.name,
          description: createForm.description,
          trigger: createForm.trigger,
        }),
      })
      if (res.ok) {
        showMsg("ok", "工作流创建成功")
        setShowCreate(false)
        setCreateForm({ name: "", description: "", trigger: "manual" })
        refresh()
      } else {
        const err = await res.json()
        showMsg("err", err.detail || "创建失败")
      }
    } catch (e: any) {
      showMsg("err", e.message || "网络错误")
    }
  }

  const handleExecute = async (wfId: string) => {
    setExecuting(wfId)
    try {
      const res = await fetch(`${apiBase}/api/will/workflows/${wfId}/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables: {} }),
      })
      if (res.ok) {
        const data = await res.json()
        showMsg("ok", `执行已启动: ${data.id}`)
        refresh()
      } else {
        const err = await res.json()
        showMsg("err", err.detail || "执行失败")
      }
    } catch (e: any) {
      showMsg("err", e.message || "网络错误")
    }
    setExecuting(null)
  }

  const handleDelete = async (wfId: string) => {
    if (!confirm("确认删除此工作流？")) return
    setDeleting(wfId)
    try {
      await fetch(`${apiBase}/api/will/workflows/${wfId}`, { method: "DELETE" })
      showMsg("ok", "工作流已删除")
      refresh()
    } catch (e: any) {
      showMsg("err", e.message || "删除失败")
    }
    setDeleting(null)
  }

  const handleValidate = async (wfId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/will/workflows/${wfId}/validate`)
      const data = await res.json()
      if (data.valid) {
        showMsg("ok", "工作流验证通过 ✓")
      } else {
        showMsg("err", `验证失败: ${data.errors.join(", ")}`)
      }
    } catch (e: any) {
      showMsg("err", e.message || "验证失败")
    }
  }

  const statusColor = (s: string) => {
    switch (s) {
      case "completed": case "active": return "text-green-400 bg-green-500/10 border-green-500/30"
      case "running": return "text-blue-400 bg-blue-500/10 border-blue-500/30"
      case "failed": case "error": return "text-red-400 bg-red-500/10 border-red-500/30"
      case "cancelled": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30"
      case "draft": case "paused": return "text-muted-foreground bg-muted border-border"
      default: return "text-muted-foreground bg-muted border-border"
    }
  }

  const statusIcon = (s: string) => {
    switch (s) {
      case "completed": return <CheckCircle className="w-3.5 h-3.5" />
      case "running": return <Loader2 className="w-3.5 h-3.5 animate-spin" />
      case "failed": case "error": return <XCircle className="w-3.5 h-3.5" />
      case "cancelled": return <Pause className="w-3.5 h-3.5" />
      default: return <Clock className="w-3.5 h-3.5" />
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const eng = health?.engine
  const tabs: Array<{ key: ActiveTab; label: string; icon: typeof Sparkles }> = [
    { key: "overview", label: "概览", icon: Activity },
    { key: "workflows", label: "工作流", icon: Workflow },
    { key: "executions", label: "执行记录", icon: Clock },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Will — 意志系统</h1>
            <p className="text-sm text-muted-foreground">工作流编排、条件触发、多分支流程</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-2 mt-4">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t-lg transition-colors",
                  activeTab === tab.key
                    ? "bg-card border border-b-0 border-border text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={cn(
          "mx-6 mb-2 flex items-center gap-2 p-3 rounded-lg border text-sm",
          message.type === "ok"
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-red-500/30 bg-red-500/10 text-red-400"
        )}>
          {message.type === "ok" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "总工作流", value: eng?.total_workflows ?? 0, icon: Workflow, color: "text-blue-400", bg: "from-blue-500/20 to-blue-600/10" },
                { label: "活跃", value: eng?.active_workflows ?? 0, icon: CheckCircle, color: "text-green-400", bg: "from-green-500/20 to-green-600/10" },
                { label: "总执行", value: eng?.total_executions ?? 0, icon: Play, color: "text-purple-400", bg: "from-purple-500/20 to-purple-600/10" },
                { label: "成功率", value: `${(eng?.success_rate ?? 0).toFixed(0)}%`, icon: Activity, color: "text-amber-400", bg: "from-amber-500/20 to-amber-600/10" },
              ].map(s => (
                <div key={s.label} className={cn("rounded-xl border border-border bg-gradient-to-br p-4", s.bg)}>
                  <s.icon className={cn("w-4 h-4 mb-2", s.color)} />
                  <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Execution Stats */}
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: "成功", value: eng?.successful ?? 0, color: "text-green-400" },
                { label: "失败", value: eng?.failed ?? 0, color: "text-red-400" },
                { label: "运行中", value: eng?.running ?? 0, color: "text-blue-400" },
              ].map(s => (
                <div key={s.label} className="p-4 rounded-xl border border-border bg-card text-center">
                  <div className={cn("text-xl font-bold", s.color)}>{s.value}</div>
                  <div className="text-xs text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Recent Workflows */}
            {workflows.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-3">最近工作流</h3>
                <div className="space-y-2">
                  {workflows.slice(0, 5).map(wf => (
                    <div key={wf.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
                      <Workflow className="w-4 h-4 text-indigo-400" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{wf.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {wf.nodes.length} 节点 · {wf.edges.length} 连接 · 执行 {wf.run_count} 次
                        </div>
                      </div>
                      <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs border", statusColor(wf.status))}>
                        {statusIcon(wf.status)} {wf.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Workflows Tab ── */}
        {activeTab === "workflows" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">工作流管理</h3>
              <div className="flex gap-2">
                <button onClick={refresh} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreate(!showCreate)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" /> 新建工作流
                </button>
              </div>
            </div>

            {/* Create Form */}
            {showCreate && (
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">名称 *</label>
                    <input value={createForm.name} onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="每日数据同步" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">触发方式</label>
                    <select value={createForm.trigger} onChange={e => setCreateForm({ ...createForm, trigger: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="manual">手动触发</option>
                      <option value="cron">定时触发</option>
                      <option value="event">事件触发</option>
                      <option value="webhook">Webhook</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">描述</label>
                    <input value={createForm.description} onChange={e => setCreateForm({ ...createForm, description: e.target.value })}
                      placeholder="工作流描述 (可选)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreate(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">取消</button>
                  <button onClick={handleCreate} disabled={!createForm.name}
                    className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40">创建</button>
                </div>
              </div>
            )}

            {/* Workflow List */}
            <div className="space-y-2">
              {workflows.map(wf => (
                <div key={wf.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <Workflow className="w-5 h-5 text-indigo-400" />
                        <div>
                          <div className="text-sm font-semibold text-foreground">{wf.name}</div>
                          {wf.description && <div className="text-xs text-muted-foreground mt-0.5">{wf.description}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs border", statusColor(wf.status))}>
                          {statusIcon(wf.status)} {wf.status}
                        </span>
                        <span className="text-xs text-muted-foreground px-2 py-0.5 rounded bg-muted">{wf.trigger}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><GitBranch className="w-3 h-3" /> {wf.nodes.length} 节点</span>
                      <span>{wf.edges.length} 连接</span>
                      <span>执行 {wf.run_count} 次</span>
                      {wf.last_run_at && <span>最后: {new Date(wf.last_run_at).toLocaleString("zh-CN")}</span>}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 mt-3">
                      <button onClick={() => handleExecute(wf.id)} disabled={executing === wf.id || wf.status === "draft"}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40">
                        {executing === wf.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        执行
                      </button>
                      <button onClick={() => handleValidate(wf.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                        <CheckCircle className="w-3 h-3" /> 验证
                      </button>
                      <button onClick={() => setExpandedWf(expandedWf === wf.id ? null : wf.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-muted text-muted-foreground hover:text-foreground transition-colors">
                        <Eye className="w-3 h-3" /> 详情
                      </button>
                      <button onClick={() => handleDelete(wf.id)} disabled={deleting === wf.id}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-md text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40">
                        {deleting === wf.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        删除
                      </button>
                    </div>
                  </div>

                  {/* Expanded Detail */}
                  {expandedWf === wf.id && (
                    <div className="border-t border-border p-4 bg-muted/30">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground mb-2">节点</h4>
                          {wf.nodes.length > 0 ? (
                            <div className="space-y-1">
                              {wf.nodes.map(n => (
                                <div key={n.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-card border border-border">
                                  <span className="w-2 h-2 rounded-full bg-indigo-400" />
                                  <span className="text-foreground font-medium">{n.label || n.node_type}</span>
                                  <span className="text-muted-foreground">({n.node_type})</span>
                                </div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-muted-foreground">无节点</div>}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-muted-foreground mb-2">连接</h4>
                          {wf.edges.length > 0 ? (
                            <div className="space-y-1">
                              {wf.edges.map(e => (
                                <div key={e.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-card border border-border">
                                  <span className="text-muted-foreground">{e.source_node_id.slice(0, 6)}</span>
                                  <ChevronRight className="w-3 h-3 text-muted-foreground" />
                                  <span className="text-muted-foreground">{e.target_node_id.slice(0, 6)}</span>
                                  {e.condition && <span className="text-amber-400">if: {e.condition}</span>}
                                </div>
                              ))}
                            </div>
                          ) : <div className="text-xs text-muted-foreground">无连接</div>}
                        </div>
                      </div>
                      {Object.keys(wf.variables).length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-xs font-semibold text-muted-foreground mb-2">变量</h4>
                          <div className="flex gap-2 flex-wrap">
                            {Object.entries(wf.variables).map(([k, v]) => (
                              <span key={k} className="px-2 py-0.5 rounded text-xs bg-card border border-border">
                                <span className="text-foreground">{k}</span>=<span className="text-muted-foreground">{String(v)}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {workflows.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Workflow className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  暂无工作流
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Executions Tab ── */}
        {activeTab === "executions" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">执行记录</h3>
              <button onClick={refresh} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {/* Execution Detail Modal */}
            {selectedExec && (
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-foreground">执行详情: {selectedExec.id.slice(0, 8)}</h4>
                  <button onClick={() => setSelectedExec(null)} className="text-muted-foreground hover:text-foreground">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">工作流:</span> <span className="text-foreground">{selectedExec.workflow_name}</span></div>
                  <div><span className="text-muted-foreground">状态:</span> <span className={cn("px-1.5 py-0.5 rounded border", statusColor(selectedExec.status))}>{selectedExec.status}</span></div>
                  <div><span className="text-muted-foreground">开始:</span> <span className="text-foreground">{new Date(selectedExec.started_at).toLocaleString("zh-CN")}</span></div>
                  {selectedExec.completed_at && <div><span className="text-muted-foreground">完成:</span> <span className="text-foreground">{new Date(selectedExec.completed_at).toLocaleString("zh-CN")}</span></div>}
                </div>
                {selectedExec.steps.length > 0 && (
                  <div>
                    <h5 className="text-xs font-semibold text-muted-foreground mb-2">步骤</h5>
                    <div className="space-y-1">
                      {selectedExec.steps.map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs p-2 rounded bg-muted/30">
                          <span className={cn("flex items-center gap-1", statusColor(step.status))}>
                            {statusIcon(step.status)}
                          </span>
                          <span className="text-foreground font-medium">{step.node_label || step.node_id}</span>
                          {step.duration_ms > 0 && <span className="text-muted-foreground">({step.duration_ms}ms)</span>}
                          {step.error && <span className="text-red-400 truncate">{step.error}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedExec.error && (
                  <div className="p-2 rounded bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                    <AlertTriangle className="w-3 h-3 inline mr-1" />{selectedExec.error}
                  </div>
                )}
              </div>
            )}

            {/* Execution List */}
            <div className="space-y-2">
              {executions.map(ex => (
                <div key={ex.id} onClick={() => setSelectedExec(ex)}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card cursor-pointer hover:border-primary/30 transition-colors">
                  <span className={cn("flex items-center gap-1 px-2 py-0.5 rounded text-xs border", statusColor(ex.status))}>
                    {statusIcon(ex.status)} {ex.status}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground truncate">{ex.workflow_name || ex.workflow_id}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ex.started_at).toLocaleString("zh-CN")}
                      {ex.completed_at && ` → ${new Date(ex.completed_at).toLocaleString("zh-CN")}`}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{ex.steps.length} 步骤</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              ))}
              {executions.length === 0 && (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Clock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  暂无执行记录
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { CronPicker } from "@/components/cron-picker";
import {
  Clock,
  Plus,
  Play,
  Pause,
  Trash2,
  Filter,
  Search,
  Bot,
  Bell,
  Settings2,
  RotateCcw,
  Calendar,
  ChevronRight,
  Timer,
  AlertCircle,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────

type TaskStatus = "running" | "paused" | "completed" | "failed";
type TaskType = "agent" | "system" | "notify";

interface CronTask {
  id: string;
  name: string;
  cron: string;
  type: TaskType;
  status: TaskStatus;
  description: string;
  nextRun: string | null;
  lastRun: string | null;
  lastDuration: string | null;
  createdAt: string;
  retryCount: number;
  retryInterval: number;
  params: Record<string, unknown>;
  executions: Execution[];
}

interface Execution {
  id: string;
  startTime: string;
  duration: string;
  status: "success" | "failed" | "running";
  output: string;
}

// ── Mock Data ──────────────────────────────────────────────────────

const mockTasks: CronTask[] = [
  {
    id: "cron-1",
    name: "每日知识同步",
    cron: "0 8 * * *",
    type: "agent",
    status: "running",
    description: "从连接的数据源同步并索引新文档，由知识管理 Agent 执行。",
    nextRun: "明天 08:00",
    lastRun: "今天 08:00",
    lastDuration: "2m 34s",
    createdAt: "2024-01-15",
    retryCount: 3,
    retryInterval: 60,
    params: { agentId: "agent-knowledge", sources: ["notion", "obsidian"] },
    executions: [
      { id: "e1", startTime: "2024-01-20 08:00", duration: "2m 34s", status: "success", output: "同步完成：新增 12 篇文档，更新 5 篇。" },
      { id: "e2", startTime: "2024-01-19 08:00", duration: "1m 58s", status: "success", output: "同步完成：新增 3 篇文档。" },
      { id: "e3", startTime: "2024-01-18 08:00", duration: "0s", status: "failed", output: "错误：数据源连接超时，已自动重试 3 次。" },
    ],
  },
  {
    id: "cron-2",
    name: "周报生成",
    cron: "0 9 * * 1",
    type: "agent",
    status: "running",
    description: "每周一早上自动生成本周活动与洞察报告。",
    nextRun: "下周一 09:00",
    lastRun: "周一 09:00",
    lastDuration: "5m 12s",
    createdAt: "2024-01-10",
    retryCount: 2,
    retryInterval: 120,
    params: { agentId: "agent-report", template: "weekly" },
    executions: [
      { id: "e4", startTime: "2024-01-20 09:00", duration: "5m 12s", status: "success", output: "周报已生成并发送至邮箱。" },
    ],
  },
  {
    id: "cron-3",
    name: "配置备份",
    cron: "0 0 * * *",
    type: "system",
    status: "paused",
    description: "每日零点备份所有 Agent 配置到本地存储。",
    nextRun: null,
    lastRun: "2024-01-15 00:00",
    lastDuration: "45s",
    createdAt: "2024-01-08",
    retryCount: 1,
    retryInterval: 30,
    params: { target: "/backups/agents", compress: true },
    executions: [
      { id: "e5", startTime: "2024-01-15 00:00", duration: "45s", status: "success", output: "备份完成：8 个配置文件已压缩存储。" },
    ],
  },
  {
    id: "cron-4",
    name: "每日摘要推送",
    cron: "30 18 * * *",
    type: "notify",
    status: "running",
    description: "每天 18:30 向用户推送当日知识更新摘要。",
    nextRun: "今天 18:30",
    lastRun: "昨天 18:30",
    lastDuration: "12s",
    createdAt: "2024-01-12",
    retryCount: 2,
    retryInterval: 30,
    params: { channel: "wechat", template: "daily-digest" },
    executions: [
      { id: "e6", startTime: "2024-01-19 18:30", duration: "12s", status: "success", output: "摘要已推送至微信。" },
      { id: "e7", startTime: "2024-01-18 18:30", duration: "8s", status: "success", output: "摘要已推送至微信。" },
    ],
  },
  {
    id: "cron-5",
    name: "邮件摘要",
    cron: "0 17 * * 5",
    type: "notify",
    status: "failed",
    description: "每周五下午发送本周知识更新邮件摘要。",
    nextRun: null,
    lastRun: "上周五 17:00",
    lastDuration: "0s",
    createdAt: "2024-01-12",
    retryCount: 3,
    retryInterval: 60,
    params: { channel: "email", recipients: ["user@example.com"] },
    executions: [
      { id: "e8", startTime: "2024-01-17 17:00", duration: "0s", status: "failed", output: "错误：SMTP 服务器连接失败。" },
    ],
  },
  {
    id: "cron-6",
    name: "技能自动更新",
    cron: "0 3 * * 0",
    type: "system",
    status: "running",
    description: "每周日凌晨 3 点检查并更新已安装的技能到最新版本。",
    nextRun: "下周日 03:00",
    lastRun: "周日 03:00",
    lastDuration: "1m 20s",
    createdAt: "2024-01-14",
    retryCount: 1,
    retryInterval: 300,
    params: { autoUpdate: true, notifyOnUpdate: true },
    executions: [
      { id: "e9", startTime: "2024-01-19 03:00", duration: "1m 20s", status: "success", output: "检查完成：2 个技能已更新。" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────

const statusConfig: Record<TaskStatus, { variant: "default" | "success" | "warning" | "destructive"; label: string }> = {
  running: { variant: "success", label: "运行中" },
  paused: { variant: "warning", label: "已暂停" },
  completed: { variant: "default", label: "已完成" },
  failed: { variant: "destructive", label: "失败" },
};

const typeConfig: Record<TaskType, { icon: typeof Bot; label: string; color: string }> = {
  agent: { icon: Bot, label: "Agent 任务", color: "text-blue-400" },
  system: { icon: Settings2, label: "系统任务", color: "text-emerald-400" },
  notify: { icon: Bell, label: "通知任务", color: "text-amber-400" },
};

const filters: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "running", label: "运行中" },
  { value: "paused", label: "已暂停" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

function parseCronShort(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return expr;
  const [min, hour, , , dow] = parts;
  const dowMap: Record<string, string> = { "0": "日", "1": "一", "2": "二", "3": "三", "4": "四", "5": "五", "6": "六", "1-5": "工作日" };
  if (dow !== "*") {
    const day = dowMap[dow] ?? dow;
    return hour !== "*" ? `每${day} ${hour}:${min.padStart(2, "0")}` : `每${day}`;
  }
  if (hour !== "*") return `每天 ${hour}:${min.padStart(2, "0")}`;
  if (min !== "*") return `每小时 :${min.padStart(2, "0")}`;
  return expr;
}

// ── Sub-components ─────────────────────────────────────────────────

function TypeIcon({ type, size = 14 }: { type: TaskType; size?: number }) {
  const cfg = typeConfig[type];
  return <cfg.icon size={size} className={cfg.color} />;
}

function EmptyState({ filter }: { filter: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="mb-2 text-sm font-medium">
        {filter === "all" ? "暂无定时任务" : `没有${filters.find((f) => f.value === filter)?.label ?? ""}的任务`}
      </h3>
      <p className="mb-4 max-w-xs text-xs text-muted-foreground">
        {filter === "all"
          ? "创建你的第一个定时任务，自动化重复工作。"
          : "尝试切换筛选条件查看其他任务。"}
      </p>
    </div>
  );
}

// ── Create Task Dialog ─────────────────────────────────────────────

interface CreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  onCreate: (task: Omit<CronTask, "id" | "createdAt" | "lastRun" | "lastDuration" | "nextRun" | "executions">) => void;
}

function CreateTaskDialog({ open, onClose, onCreate }: CreateTaskDialogProps) {
  const [name, setName] = useState("");
  const [cron, setCron] = useState("0 8 * * *");
  const [type, setType] = useState<TaskType>("agent");
  const [description, setDescription] = useState("");
  const [paramsText, setParamsText] = useState("{}");
  const [retryCount, setRetryCount] = useState(3);
  const [retryInterval, setRetryInterval] = useState(60);
  const [paramsError, setParamsError] = useState<string | null>(null);

  function handleSubmit() {
    let params: Record<string, unknown> = {};
    try {
      params = JSON.parse(paramsText);
      setParamsError(null);
    } catch {
      setParamsError("JSON 格式无效");
      return;
    }
    if (!name.trim()) return;
    onCreate({ name: name.trim(), cron, type, status: "running", description: description.trim(), retryCount, retryInterval, params });
    setName("");
    setCron("0 8 * * *");
    setType("agent");
    setDescription("");
    setParamsText("{}");
    setRetryCount(3);
    setRetryInterval(60);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="创建定时任务"
      description="配置一个新的定时任务，支持 Cron 表达式调度。"
      className="max-w-xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">取消</button>
          <button onClick={handleSubmit} disabled={!name.trim()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">创建任务</button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">任务名称</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：每日知识同步" className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>

        {/* Cron */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">调度规则</label>
          <CronPicker value={cron} onChange={setCron} />
        </div>

        {/* Type */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">任务类型</label>
          <div className="flex gap-2">
            {(Object.keys(typeConfig) as TaskType[]).map((t) => {
              const cfg = typeConfig[t];
              return (
                <button key={t} onClick={() => setType(t)} className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs transition-colors ${type === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
                  <cfg.icon size={13} className={type === t ? cfg.color : ""} />
                  {cfg.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">任务描述</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="描述这个任务的用途..." rows={2} className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
        </div>

        {/* Params */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-foreground">执行参数 (JSON)</label>
          <textarea value={paramsText} onChange={(e) => { setParamsText(e.target.value); setParamsError(null); }} placeholder='{"key": "value"}' rows={3} className={`w-full rounded-md border bg-muted px-3 py-1.5 font-mono text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none ${paramsError ? "border-destructive" : "border-border"}`} />
          {paramsError && <p className="text-[11px] text-destructive">{paramsError}</p>}
        </div>

        {/* Retry */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">重试次数</label>
            <input type="number" min={0} max={10} value={retryCount} onChange={(e) => setRetryCount(parseInt(e.target.value) || 0)} className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">重试间隔 (秒)</label>
            <input type="number" min={10} max={3600} value={retryInterval} onChange={(e) => setRetryInterval(parseInt(e.target.value) || 60)} className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ── Main Component ─────────────────────────────────────────────────

export function CronClient() {
  const router = useRouter();
  const [tasks, setTasks] = useState(mockTasks);
  const [activeFilter, setActiveFilter] = useState<TaskStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CronTask | null>(null);

  const filtered = useMemo(() => {
    let list = activeFilter === "all" ? tasks : tasks.filter((t) => t.status === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q));
    }
    return list;
  }, [tasks, activeFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: tasks.length,
    running: tasks.filter((t) => t.status === "running").length,
    paused: tasks.filter((t) => t.status === "paused").length,
    failed: tasks.filter((t) => t.status === "failed").length,
  }), [tasks]);

  function togglePause(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: t.status === "paused" ? "running" : "paused" } : t)
    );
  }

  function handleRun(id: string) {
    setTasks((prev) =>
      prev.map((t) => t.id === id ? { ...t, status: "running" as const } : t)
    );
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
  }

  function handleCreate(taskData: Omit<CronTask, "id" | "createdAt" | "lastRun" | "lastDuration" | "nextRun" | "executions">) {
    const newTask: CronTask = {
      ...taskData,
      id: `cron-${Date.now()}`,
      createdAt: new Date().toISOString().slice(0, 10),
      lastRun: null,
      lastDuration: null,
      nextRun: "计算中...",
      executions: [],
    };
    setTasks((prev) => [newTask, ...prev]);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Clock size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">定时任务</h2>
            <p className="text-xs text-muted-foreground">
              {stats.running} 运行中 · {stats.paused} 已暂停 · {stats.total} 总计
            </p>
          </div>
        </div>
        <button onClick={() => setShowCreate(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus size={14} />
          创建任务
        </button>
      </div>

      {/* Filters & Search */}
      <div className="flex items-center justify-between border-b border-border px-6 py-2">
        <div className="flex items-center gap-1">
          <Filter size={13} className="mr-1 text-muted-foreground" />
          {filters.map((f) => (
            <button key={f.value} onClick={() => setActiveFilter(f.value)} className={`rounded-md px-2.5 py-1 text-xs transition-colors ${activeFilter === f.value ? "bg-primary/15 text-primary font-medium" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索任务..." className="h-7 w-48 rounded-md border border-border bg-muted pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary" />
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <EmptyState filter={activeFilter} />
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => {
              const { variant, label } = statusConfig[task.status];
              return (
                <div key={task.id} onClick={() => router.push(`/cron/${task.id}`)} className="group cursor-pointer rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <TypeIcon type={task.type} />
                        <h3 className="text-sm font-medium truncate">{task.name}</h3>
                        <Badge variant={variant}>{label}</Badge>
                      </div>
                      <p className="mb-2.5 text-xs text-muted-foreground line-clamp-1">{task.description}</p>

                      {/* Cron & schedule info */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono">
                          <Clock size={10} />
                          {task.cron}
                        </span>
                        <span className="text-foreground/70">{parseCronShort(task.cron)}</span>
                        {task.nextRun && (
                          <span className="flex items-center gap-1">
                            <Calendar size={10} />
                            下次：{task.nextRun}
                          </span>
                        )}
                        {task.lastRun && (
                          <span className="flex items-center gap-1">
                            <Timer size={10} />
                            上次：{task.lastRun} ({task.lastDuration})
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 shrink-0 ml-4">
                      {(task.status === "paused" || task.status === "failed") && (
                        <button onClick={(e) => { e.stopPropagation(); handleRun(task.id); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="运行">
                          <Play size={13} />
                        </button>
                      )}
                      {task.status === "running" && (
                        <button onClick={(e) => { e.stopPropagation(); togglePause(task.id); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="暂停">
                          <Pause size={13} />
                        </button>
                      )}
                      {task.status === "paused" && (
                        <button onClick={(e) => { e.stopPropagation(); togglePause(task.id); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title="恢复">
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(task); }} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive" title="删除">
                        <Trash2 size={13} />
                      </button>
                      <ChevronRight size={14} className="ml-1 text-muted-foreground" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create dialog */}
      <CreateTaskDialog open={showCreate} onClose={() => setShowCreate(false)} onCreate={handleCreate} />

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="删除定时任务"
        description={`确定要删除 "${deleteTarget?.name}" 吗？此操作不可撤销。`}
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground">取消</button>
            <button onClick={() => deleteTarget && handleDelete(deleteTarget.id)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">删除</button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <TypeIcon type={deleteTarget?.type ?? "system"} />
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{deleteTarget?.description}</p>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Dna, Target, History, BarChart3, RefreshCw,
  CheckCircle2, XCircle, Clock, Zap, Brain,
  Wrench, Shield, BookOpen, Gauge, Star, Activity,
  Loader2, ChevronDown, ChevronRight, Layers,
} from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { LeftPanel } from "@/components/left-panel";
import { useAppStore } from "@/stores/app-store";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

const API_BASE =
  typeof window !== "undefined"
    ? `http://${window.location.hostname}:8092`
    : "http://127.0.0.1:8092";

/* ── Types ── */

interface StrandStatus {
  strand_id: string;
  strategy: string;
  role: string;
  running: boolean;
  cycle_count: number;
  observations: number;
  observations_unanalyzed: number;
  partner_alive: boolean;
  partner_cycle_count: number;
  my_plans_for_partner: number;
  partner_plans_for_me: number;
  memories: number;
}

interface EngineStatus {
  running: boolean;
  strand_a: StrandStatus;
  strand_b: StrandStatus;
  mechanism: string;
  description: string;
}

interface EvolutionGoal {
  goal_id: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  progress: number;
  created_at: string;
  completed_at: string | null;
}

interface EvolutionCycle {
  strand_id: string;
  cycle_id?: string;
  cycle_count?: number;
  improvements_count?: number;
  improvements?: number;
  success: boolean;
  timestamp: string;
  executed_by?: string;
}

interface LogEntry {
  ts: string;
  strand: string;
  stage: string;
  msg: string;
  cycle?: number;
  details?: string;
}

/* ── Constants ── */

const STAGE_COLORS: Record<string, string> = {
  turn: "#5b8cff", observe: "#06b6d4", plan: "#a855f7", plan_review: "#c084fc",
  implement: "#f59e0b", execute: "#f97316", evaluate: "#eab308", reflect: "#34d399",
  verdict: "#22c55e", error: "#ef4444", start: "#6b7280", submit: "#10b981",
  verify: "#8b5cf6", code_review: "#ec4899", locate: "#14b8a6",
  turn_debug: "#f43f5e", receive: "#0ea5e9", plan_pipeline: "#7c3aed",
  execute_partner: "#d946ef", execute_partners: "#e879f9",
};

const STAGE_LABELS: Record<string, string> = {
  turn: "开始", observe: "观察", plan: "规划", plan_review: "审查",
  implement: "实现", execute: "执行", evaluate: "评估", reflect: "反思",
  verdict: "判定", error: "错误", start: "启动", submit: "提交",
  verify: "验证", code_review: "代码审查", locate: "定位",
  turn_debug: "调试", receive: "接收", plan_pipeline: "流水线",
  execute_partner: "伙伴执行", execute_partners: "伙伴们执行",
};

const STAGE_ICON: Record<string, string> = {
  turn: "▶", observe: "🔍", plan: "📝", plan_review: "👀",
  implement: "🔧", execute: "⚡", evaluate: "📊", reflect: "💡",
  verdict: "✅", error: "❌", start: "🚀", submit: "📤",
  verify: "🔬", code_review: "🔎", locate: "📍",
};

const GOAL_ICONS: Record<string, React.ElementType> = {
  "成为全球最聪明的agent": Star,
  "自编程能力": Brain,
  "工具创造": Wrench,
  "错误自修复": Shield,
  "知识积累": BookOpen,
  "性能优化": Gauge,
};

const PRIORITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f59e0b", medium: "#3b82f6", low: "#6b7280",
};

/* ── Helpers ── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}秒`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}秒`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}分${Math.round((ms % 60000) / 1000)}秒`;
  return `${(ms / 3600000).toFixed(1)}小时`;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ── Gantt Task type ── */

interface GanttTask {
  id: string;
  strand: string;
  cycle: number;
  startTime: string;
  endTime: string | null;
  status: "running" | "success" | "error";
  steps: Array<{ stage: string; ts: string; msg: string }>;
  summary: string;
}

/* ── ECharts Gantt Chart ── */

function GanttChart({
  tasks,
  selectedId,
  onSelect,
}: {
  tasks: GanttTask[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const categories = tasks.map(t => `${t.strand === "strand_a" ? "螺旋A" : "螺旋B"} #${t.cycle}`);
  const now = Date.now();
  const statusColors: Record<string, string> = { running: "#3b82f6", success: "#22c55e", error: "#ef4444" };

  const barData = tasks.map((t, i) => ({
    name: t.id,
    value: [i, new Date(t.startTime).getTime(), t.endTime ? new Date(t.endTime).getTime() : now],
    itemStyle: {
      color: {
        type: "linear" as const, x: 0, y: 0, x2: 1, y2: 0,
        colorStops: [
          { offset: 0, color: statusColors[t.status] + "cc" },
          { offset: 1, color: statusColors[t.status] },
        ],
      },
      borderRadius: [0, 4, 4, 0],
    },
  }));

  const scatterData: any[] = [];
  tasks.forEach((t, i) => {
    t.steps.forEach(s => {
      if (["plan", "implement", "evaluate", "reflect", "verdict", "error"].includes(s.stage)) {
        scatterData.push({
          value: [i, new Date(s.ts).getTime()],
          itemStyle: { color: STAGE_COLORS[s.stage] || "#6b7280" },
        });
      }
    });
  });

  const option = {
    backgroundColor: "transparent",
    animation: true,
    tooltip: {
      trigger: "item" as const,
      backgroundColor: "rgba(15,20,30,0.95)",
      borderColor: "rgba(148,163,184,0.15)",
      textStyle: { color: "#e8eef7", fontSize: 12 },
      formatter: (params: any) => {
        if (params.seriesIndex === 0) {
          const idx = params.value[0];
          const t = tasks[idx];
          if (!t) return "";
          const ms = t.endTime ? new Date(t.endTime).getTime() - new Date(t.startTime).getTime() : 0;
          return `<div style="max-width:280px"><div style="font-weight:600;margin-bottom:4px">${t.strand === "strand_a" ? "螺旋A" : "螺旋B"} #${t.cycle}</div><div style="color:#93a0b4;font-size:11px">${t.summary || "无摘要"}</div><div style="margin-top:6px;font-size:11px"><span style="color:${statusColors[t.status]}">● ${t.status}</span> · ${formatDuration(ms)} · ${t.steps.length} 步骤</div></div>`;
        }
        return "";
      },
    },
    dataZoom: [
      { type: "inside" as const, xAxisIndex: 0, filterMode: "none" as const },
      { type: "inside" as const, yAxisIndex: 0, filterMode: "none" as const },
    ],
    grid: { left: 80, right: 16, top: 12, bottom: 24 },
    xAxis: {
      type: "time" as const,
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } },
      axisTick: { show: false },
      axisLabel: { color: "#6b7a90", fontSize: 10 },
      splitLine: { show: true, lineStyle: { color: "rgba(148,163,184,0.05)" } },
    },
    yAxis: {
      type: "category" as const,
      data: categories,
      inverse: true,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: "#93a0b4", fontSize: 11 },
    },
    series: [
      { name: "进化任务", type: "bar" as const, barWidth: 16, encode: { x: [1, 2], y: 0 }, data: barData },
      { name: "进化节点", type: "scatter" as const, symbolSize: 7, data: scatterData },
    ],
  };

  const onEvents = {
    click: (params: any) => {
      if (params.seriesIndex === 0 && params.value?.[0] !== undefined) {
        const t = tasks[params.value[0]];
        if (t) onSelect(t.id);
      }
    },
  };

  return (
    <ReactECharts
      option={option}
      style={{ width: "100%", height: Math.max(200, tasks.length * 34 + 50) }}
      onEvents={onEvents}
      opts={{ renderer: "canvas" }}
    />
  );
}

/* ── Overview Chart ── */

function OverviewChart({ tasks }: { tasks: GanttTask[] }) {
  const dayMap = new Map<string, { success: number; error: number; running: number }>();
  tasks.forEach(t => {
    const dk = t.startTime.slice(0, 10);
    if (!dayMap.has(dk)) dayMap.set(dk, { success: 0, error: 0, running: 0 });
    const d = dayMap.get(dk)!;
    d[t.status as keyof typeof d]++;
  });
  const days = [...dayMap.keys()].sort();

  let level = 42;
  const levelSeries = days.map(d => {
    const dayTasks = tasks.filter(t => t.startTime.slice(0, 10) === d);
    level = Math.min(100, level + dayTasks.filter(t => t.status === "success").length * 2);
    return Number(level.toFixed(1));
  });

  const option = {
    backgroundColor: "transparent",
    animationDuration: 700,
    tooltip: { trigger: "axis" as const, backgroundColor: "rgba(15,20,30,0.95)", borderColor: "rgba(148,163,184,0.15)", textStyle: { color: "#e8eef7", fontSize: 12 } },
    grid: { left: 40, right: 40, top: 16, bottom: 24 },
    xAxis: {
      type: "category" as const, data: days.map(d => d.slice(5)),
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.15)" } }, axisTick: { show: false }, axisLabel: { color: "#6b7a90", fontSize: 10 },
    },
    yAxis: [
      { type: "value" as const, splitLine: { lineStyle: { color: "rgba(148,163,184,0.06)" } }, axisLabel: { color: "#6b7a90", fontSize: 10 } },
      { type: "value" as const, min: 0, max: 100, splitLine: { show: false }, axisLabel: { color: "#6b7a90", fontSize: 10 } },
    ],
    series: [
      { name: "成功", type: "bar" as const, stack: "total", barWidth: 14, itemStyle: { color: "#22c55e" }, data: days.map(d => dayMap.get(d)?.success || 0) },
      { name: "失败", type: "bar" as const, stack: "total", barWidth: 14, itemStyle: { color: "#ef4444" }, data: days.map(d => dayMap.get(d)?.error || 0) },
      { name: "进行中", type: "bar" as const, stack: "total", barWidth: 14, itemStyle: { color: "#3b82f6", borderRadius: [4, 4, 0, 0] }, data: days.map(d => dayMap.get(d)?.running || 0) },
      {
        name: "能力指数", type: "line" as const, yAxisIndex: 1, smooth: true, symbol: "circle", symbolSize: 6,
        lineStyle: { width: 2.5, color: "#5b8cff" }, itemStyle: { color: "#5b8cff", borderColor: "#0b0f14", borderWidth: 2 },
        areaStyle: { color: { type: "linear" as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: "rgba(91,140,255,0.25)" }, { offset: 1, color: "rgba(91,140,255,0)" }] } },
        data: levelSeries, z: 3,
      },
    ],
  };

  return <ReactECharts option={option} style={{ width: "100%", height: 200 }} opts={{ renderer: "canvas" }} />;
}

/* ── Detail Panel ── */

function DetailPanel({ task }: { task: GanttTask | null }) {
  if (!task) {
    return (
      <div style={{ display: "grid", placeContent: "center", minHeight: 200, textAlign: "center", color: "var(--muted-foreground)", gap: 8 }}>
        <Activity size={28} style={{ opacity: 0.3, margin: "0 auto" }} />
        <p className="text-xs">点击甘特图查看任务详情</p>
      </div>
    );
  }

  const statusColor = task.status === "success" ? "#22c55e" : task.status === "error" ? "#ef4444" : "#3b82f6";
  const statusLabel = task.status === "success" ? "成功" : task.status === "error" ? "失败" : "进行中";
  const ms = task.endTime ? new Date(task.endTime).getTime() - new Date(task.startTime).getTime() : 0;
  const stages = [...new Set(task.steps.map(s => s.stage))];

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${task.strand === "strand_a" ? "bg-blue-500/15 text-blue-400" : "bg-purple-500/15 text-purple-400"}`}>
          {task.strand === "strand_a" ? "螺旋A" : "螺旋B"} · #{task.cycle}
        </span>
        <span className="text-[10px] flex items-center gap-1" style={{ color: statusColor }}>● {statusLabel}</span>
      </div>
      <p className="text-xs text-foreground mb-2 leading-relaxed">{task.summary || `进化周期 #${task.cycle}`}</p>
      <div className="flex flex-wrap gap-1.5 mb-3">
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">{formatTime(task.startTime)}</span>
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">{formatDuration(ms)}</span>
        <span className="text-[10px] text-muted-foreground border border-border rounded-full px-2 py-0.5">{task.steps.length} 步骤</span>
      </div>
      <div className="flex flex-wrap gap-1 mb-3">
        {stages.map(s => (
          <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: STAGE_COLORS[s] || "#93a0b4", background: `${STAGE_COLORS[s] || "#6b7280"}1a` }}>
            {STAGE_LABELS[s] || s}
          </span>
        ))}
      </div>
      <ol className="space-y-1">
        {task.steps.map((s, i) => (
          <li key={i} className="flex gap-2 text-[11px] text-muted-foreground leading-relaxed">
            <span className="w-4 h-4 rounded-full flex items-center justify-center shrink-0 text-[9px] font-bold mt-0.5" style={{ background: `${STAGE_COLORS[s.stage] || "#6b7280"}1a`, color: STAGE_COLORS[s.stage] || "#6b7280" }}>{i + 1}</span>
            <div className="min-w-0">
              <span style={{ color: STAGE_COLORS[s.stage] || "#93a0b4" }} className="font-semibold mr-1">{STAGE_LABELS[s.stage] || s.stage}</span>
              <span className="break-words">{s.msg.length > 120 ? s.msg.slice(0, 120) + "…" : s.msg}</span>
              <span className="text-[9px] text-muted-foreground/60 ml-1.5">{formatTime(s.ts)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ── Evolution Config ── */

function EvolutionConfig() {
  const [interval, setInterval] = useState<number | null>(null);
  const [inputVal, setInputVal] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    fetch(`${API_BASE}/api/evolution/config`).then(r => r.json()).then(d => {
      setInterval(d.evolution_interval);
      setInputVal(String(d.evolution_interval));
    }).catch(() => {});
  }, []);

  const save = async () => {
    const val = parseInt(inputVal);
    if (isNaN(val) || val < 1800) { setMsg("⚠️ 最短30分钟"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API_BASE}/api/evolution/config`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evolution_interval: val }),
      });
      const d = await r.json();
      if (d.error) setMsg(`❌ ${d.error}`);
      else { setInterval(val); setMsg(`✅ ${val >= 3600 ? (val / 3600) + "小时" : (val / 60) + "分钟"}`); }
    } catch { setMsg("❌ 保存失败"); }
    setSaving(false);
    setTimeout(() => setMsg(""), 3000);
  };

  const fmt = (s: number) => s >= 3600 ? `${s / 3600}小时` : `${s / 60}分钟`;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Clock size={14} className="text-primary" />
        <span className="text-xs font-semibold">进化配置</span>
        {interval && <span className="text-[10px] text-muted-foreground ml-auto">当前: {fmt(interval)}</span>}
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px] text-muted-foreground">周期:</label>
        <input type="number" min={1800} step={600} value={inputVal} onChange={e => setInputVal(e.target.value)}
          className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-xs" />
        <button onClick={save} disabled={saving}
          className="rounded-lg bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-80 disabled:opacity-50">
          {saving ? "…" : "保存"}
        </button>
        {msg && <span className="text-[10px]">{msg}</span>}
      </div>
    </div>
  );
}

/* ── Strand Card ── */

function StrandCard({ strand, label, color }: { strand: StrandStatus; label: string; color: string }) {
  const isPrimary = strand.role === "primary";
  const isSolo = strand.role === "solo";
  const crossInfo = isPrimary ? "A规划 → B写代码" : isSolo ? "自我编程 (降级)" : "B规划 → A写代码";

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Dna size={16} style={{ color }} />
        <span className="text-xs font-semibold">{label}</span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${isPrimary ? "bg-blue-500/15 text-blue-400" : isSolo ? "bg-yellow-500/15 text-yellow-400" : "bg-purple-500/15 text-purple-400"}`}>{strand.role}</span>
        <span className={`ml-auto w-2 h-2 rounded-full ${strand.running ? "bg-green-500" : "bg-muted-foreground/30"}`} />
      </div>
      <div className="text-[10px] text-muted-foreground mb-3 flex items-center gap-1">
        <Zap size={10} className="text-amber-500" /> 交叉进化: <span className="text-foreground font-medium">{crossInfo}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        {[
          { label: "周期", value: strand.cycle_count },
          { label: "观察", value: strand.observations },
          { label: "记忆", value: strand.memories },
        ].map(s => (
          <div key={s.label}>
            <div className="text-sm font-bold">{s.value}</div>
            <div className="text-[9px] text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px]">
        <span className={strand.partner_alive ? "text-green-500" : "text-yellow-500"}>
          {strand.partner_alive ? "● 伙伴在线" : "○ 伙伴离线"}
        </span>
        {strand.my_plans_for_partner > 0 && (
          <span className="ml-auto text-muted-foreground">→ {strand.my_plans_for_partner} 计划待执行</span>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */

export default function EvolutionPage() {
  const [status, setStatus] = useState<EngineStatus | null>(null);
  const [goals, setGoals] = useState<EvolutionGoal[]>([]);
  const [history, setHistory] = useState<EvolutionCycle[]>([]);
  const [quality, setQuality] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      const [s, g, h, q] = await Promise.all([
        fetch(`${API_BASE}/api/evolution/status`).then(r => r.json()),
        fetch(`${API_BASE}/api/evolution/goals`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/api/evolution/history?limit=20`).then(r => r.json()).catch(() => []),
        fetch(`${API_BASE}/api/evolution/dashboard`).then(r => r.json()).catch(() => null),
      ]);
      setStatus(s);
      setGoals(Array.isArray(g) ? g : g?.goals ?? []);
      setHistory(Array.isArray(h) ? h : h?.history ?? []);
      setQuality(q?.quality ?? null);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); const iv = setInterval(fetchAll, 10000); return () => clearInterval(iv); }, [fetchAll]);

  // SSE 实时日志
  useEffect(() => {
    const es = new EventSource(`${API_BASE}/api/evolution/stream?lines=50`);
    es.onmessage = (e) => {
      try {
        const entry = JSON.parse(e.data);
        if (entry.details && typeof entry.details !== "string") entry.details = JSON.stringify(entry.details);
        setLogEntries(prev => [...prev.slice(-200), entry]);
      } catch {}
    };
    es.onerror = () => { es.close(); setTimeout(() => window.location.reload(), 3000); };
    return () => es.close();
  }, []);

  useEffect(() => { if (autoScroll && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" }); }, [logEntries, autoScroll]);

  // 左侧 sidebar
  const setPageSidebar = useAppStore((s) => s.setPageSidebar);
  useEffect(() => {
    setPageSidebar(
      <LeftPanel
        items={goals}
        filter={(g, q) => g.title.toLowerCase().includes(q.toLowerCase())}
        renderItem={(goal) => {
          const Icon = GOAL_ICONS[goal.title] || Target;
          return (
            <button key={goal.goal_id} className="w-full text-left px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
              <div className="flex items-center gap-1.5 min-w-0">
                <Icon size={12} className="text-primary shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{goal.title}</span>
                <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ color: PRIORITY_COLORS[goal.priority] || "#6b7280", background: `${PRIORITY_COLORS[goal.priority] || "#6b7280"}1a` }}>{goal.priority}</span>
              </div>
              <div className="text-[10px] text-muted-foreground truncate mt-0.5">{goal.description || "无描述"}</div>
              <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round(goal.progress * 100)}%` }} />
              </div>
            </button>
          );
        }}
        placeholder="搜索进化目标..."
      />
    );
    return () => setPageSidebar(null);
  }, [goals, setPageSidebar]);

  // 甘特图任务数据
  const tasks = useMemo(() => {
    const map = new Map<string, GanttTask>();
    for (const entry of logEntries) {
      const cycle = entry.cycle ?? 0;
      const key = `${entry.strand}_c${cycle}`;
      if (!map.has(key)) {
        map.set(key, { id: key, strand: entry.strand, cycle, startTime: entry.ts, endTime: null, status: "running", steps: [], summary: "" });
      }
      const task = map.get(key)!;
      task.endTime = entry.ts;
      task.steps.push({ stage: entry.stage, ts: entry.ts, msg: entry.msg });
      if (entry.stage === "turn" && !task.summary) task.summary = entry.msg.slice(0, 80);
      if (entry.stage === "verdict") {
        const d = entry.details || "";
        task.status = d.includes("success") ? "success" : d.includes("fail") ? "error" : "success";
      }
      if (entry.stage === "error") task.status = "error";
    }
    for (const h of history) {
      const key = `${h.strand_id}_c${h.cycle_count}`;
      if (!map.has(key)) {
        map.set(key, { id: key, strand: h.strand_id, cycle: h.cycle_count ?? 0, startTime: h.timestamp, endTime: h.timestamp, status: h.success ? "success" : "error", steps: [], summary: `${h.improvements_count ?? h.improvements ?? 0} 项改进` });
      }
    }
    return [...map.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }, [logEntries, history]);

  const selectedTask = useMemo(() => tasks.find(t => t.id === selectedId) || null, [tasks, selectedId]);

  if (loading) {
    return (
      <PageLayout title="自我进化">
        <div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-muted-foreground" size={32} /></div>
      </PageLayout>
    );
  }

  const sa = status?.strand_a;
  const sb = status?.strand_b;

  return (
    <PageLayout title="自我进化" icon={<Dna className="w-5 h-5" />}>
      <div className="flex h-full flex-col overflow-auto p-4 lg:p-6 space-y-4">

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "进化周期", value: ((sa?.cycle_count ?? 0) + (sb?.cycle_count ?? 0)).toString(), icon: Zap, color: "#3b82f6" },
            { label: "已创建技能", value: String((quality as any)?.skill_count ?? 0), icon: Wrench, color: "#f59e0b" },
            { label: "学习记忆", value: String((sa?.memories ?? 0) + (sb?.memories ?? 0)), icon: Brain, color: "#a855f7" },
            { label: "成功率", value: `${Math.round(((quality as any)?.cycle_success_rate ?? 0) * 100)}%`, icon: Target, color: "#22c55e" },
          ].map(c => (
            <div key={c.label} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${c.color}08, ${c.color}03)` }}>
              <div className="rounded-lg p-2" style={{ background: `${c.color}15` }}><c.icon size={16} style={{ color: c.color }} /></div>
              <div>
                <div className="text-lg font-bold" style={{ color: c.color }}>{c.value}</div>
                <div className="text-[10px] text-muted-foreground">{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Strand Status ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sa && <StrandCard strand={sa} label="螺旋 A" color="#3b82f6" />}
          {sb && <StrandCard strand={sb} label="螺旋 B" color="#a855f7" />}
        </div>

        {/* ── Config ── */}
        <EvolutionConfig />

        {/* ── Overview Chart ── */}
        {tasks.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-xs font-semibold">进化概览</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">按日聚合 · 成功/失败/进行中 · 能力指数</p>
              </div>
              <div className="flex gap-3">
                {[{ l: "成功", c: "#22c55e" }, { l: "失败", c: "#ef4444" }, { l: "进行中", c: "#3b82f6" }, { l: "能力", c: "#5b8cff" }].map(x => (
                  <span key={x.l} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                    <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: x.c }} />{x.l}
                  </span>
                ))}
              </div>
            </div>
            <OverviewChart tasks={tasks} />
          </div>
        )}

        {/* ── Gantt + Detail ── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-semibold flex items-center gap-2"><History size={14} className="text-primary" /> 进化时间线</h3>
              <p className="text-[10px] text-muted-foreground mt-0.5">{tasks.length} 个进化周期 · 散点标记关键节点 · 点击查看详情</p>
            </div>
            <div className="flex gap-2">
              {[{ l: "规划", c: "#a855f7" }, { l: "实现", c: "#f59e0b" }, { l: "评估", c: "#eab308" }, { l: "反思", c: "#34d399" }, { l: "判定", c: "#22c55e" }].map(x => (
                <span key={x.l} className="inline-flex items-center gap-1 text-[9px] text-muted-foreground">
                  <i className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: x.c }} />{x.l}
                </span>
              ))}
            </div>
          </div>

          {tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-xs">等待第一次进化周期...</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
              <div className="overflow-auto"><GanttChart tasks={tasks} selectedId={selectedId} onSelect={setSelectedId} /></div>
              <div className="border-l border-border pl-4 max-h-[500px] overflow-auto">
                <h4 className="text-[10px] text-muted-foreground uppercase tracking-wider mb-3">任务详情</h4>
                <DetailPanel task={selectedTask} />
              </div>
            </div>
          )}
        </div>

        {/* ── Real-time Log ── */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold flex items-center gap-2">
              <BarChart3 size={14} className="text-primary" /> 实时进化日志
            </h3>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> SSE实时流
            </span>
          </div>
          <div className="rounded-lg bg-black/80 p-3 font-mono text-[11px] max-h-[300px] overflow-y-auto"
            onScroll={e => { const el = e.currentTarget; setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 50); }}>
            {logEntries.length === 0 && <div className="text-muted-foreground">等待进化日志...</div>}
            {logEntries.map((entry, i) => (
              <div key={i} className="py-0.5 leading-relaxed hover:bg-white/5 px-1 rounded">
                <span className="text-gray-500">{entry.ts?.slice(11, 19)}</span>{" "}
                <span className={entry.strand === "strand_a" ? "text-blue-400" : "text-purple-400"}>[{entry.strand === "strand_a" ? "螺旋A" : "螺旋B"}]</span>{" "}
                <span style={{ color: STAGE_COLORS[entry.stage] || "#9ca3af" }}>{STAGE_ICON[entry.stage] || "•"} {entry.stage}</span>{" "}
                <span className="text-gray-300">{entry.msg}</span>
                {entry.details && <span className="text-gray-500"> | {(entry.details as string).slice(0, 60)}</span>}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

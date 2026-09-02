"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import {
  FileText, CheckCircle, Clock, AlertCircle, ChevronRight,
  Layers, Shield, Radio, Database, Eye, Search,
} from "lucide-react";
import { PageLayout } from "@/components/page-layout";

/* ── 数据 ────────────────────────────────────────── */

interface SpecItem {
  id: string;
  name: string;
  desc: string;
  layer: string;
  status: "done" | "wip" | "todo";
  priority: "P0" | "P1" | "P2" | "P3";
  commits?: string[];
  changes?: string[];
  date?: string;
}

const LAYER_ICONS: Record<string, typeof FileText> = {
  "顶层架构": Layers,
  "智能体业务层": Database,
  "网关与通信层": Radio,
  "中间件与扩展层": Shield,
  "底座可观测层": Eye,
};

const LAYER_ORDER = [
  "顶层架构",
  "智能体业务层",
  "网关与通信层",
  "中间件与扩展层",
  "底座可观测层",
];

const specs: SpecItem[] = [
  // ── 顶层架构 ──
  { id: "01", name: "Architecture", desc: "整体架构总纲", layer: "顶层架构", status: "todo", priority: "P0" },
  // ── 智能体业务层 ──
  { id: "02", name: "AgentCore", desc: "智能体内核规范", layer: "智能体业务层", status: "wip", priority: "P2",
    changes: ["基础agent loop已有", "缺反思迭代、多Agent协同"] },
  { id: "03", name: "Memory", desc: "记忆系统规范", layer: "智能体业务层", status: "todo", priority: "P1" },
  { id: "04", name: "Artifact", desc: "知识库产物规范", layer: "智能体业务层", status: "wip", priority: "P2",
    changes: ["agent/artifact.py基础实现已有", "需对齐规范"] },
  { id: "05", name: "Scheduler", desc: "集群调度规范", layer: "智能体业务层", status: "todo", priority: "P3" },
  { id: "06", name: "PromptStore", desc: "提示词仓库规范", layer: "智能体业务层", status: "todo", priority: "P2" },
  // ── 网关与通信层 ──
  { id: "07", name: "Gateway", desc: "网关路由规范", layer: "网关与通信层", status: "todo", priority: "P0" },
  { id: "08", name: "ModelGateway", desc: "模型网关规范", layer: "网关与通信层", status: "todo", priority: "P2" },
  { id: "09", name: "ACP", desc: "人机交互协议规范", layer: "网关与通信层", status: "done", priority: "P0",
    commits: ["3948a7c", "aa051f1", "00ca90c", "db7c3a7", "a952ec6"],
    changes: ["/ws/acp端点 — ACP JSON-RPC 2.0纯透传", "前端hook: session/create→session/prompt→session/event",
              "session/approval审批方法", "session/close关闭方法", "event_type统一事件结构", "MiMo API集成"],
    date: "2026-09-02" },
  { id: "10", name: "A2A", desc: "Agent对等协同协议规范", layer: "网关与通信层", status: "todo", priority: "P0" },
  { id: "11", name: "MCP", desc: "底层管控协议规范", layer: "网关与通信层", status: "todo", priority: "P0" },
  // ── 中间件与扩展层 ──
  { id: "12", name: "EventBus", desc: "事件总线规范", layer: "中间件与扩展层", status: "todo", priority: "P1" },
  { id: "13", name: "Plugin", desc: "插件扩展规范", layer: "中间件与扩展层", status: "todo", priority: "P2" },
  { id: "14", name: "Config", desc: "配置中心规范", layer: "中间件与扩展层", status: "todo", priority: "P2" },
  { id: "15", name: "RBAC", desc: "权限角色规范", layer: "中间件与扩展层", status: "wip", priority: "P2",
    changes: ["基础JWT鉴权已有", "缺五层RBAC模型"] },
  // ── 底座可观测层 ──
  { id: "16", name: "Telemetry", desc: "遥测观测规范", layer: "底座可观测层", status: "todo", priority: "P3" },
  { id: "17", name: "Monitor", desc: "集群指标监控规范", layer: "底座可观测层", status: "todo", priority: "P3" },
  { id: "18", name: "Alert", desc: "告警中心规范", layer: "底座可观测层", status: "todo", priority: "P3" },
  { id: "19", name: "SLA", desc: "服务等级指标规范", layer: "底座可观测层", status: "todo", priority: "P3" },
  { id: "20", name: "Health", desc: "健康检查规范", layer: "底座可观测层", status: "wip", priority: "P3",
    changes: ["/health端点已有", "需扩展完整健康检查"] },
  { id: "21", name: "Backup", desc: "集群备份恢复规范", layer: "底座可观测层", status: "todo", priority: "P3" },
  { id: "22", name: "LogAndTrace", desc: "日志链路追踪规范", layer: "底座可观测层", status: "todo", priority: "P1" },
  { id: "23", name: "ErrorCode", desc: "全局错误码规范", layer: "底座可观测层", status: "wip", priority: "P3",
    changes: ["ACP基础错误码已有", "需对齐规范"] },
  // ── 扩展参考 ──
  { id: "24", name: "Session", desc: "会话生命周期规范", layer: "智能体业务层", status: "todo", priority: "P1" },
  { id: "25", name: "Security", desc: "全局安全风控规范", layer: "中间件与扩展层", status: "todo", priority: "P2" },
  { id: "26", name: "Storage", desc: "存储缓存与持久化规范", layer: "底座可观测层", status: "todo", priority: "P2" },
  { id: "27", name: "Vector", desc: "向量检索引擎规范", layer: "智能体业务层", status: "todo", priority: "P2" },
];

/* ── 组件 ────────────────────────────────────────── */

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500/10 text-emerald-500",
  wip: "bg-amber-500/10 text-amber-500",
  todo: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { done: "已完成", wip: "进行中", todo: "待实现" };
const STATUS_ICON = { done: CheckCircle, wip: Clock, todo: AlertCircle };

const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-red-500/10 text-red-500",
  P1: "bg-orange-500/10 text-orange-500",
  P2: "bg-blue-500/10 text-blue-500",
  P3: "bg-muted text-muted-foreground",
};

export function DevSpecsClient() {
  const [filter, setFilter] = useState<"all" | "done" | "wip" | "todo">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = specs.filter((s) => {
    if (filter !== "all" && s.status !== filter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) &&
        !s.desc.includes(search)) return false;
    return true;
  });

  const done = specs.filter((s) => s.status === "done").length;
  const wip = specs.filter((s) => s.status === "wip").length;
  const todo = specs.filter((s) => s.status === "todo").length;
  const pct = Math.round((done / specs.length) * 100);

  return (
    <PageLayout title="开发规范">
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
          <div className="flex items-center gap-3">
            <FileText size={20} className="text-primary" />
            <h1 className="text-lg font-semibold">OpenSoulMate v1.0 开发规范</h1>
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {specs.length} 项规范
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-3 lg:space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 lg:gap-4">
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <span className="text-xs text-muted-foreground">总规范数</span>
              <p className="text-xl lg:text-2xl font-bold">{specs.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <span className="text-xs text-muted-foreground">已完成</span>
              <p className="text-xl lg:text-2xl font-bold text-emerald-500">{done}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <span className="text-xs text-muted-foreground">进行中</span>
              <p className="text-xl lg:text-2xl font-bold text-amber-500">{wip}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <span className="text-xs text-muted-foreground">待实现</span>
              <p className="text-xl lg:text-2xl font-bold text-muted-foreground">{todo}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
              <span className="text-xs text-muted-foreground">完成度</span>
              <p className="text-xl lg:text-2xl font-bold">{pct}%</p>
              <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          {/* Filter + Search */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex gap-2">
              {(["all", "done", "wip", "todo"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)}
                  className={cn("rounded-lg px-3 py-2 text-xs lg:text-sm",
                    filter === f ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted text-muted-foreground")}>
                  {f === "all" ? "全部" : STATUS_LABEL[f]}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索规范..."
                className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-xs lg:text-sm" />
            </div>
          </div>

          {/* Specs grouped by layer */}
          {LAYER_ORDER.map((layer) => {
            const layerSpecs = filtered.filter((s) => s.layer === layer);
            if (layerSpecs.length === 0) return null;
            const LayerIcon = LAYER_ICONS[layer] || FileText;
            const layerDone = layerSpecs.filter((s) => s.status === "done").length;

            return (
              <div key={layer} className="space-y-2">
                <div className="flex items-center gap-2">
                  <LayerIcon size={16} className="text-primary" />
                  <h2 className="text-sm font-semibold">{layer}</h2>
                  <span className="text-xs text-muted-foreground">
                    {layerDone}/{layerSpecs.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-3">
                  {layerSpecs.map((s) => {
                    const StIcon = STATUS_ICON[s.status];
                    const isOpen = expanded === s.id;
                    return (
                      <div key={s.id}
                        className={cn("rounded-xl border bg-card p-3 lg:p-4 space-y-2 cursor-pointer transition-colors",
                          isOpen ? "border-primary/30" : "border-border hover:border-primary/20")}
                        onClick={() => setExpanded(isOpen ? null : s.id)}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-mono text-muted-foreground">{s.id}</span>
                            <span className="font-medium text-xs lg:text-sm">{s.name}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", PRIORITY_STYLE[s.priority])}>
                              {s.priority}
                            </span>
                            <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full", STATUS_STYLE[s.status])}>
                              <StIcon size={10} /> {STATUS_LABEL[s.status]}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">{s.desc}</p>

                        {isOpen && (s.changes || s.commits || s.date) && (
                          <div className="mt-2 pt-2 border-t border-border space-y-2">
                            {s.date && (
                              <p className="text-[10px] text-muted-foreground">完成日期: {s.date}</p>
                            )}
                            {s.commits && s.commits.length > 0 && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground mb-1">Commits:</p>
                                <div className="flex flex-wrap gap-1">
                                  {s.commits.map((c) => (
                                    <span key={c} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">
                                      {c}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                            {s.changes && s.changes.length > 0 && (
                              <div>
                                <p className="text-[10px] font-medium text-muted-foreground mb-1">改动记录:</p>
                                <ul className="space-y-0.5">
                                  {s.changes.map((c, i) => (
                                    <li key={i} className="text-[10px] text-muted-foreground flex items-start gap-1">
                                      <ChevronRight size={10} className="mt-0.5 shrink-0" />
                                      {c}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </PageLayout>
  );
}

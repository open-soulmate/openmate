"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/stores/app-store";
import {
  FileText, CheckCircle, Clock, AlertCircle, Search,
  Layers, Shield, Radio, Database, Eye,
} from "lucide-react";
import { LeftPanel } from "@/components/left-panel";
import { DetailPanel } from "@/components/detail-panel";

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
  fileName: string;
}

const LAYER_ICONS: Record<string, typeof FileText> = {
  "顶层架构": Layers, "智能体业务层": Database, "网关与通信层": Radio,
  "中间件与扩展层": Shield, "底座可观测层": Eye,
};

const specs: SpecItem[] = [
  { id: "01", name: "Architecture", desc: "整体架构总纲", layer: "顶层架构", status: "todo", priority: "P0", fileName: "01-Architecture-v1.0-整体架构总纲.md" },
  { id: "02", name: "AgentCore", desc: "智能体内核规范", layer: "智能体业务层", status: "wip", priority: "P2", fileName: "02-AgentCore-v1.0-智能体内核规范.md", changes: ["基础agent loop已有", "缺反思迭代、多Agent协同"] },
  { id: "03", name: "Memory", desc: "记忆系统规范", layer: "智能体业务层", status: "todo", priority: "P1", fileName: "03-Memory-v1.0-记忆系统规范.md" },
  { id: "04", name: "Artifact", desc: "知识库产物规范", layer: "智能体业务层", status: "wip", priority: "P2", fileName: "04-Artifact-v1.0-知识库产物规范.md", changes: ["agent/artifact.py基础实现已有", "需对齐规范"] },
  { id: "05", name: "Scheduler", desc: "集群调度规范", layer: "智能体业务层", status: "todo", priority: "P3", fileName: "05-Scheduler-v1.0-集群调度规范.md" },
  { id: "06", name: "PromptStore", desc: "提示词仓库规范", layer: "智能体业务层", status: "todo", priority: "P2", fileName: "06-PromptStore-v1.0-提示词仓库规范.md" },
  { id: "24", name: "Session", desc: "会话生命周期规范", layer: "智能体业务层", status: "todo", priority: "P1", fileName: "24-Session-v1.0-会话生命周期规范.md" },
  { id: "27", name: "Vector", desc: "向量检索引擎规范", layer: "智能体业务层", status: "todo", priority: "P2", fileName: "27-Vector-v1.0-向量检索引擎规范.md" },
  { id: "07", name: "Gateway", desc: "网关路由规范", layer: "网关与通信层", status: "todo", priority: "P0", fileName: "07-Gateway-v1.0-网关路由规范.md" },
  { id: "08", name: "ModelGateway", desc: "模型网关规范", layer: "网关与通信层", status: "todo", priority: "P2", fileName: "08-ModelGateway-v1.0-模型网关规范.md" },
  { id: "09", name: "ACP", desc: "人机交互协议规范", layer: "网关与通信层", status: "done", priority: "P0", fileName: "09-ACP-v1.0-人机交互协议规范.md", commits: ["3948a7c", "aa051f1", "00ca90c", "db7c3a7", "a952ec6"], changes: ["/ws/acp端点 — ACP JSON-RPC 2.0纯透传", "前端hook: session/create→session/prompt→session/event", "session/approval审批方法", "session/close关闭方法", "event_type统一事件结构", "MiMo API集成"], date: "2026-09-02" },
  { id: "10", name: "A2A", desc: "Agent对等协同协议规范", layer: "网关与通信层", status: "done", priority: "P0", fileName: "10-A2A-v1.0-Agent对等协同协议规范.md", commits: ["705047c"], changes: ["a2a/task/delegate任务委派", "a2a/task/result结果回传+查询", "a2a/task/cancel任务取消", "a2a/artifact/sync工件同步", "a2a/agent/heartbeat心跳保活", "ws://8092/ws/a2a WebSocket端点", "POST /rpc/a2a规范路径"], date: "2026-09-02" },
  { id: "11", name: "MCP", desc: "底层管控协议规范", layer: "网关与通信层", status: "todo", priority: "P0", fileName: "11-MCP-v1.0-底层管控协议规范.md" },
  { id: "12", name: "EventBus", desc: "事件总线规范", layer: "中间件与扩展层", status: "todo", priority: "P1", fileName: "12-EventBus-v1.0-事件总线规范.md" },
  { id: "13", name: "Plugin", desc: "插件扩展规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "13-Plugin-v1.0-插件扩展规范.md" },
  { id: "14", name: "Config", desc: "配置中心规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "14-Config-v1.0-配置中心规范.md" },
  { id: "15", name: "RBAC", desc: "权限角色规范", layer: "中间件与扩展层", status: "wip", priority: "P2", fileName: "15-RBAC-v1.0-权限角色规范.md", changes: ["基础JWT鉴权已有", "缺五层RBAC模型"] },
  { id: "25", name: "Security", desc: "全局安全风控规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "25-Security-v1.0-全局安全风控规范.md" },
  { id: "16", name: "Telemetry", desc: "遥测观测规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "16-Telemetry-v1.0-遥测观测规范.md" },
  { id: "17", name: "Monitor", desc: "集群指标监控规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "17-Monitor-v1.0-集群指标监控规范.md" },
  { id: "18", name: "Alert", desc: "告警中心规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "18-Alert-v1.0-告警中心规范.md" },
  { id: "19", name: "SLA", desc: "服务等级指标规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "19-SLA-v1.0-服务等级指标规范.md" },
  { id: "20", name: "Health", desc: "健康检查规范", layer: "底座可观测层", status: "wip", priority: "P3", fileName: "20-Health-v1.0-健康检查规范.md", changes: ["/health端点已有", "需扩展完整健康检查"] },
  { id: "21", name: "Backup", desc: "集群备份恢复规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "21-Backup-v1.0-集群备份恢复规范.md" },
  { id: "22", name: "LogAndTrace", desc: "日志链路追踪规范", layer: "底座可观测层", status: "todo", priority: "P1", fileName: "22-LogAndTrace-v1.0-日志链路追踪规范.md" },
  { id: "23", name: "ErrorCode", desc: "全局错误码规范", layer: "底座可观测层", status: "wip", priority: "P3", fileName: "23-ErrorCode-v1.0-全局错误码规范.md", changes: ["ACP基础错误码已有", "需对齐规范"] },
  { id: "26", name: "Storage", desc: "存储缓存与持久化规范", layer: "底座可观测层", status: "todo", priority: "P2", fileName: "26-Storage-v1.0-存储缓存与持久化规范.md" },
];

const STATUS_STYLE: Record<string, string> = {
  done: "bg-emerald-500/10 text-emerald-500",
  wip: "bg-amber-500/10 text-amber-500",
  todo: "bg-muted text-muted-foreground",
};
const STATUS_LABEL: Record<string, string> = { done: "已完成", wip: "进行中", todo: "待实现" };
const STATUS_ICON = { done: CheckCircle, wip: Clock, todo: AlertCircle };
const PRIORITY_STYLE: Record<string, string> = {
  P0: "bg-red-500/10 text-red-500", P1: "bg-orange-500/10 text-orange-500",
  P2: "bg-blue-500/10 text-blue-500", P3: "bg-muted text-muted-foreground",
};

/* ── 组件 ──────────────────────────────────────── */

export function DevSpecsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [specContent, setSpecContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const setPageSidebar = useAppStore((s) => s.setPageSidebar);
  const setPageWorkspace = useAppStore((s) => s.setPageWorkspace);

  const selected = specs.find((s) => s.id === selectedId) || null;

  const filtered = specs.filter(s => {
    if (!query) return true;
    return s.name.toLowerCase().includes(query.toLowerCase()) || s.desc.includes(query) || s.id.includes(query);
  });

  const done = specs.filter(s => s.status === "done").length;
  const wip = specs.filter(s => s.status === "wip").length;
  const todo = specs.filter(s => s.status === "todo").length;
  const pct = Math.round((done / specs.length) * 100);

  const loadSpecContent = useCallback(async (fileName: string) => {
    setLoadingContent(true);
    try {
      const resp = await fetch(`/api/dev-specs/content?file=${encodeURIComponent(fileName)}`);
      if (resp.ok) { const data = await resp.json(); setSpecContent(data.content || "加载失败"); }
      else { setSpecContent("无法加载规范文件"); }
    } catch { setSpecContent("网络错误"); }
    finally { setLoadingContent(false); }
  }, []);

  // Register sidebar: spec list with search
  useEffect(() => {
    setPageSidebar(
      <LeftPanel
        items={specs}
        filter={(spec, q) => spec.name.toLowerCase().includes(q.toLowerCase()) || spec.desc.includes(q) || spec.id.includes(q)}
        placeholder="搜索规范..."
        header={
          <div className="px-2 pb-2 space-y-2">
            <div className="flex items-center gap-2 px-2">
              <FileText size={16} className="text-primary" />
              <span className="text-sm font-semibold">OpenSoulMate v1.0</span>
            </div>
            <div className="flex gap-1 px-2">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500">{done} 完成</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500">{wip} 进行中</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{todo} 待实现</span>
            </div>
          </div>
        }
        renderItem={(spec) => {
          const StIcon = STATUS_ICON[spec.status];
          return (
            <div
              key={spec.id}
              className={cn(
                "px-3 py-2.5 cursor-pointer hover:bg-muted/80 transition-colors border-b border-border/30",
                selectedId === spec.id && "bg-primary/12 text-primary"
              )}
              onClick={() => setSelectedId(spec.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono text-muted-foreground w-5 shrink-0">{spec.id}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{spec.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{spec.desc}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={cn("text-[9px] px-1 py-0.5 rounded-full font-medium", PRIORITY_STYLE[spec.priority])}>{spec.priority}</span>
                  <span className={cn("flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full", STATUS_STYLE[spec.status])}>
                    <StIcon size={8} /> {STATUS_LABEL[spec.status]}
                  </span>
                </div>
              </div>
            </div>
          );
        }}
        emptyState={<div className="flex flex-col items-center justify-center h-40 text-muted-foreground"><FileText className="w-8 h-8 mb-2 opacity-40" /><p className="text-xs">未找到规范</p></div>}
      />
    );
    return () => setPageSidebar(null);
  }, [selectedId, done, wip, todo, setPageSidebar]);

  // Register workspace: detail panel when selected
  useEffect(() => {
    if (!selected) { setPageWorkspace(null); return; }
    loadSpecContent(selected.fileName);

    const detailItems = [
      { label: "编号", value: selected.id },
      { label: "层级", value: selected.layer, icon: (() => { const I = LAYER_ICONS[selected.layer]; return I ? <I className="w-3.5 h-3.5" /> : undefined; })() },
      { label: "优先级", value: selected.priority },
      { label: "状态", value: STATUS_LABEL[selected.status], icon: (() => { const I = STATUS_ICON[selected.status]; return <I className="w-3.5 h-3.5" />; })() },
      { label: "文件", value: selected.fileName },
    ];

    const devItems = [];
    if (selected.date) devItems.push({ label: "完成日期", value: selected.date });
    if (selected.commits) selected.commits.forEach(c => devItems.push({ label: "Commit", value: c }));
    if (selected.changes) selected.changes.forEach(c => devItems.push({ label: "改动", value: c }));

    setPageWorkspace(
      <DetailPanel
        title={selected.name}
        subtitle={selected.desc}
        icon={<FileText className="w-5 h-5 text-primary" />}
        badge={STATUS_LABEL[selected.status]}
        onClose={() => setSelectedId(null)}
        sections={[
          { title: "基本信息", items: detailItems },
          ...(devItems.length > 0 ? [{ title: "开发记录", items: devItems }] : []),
          { title: "规范正文", items: [{ label: "", value: loadingContent ? "加载中..." : specContent }] },
        ]}
      />
    );
    return () => setPageWorkspace(null);
  }, [selected, specContent, loadingContent, setPageWorkspace, loadSpecContent]);

  // ── MainPanel: 中间区域统计+卡片网格 ──
  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 lg:mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2"><FileText className="w-6 h-6" /> OpenSoulMate v1.0 开发规范</h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1">{specs.length} 项规范 · 完成度 {pct}%</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-4 mb-3 lg:mb-6">
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold">{specs.length}</p><p className="text-[10px] lg:text-sm text-muted-foreground">总规范数</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-emerald-500">{done}</p><p className="text-[10px] lg:text-sm text-muted-foreground">已完成</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-amber-500">{wip}</p><p className="text-[10px] lg:text-sm text-muted-foreground">进行中</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card"><p className="text-lg lg:text-2xl font-bold text-muted-foreground">{todo}</p><p className="text-[10px] lg:text-sm text-muted-foreground">待实现</p></div>
        <div className="p-3 lg:p-4 rounded-xl border bg-card">
          <p className="text-lg lg:text-2xl font-bold">{pct}%</p>
          <p className="text-[10px] lg:text-sm text-muted-foreground">完成度</p>
          <div className="mt-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-sm mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索规范..."
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-muted text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30" />
      </div>

      {/* Specs Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileText size={48} className="mb-4 opacity-30" />
          <p className="text-xs lg:text-sm">未找到规范</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-4">
          {filtered.map(spec => {
            const StIcon = STATUS_ICON[spec.status];
            const LayerIcon = LAYER_ICONS[spec.layer] || FileText;
            return (
              <div
                key={spec.id}
                onClick={() => setSelectedId(spec.id)}
                className={cn(
                  "rounded-xl border bg-card p-3 lg:p-4 transition-all hover:border-primary/30 cursor-pointer",
                  selectedId === spec.id ? "border-primary ring-1 ring-primary/30" : ""
                )}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                      <LayerIcon size={18} className="text-primary" />
                    </div>
                    <div>
                      <h3 className="text-xs lg:text-sm font-medium">{spec.name}</h3>
                      <span className="text-[10px] text-muted-foreground">{spec.id} · {spec.layer}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", PRIORITY_STYLE[spec.priority])}>{spec.priority}</span>
                    <span className={cn("flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full", STATUS_STYLE[spec.status])}>
                      <StIcon size={10} /> {STATUS_LABEL[spec.status]}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-[2rem]">{spec.desc}</p>
                {spec.changes && spec.changes.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {spec.changes.slice(0, 2).map((c, i) => (
                      <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground truncate max-w-[120px]">{c}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

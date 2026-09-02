"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  FileText, CheckCircle, Clock, AlertCircle, Search,
  Layers, Shield, Radio, Database, Eye,
} from "lucide-react";
import { LeftPanel } from "@/components/left-panel";

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
  "顶层架构": Layers,
  "智能体业务层": Database,
  "网关与通信层": Radio,
  "中间件与扩展层": Shield,
  "底座可观测层": Eye,
};

const specs: SpecItem[] = [
  { id: "01", name: "Architecture", desc: "整体架构总纲", layer: "顶层架构", status: "todo", priority: "P0", fileName: "01-Architecture-v1.0-整体架构总纲.md" },
  { id: "02", name: "AgentCore", desc: "智能体内核规范", layer: "智能体业务层", status: "wip", priority: "P2", fileName: "02-AgentCore-v1.0-智能体内核规范.md",
    changes: ["基础agent loop已有", "缺反思迭代、多Agent协同"] },
  { id: "03", name: "Memory", desc: "记忆系统规范", layer: "智能体业务层", status: "todo", priority: "P1", fileName: "03-Memory-v1.0-记忆系统规范.md" },
  { id: "04", name: "Artifact", desc: "知识库产物规范", layer: "智能体业务层", status: "wip", priority: "P2", fileName: "04-Artifact-v1.0-知识库产物规范.md",
    changes: ["agent/artifact.py基础实现已有", "需对齐规范"] },
  { id: "05", name: "Scheduler", desc: "集群调度规范", layer: "智能体业务层", status: "todo", priority: "P3", fileName: "05-Scheduler-v1.0-集群调度规范.md" },
  { id: "06", name: "PromptStore", desc: "提示词仓库规范", layer: "智能体业务层", status: "todo", priority: "P2", fileName: "06-PromptStore-v1.0-提示词仓库规范.md" },
  { id: "24", name: "Session", desc: "会话生命周期规范", layer: "智能体业务层", status: "todo", priority: "P1", fileName: "24-Session-v1.0-会话生命周期规范.md" },
  { id: "27", name: "Vector", desc: "向量检索引擎规范", layer: "智能体业务层", status: "todo", priority: "P2", fileName: "27-Vector-v1.0-向量检索引擎规范.md" },
  { id: "07", name: "Gateway", desc: "网关路由规范", layer: "网关与通信层", status: "todo", priority: "P0", fileName: "07-Gateway-v1.0-网关路由规范.md" },
  { id: "08", name: "ModelGateway", desc: "模型网关规范", layer: "网关与通信层", status: "todo", priority: "P2", fileName: "08-ModelGateway-v1.0-模型网关规范.md" },
  { id: "09", name: "ACP", desc: "人机交互协议规范", layer: "网关与通信层", status: "done", priority: "P0", fileName: "09-ACP-v1.0-人机交互协议规范.md",
    commits: ["3948a7c", "aa051f1", "00ca90c", "db7c3a7", "a952ec6"],
    changes: ["/ws/acp端点 — ACP JSON-RPC 2.0纯透传", "前端hook: session/create→session/prompt→session/event",
              "session/approval审批方法", "session/close关闭方法", "event_type统一事件结构", "MiMo API集成"],
    date: "2026-09-02" },
  { id: "10", name: "A2A", desc: "Agent对等协同协议规范", layer: "网关与通信层", status: "todo", priority: "P0", fileName: "10-A2A-v1.0-Agent对等协同协议规范.md" },
  { id: "11", name: "MCP", desc: "底层管控协议规范", layer: "网关与通信层", status: "todo", priority: "P0", fileName: "11-MCP-v1.0-底层管控协议规范.md" },
  { id: "12", name: "EventBus", desc: "事件总线规范", layer: "中间件与扩展层", status: "todo", priority: "P1", fileName: "12-EventBus-v1.0-事件总线规范.md" },
  { id: "13", name: "Plugin", desc: "插件扩展规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "13-Plugin-v1.0-插件扩展规范.md" },
  { id: "14", name: "Config", desc: "配置中心规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "14-Config-v1.0-配置中心规范.md" },
  { id: "15", name: "RBAC", desc: "权限角色规范", layer: "中间件与扩展层", status: "wip", priority: "P2", fileName: "15-RBAC-v1.0-权限角色规范.md",
    changes: ["基础JWT鉴权已有", "缺五层RBAC模型"] },
  { id: "25", name: "Security", desc: "全局安全风控规范", layer: "中间件与扩展层", status: "todo", priority: "P2", fileName: "25-Security-v1.0-全局安全风控规范.md" },
  { id: "16", name: "Telemetry", desc: "遥测观测规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "16-Telemetry-v1.0-遥测观测规范.md" },
  { id: "17", name: "Monitor", desc: "集群指标监控规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "17-Monitor-v1.0-集群指标监控规范.md" },
  { id: "18", name: "Alert", desc: "告警中心规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "18-Alert-v1.0-告警中心规范.md" },
  { id: "19", name: "SLA", desc: "服务等级指标规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "19-SLA-v1.0-服务等级指标规范.md" },
  { id: "20", name: "Health", desc: "健康检查规范", layer: "底座可观测层", status: "wip", priority: "P3", fileName: "20-Health-v1.0-健康检查规范.md",
    changes: ["/health端点已有", "需扩展完整健康检查"] },
  { id: "21", name: "Backup", desc: "集群备份恢复规范", layer: "底座可观测层", status: "todo", priority: "P3", fileName: "21-Backup-v1.0-集群备份恢复规范.md" },
  { id: "22", name: "LogAndTrace", desc: "日志链路追踪规范", layer: "底座可观测层", status: "todo", priority: "P1", fileName: "22-LogAndTrace-v1.0-日志链路追踪规范.md" },
  { id: "23", name: "ErrorCode", desc: "全局错误码规范", layer: "底座可观测层", status: "wip", priority: "P3", fileName: "23-ErrorCode-v1.0-全局错误码规范.md",
    changes: ["ACP基础错误码已有", "需对齐规范"] },
  { id: "26", name: "Storage", desc: "存储缓存与持久化规范", layer: "底座可观测层", status: "todo", priority: "P2", fileName: "26-Storage-v1.0-存储缓存与持久化规范.md" },
];

/* ── 样式常量 ────────────────────────────────────── */

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

/* ── 主组件 ──────────────────────────────────────── */

export function DevSpecsClient() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [specContent, setSpecContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);

  const selected = specs.find((s) => s.id === selectedId) || null;

  /* 加载规范markdown内容 */
  const loadSpecContent = useCallback(async (fileName: string) => {
    setLoadingContent(true);
    try {
      const resp = await fetch(`/api/dev-specs/content?file=${encodeURIComponent(fileName)}`);
      if (resp.ok) {
        const data = await resp.json();
        setSpecContent(data.content || "内容加载失败");
      } else {
        setSpecContent("无法加载规范文件");
      }
    } catch {
      setSpecContent("网络错误");
    } finally {
      setLoadingContent(false);
    }
  }, []);

  useEffect(() => {
    if (selected) loadSpecContent(selected.fileName);
  }, [selected, loadSpecContent]);

  /* 统计 */
  const done = specs.filter((s) => s.status === "done").length;
  const wip = specs.filter((s) => s.status === "wip").length;
  const todo = specs.filter((s) => s.status === "todo").length;

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left Panel ── */}
      <LeftPanel
        items={specs}
        filter={(spec, q) =>
          spec.name.toLowerCase().includes(q.toLowerCase()) ||
          spec.desc.includes(q) ||
          spec.id.includes(q)
        }
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
          const isSelected = selectedId === spec.id;
          return (
            <div
              key={spec.id}
              className={cn(
                "px-3 py-2.5 cursor-pointer hover:bg-muted/80 transition-colors border-b border-border/30",
                isSelected && "bg-primary/12 text-primary"
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
                  <span className={cn("text-[9px] px-1 py-0.5 rounded-full font-medium", PRIORITY_STYLE[spec.priority])}>
                    {spec.priority}
                  </span>
                  <span className={cn("flex items-center gap-0.5 text-[9px] px-1 py-0.5 rounded-full", STATUS_STYLE[spec.status])}>
                    <StIcon size={8} /> {STATUS_LABEL[spec.status]}
                  </span>
                </div>
              </div>
            </div>
          );
        }}
        emptyState={
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <FileText className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">未找到规范</p>
          </div>
        }
      />

      {/* ── Right Panel: 规范内容 ── */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <div className="p-4 lg:p-6 space-y-4">
            {/* 头部 */}
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-muted-foreground">{selected.id}</span>
                  <h1 className="text-lg font-bold">{selected.name}</h1>
                  <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-medium", PRIORITY_STYLE[selected.priority])}>
                    {selected.priority}
                  </span>
                  {(() => {
                    const StIcon = STATUS_ICON[selected.status];
                    return (
                      <span className={cn("flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full", STATUS_STYLE[selected.status])}>
                        <StIcon size={10} /> {STATUS_LABEL[selected.status]}
                      </span>
                    );
                  })()}
                </div>
                <p className="text-sm text-muted-foreground mt-1">{selected.desc}</p>
              </div>
            </div>

            {/* 开发记录 */}
            {(selected.commits || selected.changes || selected.date) && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2">
                <h3 className="text-sm font-semibold">开发记录</h3>
                {selected.date && (
                  <p className="text-xs text-muted-foreground">完成日期: {selected.date}</p>
                )}
                {selected.commits && selected.commits.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">Commits:</p>
                    <div className="flex flex-wrap gap-1">
                      {selected.commits.map((c) => (
                        <span key={c} className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-mono text-primary">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selected.changes && selected.changes.length > 0 && (
                  <div>
                    <p className="text-[10px] font-medium text-muted-foreground mb-1">改动说明:</p>
                    <ul className="space-y-0.5">
                      {selected.changes.map((c, i) => (
                        <li key={i} className="text-xs text-muted-foreground">• {c}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* 规范正文 */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                <FileText size={14} className="text-muted-foreground" />
                <span className="text-xs font-medium text-muted-foreground">{selected.fileName}</span>
              </div>
              <div className="p-4">
                {loadingContent ? (
                  <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">加载中...</div>
                ) : (
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono">{specContent}</pre>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <FileText className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">选择左侧规范查看详情</p>
          </div>
        )}
      </div>
    </div>
  );
}

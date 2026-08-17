"use client";

import type { WorkflowNodeType } from "@/stores/workflow-store";
import {
  Play,
  Bot,
  Wrench,
  GitBranch,
  Repeat,
  Code2,
  Database,
  Square,
  Globe,
  Bell,
  Zap,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
  group: "flow" | "action";
}

const paletteItems: PaletteItem[] = [
  // Flow control
  { type: "start", label: "开始", icon: Play, color: "text-emerald-500", group: "flow" },
  { type: "condition", label: "条件", icon: GitBranch, color: "text-sky-500", group: "flow" },
  { type: "loop", label: "循环", icon: Repeat, color: "text-orange-500", group: "flow" },
  { type: "end", label: "结束", icon: Square, color: "text-red-500", group: "flow" },
  // Actions
  { type: "llm", label: "LLM 调用", icon: Bot, color: "text-violet-500", group: "action" },
  { type: "http", label: "HTTP 请求", icon: Globe, color: "text-blue-500", group: "action" },
  { type: "notify", label: "发送通知", icon: Bell, color: "text-amber-500", group: "action" },
  { type: "organ", label: "器官调用", icon: Zap, color: "text-pink-500", group: "action" },
  { type: "knowledge", label: "知识库搜索", icon: Database, color: "text-teal-500", group: "action" },
  { type: "script", label: "执行脚本", icon: Terminal, color: "text-orange-400", group: "action" },
  { type: "tool", label: "工具", icon: Wrench, color: "text-amber-500", group: "action" },
  { type: "code", label: "代码", icon: Code2, color: "text-pink-500", group: "action" },
];

const nodeTypeMap: Record<WorkflowNodeType, string> = {
  start: "startNode",
  llm: "llmNode",
  tool: "toolNode",
  condition: "conditionNode",
  loop: "loopNode",
  code: "codeNode",
  knowledge: "knowledgeNode",
  http: "httpNode",
  notify: "notifyNode",
  organ: "organNode",
  script: "scriptNode",
  end: "endNode",
};

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/reactflow-type", nodeTypeMap[item.type]);
    e.dataTransfer.setData("application/reactflow-data-type", item.type);
    e.dataTransfer.setData("application/reactflow-label", item.label);
    e.dataTransfer.effectAllowed = "move";
  };

  const flowItems = paletteItems.filter((i) => i.group === "flow");
  const actionItems = paletteItems.filter((i) => i.group === "action");

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h3 className="text-xs font-medium text-foreground">节点</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Flow control */}
        <div>
          <div className="px-2 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">流程控制</div>
          <div className="space-y-1">
            {flowItems.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className={cn(
                  "flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2",
                  "transition-colors hover:border-primary/40 hover:bg-accent active:cursor-grabbing",
                )}
              >
                <item.icon size={15} className={item.color} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Actions */}
        <div>
          <div className="px-2 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">动作</div>
          <div className="space-y-1">
            {actionItems.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className={cn(
                  "flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2",
                  "transition-colors hover:border-primary/40 hover:bg-accent active:cursor-grabbing",
                )}
              >
                <item.icon size={15} className={item.color} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

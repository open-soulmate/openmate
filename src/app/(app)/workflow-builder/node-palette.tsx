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
} from "lucide-react";
import { cn } from "@/lib/utils";

interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
}

const paletteItems: PaletteItem[] = [
  { type: "start", label: "开始", icon: Play, color: "text-emerald-500" },
  { type: "llm", label: "LLM", icon: Bot, color: "text-violet-500" },
  { type: "tool", label: "工具", icon: Wrench, color: "text-amber-500" },
  { type: "condition", label: "条件", icon: GitBranch, color: "text-sky-500" },
  { type: "loop", label: "循环", icon: Repeat, color: "text-orange-500" },
  { type: "code", label: "代码", icon: Code2, color: "text-pink-500" },
  { type: "knowledge", label: "知识库", icon: Database, color: "text-teal-500" },
  { type: "end", label: "结束", icon: Square, color: "text-red-500" },
];

const nodeTypeMap: Record<WorkflowNodeType, string> = {
  start: "startNode",
  llm: "llmNode",
  tool: "toolNode",
  condition: "conditionNode",
  loop: "loopNode",
  code: "codeNode",
  knowledge: "knowledgeNode",
  end: "endNode",
};

export function NodePalette() {
  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/reactflow-type", nodeTypeMap[item.type]);
    e.dataTransfer.setData("application/reactflow-data-type", item.type);
    e.dataTransfer.setData("application/reactflow-label", item.label);
    e.dataTransfer.effectAllowed = "move";
  };

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h3 className="text-xs font-medium text-foreground">节点</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {paletteItems.map((item) => (
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
  );
}

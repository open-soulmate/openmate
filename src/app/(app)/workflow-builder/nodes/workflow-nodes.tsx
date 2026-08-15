"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { WorkflowNodeData } from "@/stores/workflow-store";
import {
  Play,
  Bot,
  Wrench,
  GitBranch,
  Repeat,
  Code2,
  Database,
  Square,
  Loader2,
  Globe,
  Bell,
  Zap,
  Terminal,
} from "lucide-react";

const nodeColors: Record<WorkflowNodeData["type"], { bg: string; border: string; icon: string }> = {
  start: { bg: "bg-emerald-500/10", border: "border-emerald-500/40", icon: "text-emerald-500" },
  llm: { bg: "bg-violet-500/10", border: "border-violet-500/40", icon: "text-violet-500" },
  tool: { bg: "bg-amber-500/10", border: "border-amber-500/40", icon: "text-amber-500" },
  condition: { bg: "bg-sky-500/10", border: "border-sky-500/40", icon: "text-sky-500" },
  loop: { bg: "bg-orange-500/10", border: "border-orange-500/40", icon: "text-orange-500" },
  code: { bg: "bg-pink-500/10", border: "border-pink-500/40", icon: "text-pink-500" },
  knowledge: { bg: "bg-teal-500/10", border: "border-teal-500/40", icon: "text-teal-500" },
  http: { bg: "bg-blue-500/10", border: "border-blue-500/40", icon: "text-blue-500" },
  notify: { bg: "bg-amber-500/10", border: "border-amber-500/40", icon: "text-amber-500" },
  organ: { bg: "bg-pink-500/10", border: "border-pink-500/40", icon: "text-pink-500" },
  script: { bg: "bg-orange-400/10", border: "border-orange-400/40", icon: "text-orange-400" },
  end: { bg: "bg-red-500/10", border: "border-red-500/40", icon: "text-red-500" },
};

const nodeIcons: Record<WorkflowNodeData["type"], React.ElementType> = {
  start: Play,
  llm: Bot,
  tool: Wrench,
  condition: GitBranch,
  loop: Repeat,
  code: Code2,
  knowledge: Database,
  http: Globe,
  notify: Bell,
  organ: Zap,
  script: Terminal,
  end: Square,
};

interface BaseNodeProps {
  data: WorkflowNodeData;
  selected?: boolean;
  sourceHandleCount?: number;
  showTarget?: boolean;
  debugActive?: boolean;
}

function BaseNodeInner({
  data,
  selected,
  sourceHandleCount = 1,
  showTarget = true,
  debugActive,
}: BaseNodeProps) {
  const colors = nodeColors[data.type];
  const Icon = nodeIcons[data.type];

  return (
    <div
      className={cn(
        "relative min-w-[180px] rounded-xl border-2 bg-card shadow-sm transition-all",
        colors.border,
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        debugActive && "ring-2 ring-amber-400 ring-offset-2 ring-offset-background animate-pulse",
      )}
    >
      {showTarget && (
        <Handle
          type="target"
          position={Position.Top}
          className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-muted-foreground"
        />
      )}

      <div className={cn("flex items-center gap-2.5 px-3 py-2.5", colors.bg, "rounded-t-[10px]")}>
        <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", colors.bg)}>
          <Icon size={15} className={colors.icon} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{data.label}</p>
          {data.description && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              {data.description}
            </p>
          )}
        </div>
        {debugActive && (
          <Loader2 size={14} className="animate-spin text-amber-500 shrink-0" />
        )}
      </div>

      {sourceHandleCount === 1 ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-muted-foreground"
        />
      ) : (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-emerald-500"
            style={{ left: "30%" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!h-3 !w-3 !rounded-full !border-2 !border-border !bg-red-500"
            style={{ left: "70%" }}
          />
        </>
      )}
    </div>
  );
}

// ── Individual node components ──────────────────────────────────────────────

export const StartNode = memo(function StartNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      showTarget={false}
      sourceHandleCount={1}
    />
  );
});

export const LLMNode = memo(function LLMNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const ToolNode = memo(function ToolNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const ConditionNode = memo(function ConditionNode({ data, selected }: NodeProps) {
  return (
    <div className="relative">
      <BaseNodeInner
        data={data as unknown as WorkflowNodeData}
        selected={selected}
        sourceHandleCount={2}
      />
      <div className="absolute -bottom-5 left-0 right-0 flex justify-around px-4">
        <span className="text-[9px] font-medium text-emerald-500">True</span>
        <span className="text-[9px] font-medium text-red-500">False</span>
      </div>
    </div>
  );
});

export const LoopNode = memo(function LoopNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const CodeNode = memo(function CodeNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const KnowledgeNode = memo(function KnowledgeNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const HTTPNode = memo(function HTTPNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const NotifyNode = memo(function NotifyNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const OrganNode = memo(function OrganNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const ScriptNode = memo(function ScriptNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      sourceHandleCount={1}
    />
  );
});

export const EndNode = memo(function EndNode({ data, selected }: NodeProps) {
  return (
    <BaseNodeInner
      data={data as unknown as WorkflowNodeData}
      selected={selected}
      showTarget={true}
      sourceHandleCount={0}
    />
  );
});

export const nodeTypes = {
  startNode: StartNode,
  llmNode: LLMNode,
  toolNode: ToolNode,
  conditionNode: ConditionNode,
  loopNode: LoopNode,
  codeNode: CodeNode,
  knowledgeNode: KnowledgeNode,
  httpNode: HTTPNode,
  notifyNode: NotifyNode,
  organNode: OrganNode,
  scriptNode: ScriptNode,
  endNode: EndNode,
};

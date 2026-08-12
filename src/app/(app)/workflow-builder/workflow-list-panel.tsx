"use client";

import { useState } from "react";
import { useWorkflowStore, type WorkflowNodeData } from "@/stores/workflow-store";
import type { Node, Edge } from "@xyflow/react";
import {
  Workflow,
  Copy,
  Trash2,
  PanelLeftClose,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowListPanelProps {
  onLoad: (nodes: Node<WorkflowNodeData>[], edges: Edge[]) => void;
}

export function WorkflowListPanel({ onLoad }: WorkflowListPanelProps) {
  const workflows = useWorkflowStore((s) => s.workflows);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const loadWorkflow = useWorkflowStore((s) => s.loadWorkflow);
  const deleteWorkflow = useWorkflowStore((s) => s.deleteWorkflow);
  const duplicateWorkflow = useWorkflowStore((s) => s.duplicateWorkflow);
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    loadWorkflow(id);
    const wf = useWorkflowStore.getState().workflows.find((w) => w.id === id);
    if (wf) onLoad(wf.nodes, wf.edges);
  };

  const handleDelete = (id: string) => {
    deleteWorkflow(id);
    setConfirmDeleteId(null);
  };

  const handleDuplicate = (id: string) => {
    const newId = duplicateWorkflow(id);
    if (newId) handleSelect(newId);
  };

  if (collapsed) {
    return (
      <div className="flex h-full w-10 shrink-0 flex-col items-center border-r border-border bg-card py-2">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="展开列表"
        >
          <ChevronRight size={14} />
        </button>
        <span className="mt-2 text-[10px] text-muted-foreground writing-mode-vertical">
          {workflows.length}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-52 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-3">
        <h3 className="text-xs font-medium text-foreground">工作流列表</h3>
        <button
          onClick={() => setCollapsed(true)}
          className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <PanelLeftClose size={13} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {workflows.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center px-3">
            <Workflow size={24} className="mb-2 text-muted-foreground/40" />
            <p className="text-[11px] text-muted-foreground">暂无工作流</p>
          </div>
        ) : (
          workflows.map((wf) => (
            <div
              key={wf.id}
              onClick={() => handleSelect(wf.id)}
              className={cn(
                "group flex cursor-pointer flex-col rounded-lg border px-2.5 py-2 transition-colors",
                wf.id === activeWorkflowId
                  ? "border-primary/40 bg-primary/5"
                  : "border-transparent hover:border-border hover:bg-accent",
              )}
            >
              <div className="flex items-center justify-between">
                <span className="truncate text-xs font-medium text-foreground">
                  {wf.name}
                </span>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicate(wf.id);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    title="复制"
                  >
                    <Copy size={11} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(wf.id);
                    }}
                    className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-destructive"
                    title="删除"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {wf.nodes.length} 节点 · v{wf.version}
              </span>
            </div>
          ))
        )}
      </div>

      {/* Delete confirm */}
      {confirmDeleteId && (
        <div className="border-t border-border p-2">
          <p className="mb-2 text-[11px] text-muted-foreground">确认删除？</p>
          <div className="flex gap-1">
            <button
              onClick={() => handleDelete(confirmDeleteId)}
              className="flex-1 rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </button>
            <button
              onClick={() => setConfirmDeleteId(null)}
              className="flex-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

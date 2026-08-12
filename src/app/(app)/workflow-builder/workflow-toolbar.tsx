"use client";

import { useRef } from "react";
import { useWorkflowStore } from "@/stores/workflow-store";
import {
  Play,
  Bug,
  Save,
  Download,
  Upload,
  History,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkflowToolbarProps {
  onCreateNew: () => void;
}

export function WorkflowToolbar({ onCreateNew }: WorkflowToolbarProps) {
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const debugMode = useWorkflowStore((s) => s.debugMode);
  const setDebugMode = useWorkflowStore((s) => s.setDebugMode);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const activeWorkflow = useWorkflowStore((s) => s.activeWorkflow);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    if (!activeWorkflowId) return;
    const json = exportWorkflow(activeWorkflowId);
    if (!json) return;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeWorkflow?.name || "workflow"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => fileRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text === "string") importWorkflow(text);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleRun = () => {
    // Placeholder: would trigger workflow execution
    alert("运行工作流（功能开发中）");
  };

  const handleDebug = () => {
    setDebugMode(!debugMode);
  };

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      <button
        onClick={onCreateNew}
        className={toolbarBtnCls}
        title="新建工作流"
      >
        <Plus size={14} />
        <span className="text-xs">新建</span>
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        onClick={handleRun}
        disabled={!activeWorkflowId}
        className={cn(toolbarBtnCls, "text-emerald-600 hover:bg-emerald-500/10")}
        title="运行"
      >
        <Play size={14} />
        <span className="text-xs">运行</span>
      </button>

      <button
        onClick={handleDebug}
        disabled={!activeWorkflowId}
        className={cn(
          toolbarBtnCls,
          debugMode
            ? "bg-amber-500/15 text-amber-600"
            : "text-amber-600 hover:bg-amber-500/10",
        )}
        title="调试模式"
      >
        <Bug size={14} />
        <span className="text-xs">调试</span>
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        onClick={saveWorkflow}
        disabled={!activeWorkflowId || !isDirty}
        className={cn(toolbarBtnCls, isDirty && "text-primary")}
        title="保存"
      >
        <Save size={14} />
        <span className="text-xs">保存{isDirty ? " *" : ""}</span>
      </button>

      <button onClick={handleExport} disabled={!activeWorkflowId} className={toolbarBtnCls} title="导出">
        <Download size={14} />
        <span className="text-xs">导出</span>
      </button>

      <button onClick={handleImport} className={toolbarBtnCls} title="导入">
        <Upload size={14} />
        <span className="text-xs">导入</span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex-1" />

      {activeWorkflow && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <History size={12} />
          <span>v{activeWorkflow.version}</span>
          <span>·</span>
          <span>{new Date(activeWorkflow.updatedAt).toLocaleString("zh-CN")}</span>
        </div>
      )}
    </div>
  );
}

const toolbarBtnCls =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:pointer-events-none";

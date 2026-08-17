"use client";

import { useRef } from "react";
import { useWorkflowStore } from "@//stores/workflow-store";
import {
  Play,
  Bug,
  Save,
  Download,
  Upload,
  History,
  Plus,
  StopCircle,
  Loader2,
  PanelBottomOpen,
} from "lucide-react";
import { cn } from "@//lib/utils";
import { useTranslation } from "react-i18next";

interface WorkflowToolbarProps {
  onCreateNew: () => void;
}

export function WorkflowToolbar({ onCreateNew }: WorkflowToolbarProps) {
  const { t } = useTranslation();
  const isDirty = useWorkflowStore((s) => s.isDirty);
  const debugMode = useWorkflowStore((s) => s.debugMode);
  const setDebugMode = useWorkflowStore((s) => s.setDebugMode);
  const saveWorkflow = useWorkflowStore((s) => s.saveWorkflow);
  const activeWorkflowId = useWorkflowStore((s) => s.activeWorkflowId);
  const exportWorkflow = useWorkflowStore((s) => s.exportWorkflow);
  const importWorkflow = useWorkflowStore((s) => s.importWorkflow);
  const activeWorkflow = useWorkflowStore((s) => s.activeWorkflow);
  const isExecuting = useWorkflowStore((s) => s.isExecuting);
  const runWorkflow = useWorkflowStore((s) => s.runWorkflow);
  const cancelExecution = useWorkflowStore((s) => s.cancelExecution);
  const showExecutionPanel = useWorkflowStore((s) => s.showExecutionPanel);
  const toggleExecutionPanel = useWorkflowStore((s) => s.toggleExecutionPanel);
  const currentExecution = useWorkflowStore((s) => s.currentExecution);
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

  const handleRun = async () => {
    if (isExecuting) {
      await cancelExecution();
    } else {
      await runWorkflow();
    }
  };

  const handleDebug = () => {
    setDebugMode(!debugMode);
  };

  // Execution status indicator
  const execStatus = currentExecution?.status;
  const execStatusColor =
    execStatus === "completed"
      ? "text-emerald-500"
      : execStatus === "failed"
        ? "text-red-500"
        : execStatus === "running"
          ? "text-blue-500"
          : execStatus === "cancelled"
            ? "text-amber-500"
            : "text-muted-foreground";

  return (
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border bg-card px-3">
      <button
        onClick={onCreateNew}
        className={toolbarBtnCls}
        title={t('workflow.toolbar.newWorkflow')}
      >
        <Plus size={14} />
        <span className="text-xs">{t('workflow.toolbar.new')}</span>
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        onClick={handleRun}
        disabled={!activeWorkflowId}
        className={cn(
          toolbarBtnCls,
          isExecuting
            ? "text-red-600 hover:bg-red-500/10"
            : "text-emerald-600 hover:bg-emerald-500/10",
        )}
        title={isExecuting ? t('workflow.toolbar.cancelExecution') : t('workflow.toolbar.runWorkflow')}
      >
        {isExecuting ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            <span className="text-xs">{t('workflow.toolbar.stop')}</span>
          </>
        ) : (
          <>
            <Play size={14} />
            <span className="text-xs">{t('workflow.toolbar.run')}</span>
          </>
        )}
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
        title={t('workflow.toolbar.debugMode')}
      >
        <Bug size={14} />
        <span className="text-xs">{t('workflow.toolbar.debug')}</span>
      </button>

      <div className="mx-1 h-5 w-px bg-border" />

      <button
        onClick={saveWorkflow}
        disabled={!activeWorkflowId || !isDirty}
        className={cn(toolbarBtnCls, isDirty && "text-primary")}
        title={t('workflow.toolbar.save')}
      >
        <Save size={14} />
        <span className="text-xs">{t('workflow.toolbar.save')}{isDirty ? ' *' : ''}</span>
      </button>

      <button
        onClick={handleExport}
        disabled={!activeWorkflowId}
        className={toolbarBtnCls}
        title={t('workflow.toolbar.export')}
      >
        <Download size={14} />
        <span className="text-xs">{t('workflow.toolbar.export')}</span>
      </button>

      <button onClick={handleImport} className={toolbarBtnCls} title={t('workflow.toolbar.import')}>
        <Upload size={14} />
        <span className="text-xs">{t('workflow.toolbar.import')}</span>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept=".json"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className="flex-1" />

      {/* Execution status */}
      {currentExecution && (
        <button
          onClick={toggleExecutionPanel}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs transition-colors hover:bg-accent",
            execStatusColor,
          )}
          title={t('workflow.toolbar.viewResult')}
        >
          {isExecuting ? (
            <Loader2 size={12} className="animate-spin" />
          ) : execStatus === "completed" ? (
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
          ) : execStatus === "failed" ? (
            <span className="inline-block h-2 w-2 rounded-full bg-red-500" />
          ) : (
            <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
          )}
          <span>{currentExecution.status}</span>
        </button>
      )}

      <button
        onClick={toggleExecutionPanel}
        className={cn(
          toolbarBtnCls,
          showExecutionPanel && "bg-accent text-foreground",
        )}
        title={t('workflow.toolbar.executionPanel')}
      >
        <PanelBottomOpen size={14} />
      </button>

      {activeWorkflow && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground ml-2">
          <History size={12} />
          <span>v{activeWorkflow.version}</span>
          <span>·</span>
          <span>
            {new Date(activeWorkflow.updatedAt).toLocaleString("zh-CN")}
          </span>
        </div>
      )}
    </div>
  );
}

const toolbarBtnCls =
  "flex h-7 items-center gap-1.5 rounded-md px-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 disabled:pointer-events-none";

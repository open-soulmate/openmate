"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import {
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Plus,
  Clock,
  Calendar,
  Workflow,
  Filter,
} from "lucide-react";

type TaskStatus = "running" | "completed" | "failed" | "paused" | "pending";

interface WorkflowTask {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: string;
  nextRun: string | null;
  description: string;
}

const mockTasks: WorkflowTask[] = [
  {
    id: "wf-1",
    name: "Daily Knowledge Sync",
    status: "running",
    createdAt: "2024-01-15 09:00",
    nextRun: "Tomorrow 09:00",
    description: "Sync and index new documents from connected sources.",
  },
  {
    id: "wf-2",
    name: "Weekly Report Generation",
    status: "completed",
    createdAt: "2024-01-10 14:30",
    nextRun: "Next Monday 08:00",
    description: "Generate weekly activity and insights report.",
  },
  {
    id: "wf-3",
    name: "Backup Agent Configs",
    status: "paused",
    createdAt: "2024-01-08 11:00",
    nextRun: null,
    description: "Create backups of all agent configurations.",
  },
  {
    id: "wf-4",
    name: "Email Digest",
    status: "failed",
    createdAt: "2024-01-12 16:45",
    nextRun: null,
    description: "Send email digest of recent knowledge updates.",
  },
  {
    id: "wf-5",
    name: "Skill Auto-Update",
    status: "pending",
    createdAt: "2024-01-14 08:00",
    nextRun: "In 2 hours",
    description: "Check and update installed skills to latest versions.",
  },
];

const statusConfig: Record<TaskStatus, { variant: "default" | "success" | "warning" | "destructive"; label: string }> = {
  running: { variant: "success", label: "Running" },
  completed: { variant: "default", label: "Completed" },
  failed: { variant: "destructive", label: "Failed" },
  paused: { variant: "warning", label: "Paused" },
  pending: { variant: "default", label: "Pending" },
};

const filters: { value: TaskStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "paused", label: "Paused" },
];

export function WorkflowClient() {
  const [tasks, setTasks] = useState(mockTasks);
  const [activeFilter, setActiveFilter] = useState<TaskStatus | "all">("all");
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTask | null>(null);

  const filtered = activeFilter === "all" ? tasks : tasks.filter((t) => t.status === activeFilter);

  function togglePause(id: string) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, status: t.status === "paused" ? "running" : "paused" } : t,
      ),
    );
  }

  function handleRun(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "running" as const } : t)),
    );
  }

  function handleDelete(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setDeleteTarget(null);
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Workflow size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">Workflows</h2>
            <p className="text-xs text-muted-foreground">
              {tasks.filter((t) => t.status === "running").length} running · {tasks.length} total
            </p>
          </div>
        </div>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus size={14} />
          New Workflow
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 border-b border-border px-6 py-2">
        <Filter size={13} className="mr-1 text-muted-foreground" />
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setActiveFilter(f.value)}
            className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
              activeFilter === f.value
                ? "bg-primary/15 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Workflow className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">
              {activeFilter === "all" ? "No workflows yet" : `No ${activeFilter} workflows`}
            </h3>
            <p className="mb-4 max-w-xs text-xs text-muted-foreground">
              {activeFilter === "all"
                ? "Create your first workflow to automate repetitive tasks."
                : "Try changing the filter to see other workflows."}
            </p>
            {activeFilter === "all" && (
              <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                <Plus size={14} />
                Create Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((task) => {
              const { variant, label } = statusConfig[task.status];
              return (
                <div
                  key={task.id}
                  className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="text-sm font-medium">{task.name}</h3>
                        <Badge variant={variant}>{label}</Badge>
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">
                        {task.description}
                      </p>
                      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar size={11} />
                          Created: {task.createdAt}
                        </span>
                        {task.nextRun && (
                          <span className="flex items-center gap-1">
                            <Clock size={11} />
                            Next: {task.nextRun}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {(task.status === "paused" || task.status === "failed") && (
                        <button
                          onClick={() => handleRun(task.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Run"
                        >
                          <Play size={13} />
                        </button>
                      )}
                      {task.status === "running" && (
                        <button
                          onClick={() => togglePause(task.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Pause"
                        >
                          <Pause size={13} />
                        </button>
                      )}
                      {task.status === "paused" && (
                        <button
                          onClick={() => togglePause(task.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                          title="Resume"
                        >
                          <RotateCcw size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(task)}
                        className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Workflow"
        description={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Workflow size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{deleteTarget?.description}</p>
        </div>
      </Dialog>
    </div>
  );
}

"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, FileText, Loader2, CheckCircle, XCircle, Clock, Folder, ArrowRight } from "lucide-react";

export interface WorkflowStep {
  id: string;
  type: "tool_call" | "file_create" | "file_edit" | "thinking" | "decision";
  name: string;
  status: "running" | "completed" | "failed" | "pending";
  detail?: string;
  files?: string[];
  timestamp: number;
}

interface WorkflowPanelProps {
  steps: WorkflowStep[];
  isRunning: boolean;
  onFileClick?: (path: string) => void;
}

const statusConfig = {
  running: { icon: Loader2, color: "text-blue-500", bg: "bg-blue-500/10", label: "执行中" },
  completed: { icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10", label: "完成" },
  failed: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", label: "失败" },
  pending: { icon: Clock, color: "text-muted-foreground", bg: "bg-muted/30", label: "等待中" },
};

const typeLabels = {
  tool_call: "🔧 工具调用",
  file_create: "📄 创建文件",
  file_edit: "✏️ 编辑文件",
  thinking: "💭 思考",
  decision: "🤔 决策",
};

export function WorkflowPanel({ steps, isRunning, onFileClick }: WorkflowPanelProps) {
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
  const [showAllFiles, setShowAllFiles] = useState(false);

  const toggleStep = (id: string) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 收集所有生成的文件
  const allFiles = steps.flatMap(s => s.files || []);
  const uniqueFiles = [...new Set(allFiles)];

  // 当前正在运行的步骤
  const runningStep = steps.find(s => s.status === "running");

  return (
    <div className="h-full flex flex-col bg-card/50">
      {/* 头部 */}
      <div className="px-4 py-3 border-b border-border/50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground/90">工作流程</h3>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500">
              <Loader2 className="w-3 h-3 animate-spin" />
              运行中
            </span>
          )}
        </div>
        {runningStep && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            当前：{runningStep.name}
          </p>
        )}
      </div>

      {/* 文件列表（快速访问） */}
      {uniqueFiles.length > 0 && (
        <div className="px-4 py-3 border-b border-border/50">
          <button
            onClick={() => setShowAllFiles(!showAllFiles)}
            className="flex items-center gap-2 w-full text-left"
          >
            <Folder className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground/80">
              生成的文件 ({uniqueFiles.length})
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground ml-auto transition-transform ${showAllFiles ? 'rotate-180' : ''}`} />
          </button>
          {showAllFiles && (
            <div className="mt-2 space-y-1">
              {uniqueFiles.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => onFileClick?.(file)}
                  className="flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-xs hover:bg-muted/50 transition-colors group"
                >
                  <FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary" />
                  <span className="truncate flex-1 text-left">{file.split('/').pop()}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 步骤列表 */}
      <div className="flex-1 overflow-y-auto px-4 py-2 space-y-1">
        {steps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">等待任务开始...</p>
          </div>
        ) : (
          steps.map((step, idx) => {
            const config = statusConfig[step.status];
            const Icon = config.icon;
            const isExpanded = expandedSteps.has(step.id);
            const hasDetail = step.detail || (step.files && step.files.length > 0);

            return (
              <div
                key={step.id}
                className={`rounded-lg border overflow-hidden transition-all ${
                  step.status === "running"
                    ? "border-blue-500/30 bg-blue-500/5"
                    : "border-border/30 bg-background/50"
                }`}
              >
                <button
                  onClick={() => hasDetail && toggleStep(step.id)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left ${
                    hasDetail ? "cursor-pointer hover:bg-muted/30" : "cursor-default"
                  }`}
                >
                  {/* 序号 */}
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/50 text-[10px] font-medium text-muted-foreground flex items-center justify-center">
                    {idx + 1}
                  </span>

                  {/* 类型标签 */}
                  <span className="flex-shrink-0 text-xs">
                    {typeLabels[step.type]}
                  </span>

                  {/* 名称 */}
                  <span className="flex-1 text-xs font-medium text-foreground/80 truncate">
                    {step.name}
                  </span>

                  {/* 状态 */}
                  <span className={`flex items-center gap-1 text-xs ${config.color}`}>
                    <Icon className={`w-3 h-3 ${step.status === "running" ? "animate-spin" : ""}`} />
                    {config.label}
                  </span>

                  {/* 展开箭头 */}
                  {hasDetail && (
                    <ChevronRight className={`w-3 h-3 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  )}
                </button>

                {/* 详情 */}
                {isExpanded && hasDetail && (
                  <div className="px-3 pb-2 border-t border-border/20">
                    {step.detail && (
                      <p className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap">
                        {step.detail}
                      </p>
                    )}
                    {step.files && step.files.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {step.files.map((file, fIdx) => (
                          <button
                            key={fIdx}
                            onClick={() => onFileClick?.(file)}
                            className="flex items-center gap-2 w-full px-2 py-1 rounded text-xs hover:bg-muted/50 transition-colors"
                          >
                            <FileText className="w-3 h-3 text-muted-foreground" />
                            <span className="truncate">{file}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 底部统计 */}
      {steps.length > 0 && (
        <div className="px-4 py-2 border-t border-border/50 bg-muted/20">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>共 {steps.length} 步</span>
            <span>
              {steps.filter(s => s.status === "completed").length} 完成 ·{" "}
              {steps.filter(s => s.status === "failed").length} 失败
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

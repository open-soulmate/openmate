"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Send, Activity, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";

export interface ChoiceOption {
  id: string;
  label: string;
  description?: string;
}

interface TaskChoiceMenuProps {
  question: string;
  options: ChoiceOption[];
  onSelect: (optionId: string, label: string) => void;
  onCustomSubmit: (text: string) => void;
  disabled?: boolean;
  pageSize?: number;
}

export function TaskChoiceMenu({
  question,
  options,
  onSelect,
  onCustomSubmit,
  disabled = false,
  pageSize = 5,
}: TaskChoiceMenuProps) {
  const [page, setPage] = useState(0);
  const [customText, setCustomText] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const totalPages = Math.ceil(options.length / pageSize);
  const pagedOptions = options.slice(page * pageSize, (page + 1) * pageSize);

  // 从 app-store 获取自省状态和触发方法
  const selfDiagnosisState = useStore((state) => state.selfDiagnosisState);
  const triggerSelfDiagnosis = useStore((state) => state.triggerSelfDiagnosis);

  // 检查是否有关键发现
  const hasCriticalFindings = selfDiagnosisState?.findings?.some(
    (f) => f.severity === "critical"
  );

  // 根据选项ID查找是否有关联的关键发现
  const getRelatedCriticalFinding = (optionId: string) => {
    return selfDiagnosisState?.findings?.find(
      (f) => f.severity === "critical" && f.taskId === optionId
    );
  };

  const handleSelect = (opt: ChoiceOption) => {
    if (disabled || selected) return;
    setSelected(opt.id);
    onSelect(opt.id, opt.label);
  };

  const handleCustomSubmit = () => {
    if (!customText.trim() || disabled) return;
    onCustomSubmit(customText.trim());
  };

  const handleSelfDiagnosis = () => {
    if (disabled || selected) return;
    setSelected("system-diagnosis");
    triggerSelfDiagnosis();
    // 这里可以设置一个超时，或者让父组件通过 selected 状态来处理
    // 为简单起见，我们暂时将 selected 设回 null，以便触发 UI 更新
    setTimeout(() => setSelected(null), 100);
  };

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm overflow-hidden">
      {/* 标题 */}
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
        <p className="text-sm font-medium text-foreground/90">{question}</p>
      </div>

      {/* 系统自检状态提示条 */}
      {selfDiagnosisState && (
        <div className={`px-4 py-2 border-b border-border/30 text-xs ${
          selfDiagnosisState.status === "running"
            ? "bg-blue-50 text-blue-700"
            : hasCriticalFindings
              ? "bg-red-50 text-red-700"
              : "bg-emerald-50 text-emerald-700"
        }`}>
          <div className="flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="font-medium">
              {selfDiagnosisState.status === "running"
                ? "系统自检中..."
                : hasCriticalFindings
                  ? `检测到${selfDiagnosisState.findings?.filter((f) => f.severity === "critical").length}个关键问题`
                  : "系统状态良好"}
            </span>
          </div>
          {selfDiagnosisState.summary && selfDiagnosisState.status !== "running" && (
            <p className="mt-1 line-clamp-2">{selfDiagnosisState.summary}</p>
          )}
        </div>
      )}

      {/* 选项列表 */}
      <div className="divide-y divide-border/30">
        {/* 系统健康自检菜单项 */}
        <button
          onClick={handleSelfDiagnosis}
          disabled={disabled || !!selected}
          className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all
            ${selected === "system-diagnosis"
              ? "bg-blue-50 border-l-2 border-blue-500"
              : selected
                ? "opacity-50 cursor-not-allowed"
                : "hover:bg-muted/50 active:bg-muted/70 cursor-pointer"
            }`}
        >
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold flex items-center justify-center mt-0.5">
            🩺
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-sm font-medium text-foreground/90">系统健康自检</span>
            <p className="text-xs text-muted-foreground mt-0.5">检查系统状态与进化进程</p>
          </div>
          {selected === "system-diagnosis" && (
            <span className="flex-shrink-0 text-xs text-blue-600 font-medium mt-1">✓ 已触发</span>
          )}
        </button>

        {/* 常规任务选项 */}
        {pagedOptions.map((opt, idx) => {
          const relatedCritical = getRelatedCriticalFinding(opt.id);
          return (
            <button
              key={opt.id}
              onClick={() => handleSelect(opt)}
              disabled={disabled || !!selected}
              className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-all
                ${selected === opt.id
                  ? "bg-primary/10 border-l-2 border-primary"
                  : selected
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-muted/50 active:bg-muted/70 cursor-pointer"
                }`}
            >
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center mt-0.5">
                {page * pageSize + idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground/90">{opt.label}</span>
                  {relatedCritical && (
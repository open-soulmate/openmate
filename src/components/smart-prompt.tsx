'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Send,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────

interface SmartPromptFields {
  task: string;
  role: string;
  background: string;
  constraints: string;
  format: string;
}

interface SmartPromptProps {
  /** Callback when user sends the assembled prompt */
  onSend: (assembled: string, fields: SmartPromptFields) => void;
  /** Whether the AI is currently generating */
  isLoading?: boolean;
  /** Placeholder for the task field */
  placeholder?: string;
  /** Additional context to pass to the auto-generate API */
  context?: string;
  /** Extra className */
  className?: string;
}

// ── Field Definitions ────────────────────────────────────────────

const FIELD_DEFS = [
  { key: 'role' as const, icon: '👤', label: '角色', placeholder: '例如：性能优化工程师' },
  { key: 'background' as const, icon: '📋', label: '背景', placeholder: '例如：Node.js后端服务' },
  { key: 'constraints' as const, icon: '📏', label: '约束', placeholder: '例如：不能改数据库结构' },
  { key: 'format' as const, icon: '📐', label: '格式', placeholder: '例如：给出代码示例' },
];

// ── Prompt Assembly ──────────────────────────────────────────────

function assemblePrompt(fields: SmartPromptFields): string {
  const parts: string[] = [];

  if (fields.role.trim()) {
    parts.push(`## 角色\n${fields.role.trim()}`);
  }
  if (fields.background.trim()) {
    parts.push(`## 背景\n${fields.background.trim()}`);
  }
  if (fields.task.trim()) {
    parts.push(`## 任务\n${fields.task.trim()}`);
  }
  if (fields.constraints.trim()) {
    parts.push(`## 约束\n${fields.constraints.trim()}`);
  }
  if (fields.format.trim()) {
    parts.push(`## 输出格式\n${fields.format.trim()}`);
  }

  return parts.join('\n\n');
}

// ── Main Component ───────────────────────────────────────────────

export function SmartPrompt({
  onSend,
  isLoading = false,
  placeholder = '输入任务...',
  context,
  className,
}: SmartPromptProps) {
  const [fields, setFields] = useState<SmartPromptFields>({
    task: '',
    role: '',
    background: '',
    constraints: '',
    format: '',
  });
  const [expanded, setExpanded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const taskRef = useRef<HTMLTextAreaElement>(null);
  const generateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-generate other fields when task changes (debounced)
  const autoGenerate = useCallback(
    async (task: string) => {
      if (!task.trim() || task.trim().length < 5) return;
      setGenerating(true);

      try {
        const res = await fetch('/api/smart-prompt/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: task.trim(), context }),
        });

        if (res.ok) {
          const data = await res.json();
          setFields((prev) => ({
            ...prev,
            role: data.role || prev.role,
            background: data.background || prev.background,
            constraints: data.constraints || prev.constraints,
            format: data.format || prev.format,
          }));
          setGenerated(true);
          // Auto-expand to show generated fields
          setExpanded(true);
        }
      } catch {
        // Silent fail — user can still use task-only mode
      } finally {
        setGenerating(false);
      }
    },
    [context],
  );

  // Debounced auto-generate on task change
  useEffect(() => {
    if (generateTimerRef.current) {
      clearTimeout(generateTimerRef.current);
    }
    if (fields.task.trim().length >= 10) {
      generateTimerRef.current = setTimeout(() => {
        autoGenerate(fields.task);
      }, 1500); // 1.5s debounce
    }
    return () => {
      if (generateTimerRef.current) clearTimeout(generateTimerRef.current);
    };
  }, [fields.task, autoGenerate]);

  const updateField = (key: keyof SmartPromptFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleSend = () => {
    if (!fields.task.trim()) return;
    const assembled = assemblePrompt(fields);
    onSend(assembled, fields);
    // Reset after send
    setFields({ task: '', role: '', background: '', constraints: '', format: '' });
    setGenerated(false);
    setExpanded(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setFields({ task: '', role: '', background: '', constraints: '', format: '' });
    setGenerated(false);
  };

  // Auto-resize textarea
  const autoResize = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  };

  return (
    <div
      className={cn(
        'border border-border rounded-xl bg-background shadow-sm transition-all',
        expanded ? 'space-y-2' : '',
        className,
      )}
    >
      {/* Task input — always visible */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1 relative">
          <textarea
            ref={taskRef}
            value={fields.task}
            onChange={(e) => {
              updateField('task', e.target.value);
              autoResize(e.target);
            }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground min-h-[24px] max-h-[120px]"
            disabled={isLoading}
          />
          {/* Generating indicator */}
          {generating && (
            <div className="absolute right-0 top-0 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>分析中...</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Expand/collapse toggle */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
            title={expanded ? '折叠' : '展开'}
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {/* Clear */}
          {(fields.task || generated) && (
            <button
              onClick={handleClear}
              className="p-1.5 rounded-md hover:bg-muted/50 text-muted-foreground transition-colors"
              title="清空"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!fields.task.trim() || isLoading}
            className={cn(
              'p-1.5 rounded-md transition-colors',
              fields.task.trim()
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'text-muted-foreground cursor-not-allowed',
            )}
            title="发送 (Enter)"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Expanded fields */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          {FIELD_DEFS.map((def) => (
            <div key={def.key} className="flex items-center gap-2">
              <span className="text-sm shrink-0 w-5 text-center">{def.icon}</span>
              <label className="text-xs text-muted-foreground shrink-0 w-8">
                {def.label}
              </label>
              <input
                type="text"
                value={fields[def.key]}
                onChange={(e) => updateField(def.key, e.target.value)}
                placeholder={def.placeholder}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50 border-b border-transparent hover:border-border focus:border-primary transition-colors py-1"
              />
              {generated && fields[def.key] && (
                <span title="AI生成"><Sparkles className="w-3 h-3 text-amber-500 shrink-0" /></span>
              )}
            </div>
          ))}

          {/* Hint */}
          <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
            <span>
              {generated ? (
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-500" />
                  AI已预填，可编辑后发送
                </span>
              ) : (
                '输入任务后自动生成其他字段'
              )}
            </span>
            <span>Enter 发送 · Shift+Enter 换行</span>
          </div>
        </div>
      )}
    </div>
  );
}

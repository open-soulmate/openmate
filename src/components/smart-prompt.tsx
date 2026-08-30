'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Send,
  Sparkles,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { RichInput } from '@/components/rich-input';

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

  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const expanded = true; // Always show all fields
  let generateTimerRef: ReturnType<typeof setTimeout> | null = null;

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
    if (generateTimerRef) {
      clearTimeout(generateTimerRef);
    }
    if (fields.task.trim().length >= 10) {
      generateTimerRef = setTimeout(() => {
        autoGenerate(fields.task);
      }, 300); // 1.5s debounce
    }
    return () => {
      if (generateTimerRef) clearTimeout(generateTimerRef);
    };
  }, [fields.task, autoGenerate]);

  const updateField = (key: keyof SmartPromptFields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
  };

  const handleClear = () => {
    if (fields.task || generated) {
      setFields({ task: '', role: '', background: '', constraints: '', format: '' });
      setGenerated(false);
    }
  };

  const handleSend = () => {
    if (!fields.task.trim()) return;
    const assembled = assemblePrompt(fields);
    onSend(assembled, fields);
    // Reset after send
    setFields({ task: '', role: '', background: '', constraints: '', format: '' });
    setGenerated(false);

  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className={cn(
        'border border-border rounded-xl bg-background shadow-sm space-y-2 transition-all',
        className,
      )}
    >
      {/* Task input — always visible */}
      <div className="flex items-end gap-2 p-3">
        <div className="flex-1 relative min-h-[48px] border border-border/50 rounded-lg p-2 hover:border-border focus-within:border-primary transition-colors">
          <RichInput
            value={fields.task}
            onChange={(val) => updateField('task', val)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            minRows={1}
            maxRows={8}
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
          {/* Clear — small, muted, away from send */}
          {(fields.task || generated) && (
            <button
              onClick={handleClear}
              className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              title="清空所有字段"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Fields — always visible */}
      {(
        <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
          {FIELD_DEFS.map((def, idx) => (
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
          <div className="text-[10px] text-muted-foreground pt-1">
            {generated ? (
              <span className="flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-amber-500" />
                AI已预填，可编辑后发送
              </span>
            ) : (
              '输入任务后自动生成其他字段'
            )}
          </div>
        </div>
      )}

    </div>
  );
}

'use client';

import { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import {
  Send,
  Sparkles,
  Loader2,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  Mic,
  Smile,
  Star,
  Paperclip,
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
  /** Footer slot (e.g. action buttons) rendered inside the border */
  footer?: React.ReactNode;
  /** Called when file attach button is clicked */
  onFileClick?: () => void;
  /** Paste handler for clipboard images */
  onPaste?: (e: React.ClipboardEvent) => void;
}

// ── Field Definitions ────────────────────────────────────────────

const FIELD_DEFS = [
  { key: 'background' as const, icon: '📋', label: '背景', placeholder: '例如：Node.js后端服务' },
  { key: 'role' as const, icon: '👤', label: '角色', placeholder: '例如：性能优化工程师' },
  { key: 'format' as const, icon: '📐', label: '格式', placeholder: '例如：给出代码示例' },
  { key: 'constraints' as const, icon: '📏', label: '约束', placeholder: '例如：不能改数据库结构' },
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
  placeholder = '输入任务，点 ✨ 展开字段（Enter 发送，Shift+Enter 换行）',
  context,
  className,
  footer,
  onFileClick,
  onPaste,
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
  const [expanded, setExpanded] = useState(false);
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
    // Reset after send and collapse
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

  // Auto-expand when RichInput content wraps (triggers onOverflow)
  const handleOverflow = useCallback(() => {
    setExpanded(true);
  }, []);

  // Listen for external send trigger (from chat action bar button)
  useEffect(() => {
    const handler = () => handleSend();
    window.addEventListener('smart-prompt-send', handler);
    return () => window.removeEventListener('smart-prompt-send', handler);
  }, [handleSend]);

  return (
    <div
      className={cn(
        'border border-border rounded-xl bg-background space-y-2 transition-all',
        className,
      )}
      onPaste={onPaste}
    >
      {/* Task input — always visible */}
      <div className="p-3">
        <div className="relative min-h-[48px]">
          <RichInput
            value={fields.task}
            onChange={(val) => updateField('task', val)}
            onOverflow={handleOverflow}
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
      </div>

      {/* Fields — expandable */}
      {expanded && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border pt-2">
          {FIELD_DEFS.map((def, idx) => (
            <div key={def.key} className="flex items-center gap-1.5">
              <span className="text-sm shrink-0 w-5 text-center">{def.icon}</span>
              <label className="text-xs text-muted-foreground shrink-0 w-8">
                {def.label}
              </label>
              <input
                type="text"
                value={fields[def.key]}
                onChange={(e) => updateField(def.key, e.target.value)}
                placeholder={def.placeholder}
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 border-b border-transparent hover:border-border focus:border-primary transition-colors py-0.5 min-w-0"
              />
              {generated && fields[def.key] && (
                <span title="AI生成"><Sparkles className="w-3 h-3 text-amber-500 shrink-0" /></span>
              )}

            </div>
          ))}

        </div>
      )}

      {/* Footer — single row, left: media buttons, right: action buttons */}
      <div className="flex items-center gap-0.5 px-2 py-1.5">
        {/* Left — media & input buttons */}
        <button className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="表情">
          <Smile className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="收藏">
          <Star className="w-4 h-4" />
        </button>
        <button onClick={onFileClick} className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="文件">
          <Paperclip className="w-4 h-4" />
        </button>
        <button className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground transition-colors" title="语音输入">
          <Mic className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (!expanded) { setExpanded(true); if (fields.task.trim().length >= 5) autoGenerate(fields.task); }
            else setExpanded(false);
          }}
          className={cn("p-1.5 rounded transition-colors", expanded ? "bg-primary/10 text-primary hover:bg-primary/20" : "hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground")}
          title={expanded ? '折叠字段' : '展开AI字段'}
        >
          {expanded ? <ChevronUp className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right — action buttons from chat-client */}
        {footer}
      </div>

    </div>
  );
}

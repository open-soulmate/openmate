'use client';

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import {
  Sparkles, Wand2, BookOpen, RotateCcw, X, Loader2, Check,
  Languages, FileText, Maximize2, Minimize2, ArrowRight, Keyboard,
} from 'lucide-react';

interface SelectionAIBarProps {
  containerRef: RefObject<HTMLElement | null>;
  onAIEdit: (selectedText: string, instruction: string) => Promise<string | null>;
  disabled?: boolean;
}

interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

const QUICK_ACTIONS = [
  { id: 'rewrite', label: '重写', icon: Wand2, prompt: '请用更正式、更专业的语气重写这段文字，保持原意不变' },
  { id: 'improve', label: '改进', icon: Sparkles, prompt: '请改进这段文字的表达，使其更清晰、更有说服力' },
  { id: 'explain', label: '解释', icon: BookOpen, prompt: '请解释这段文字的含义，用简单易懂的中文' },
  { id: 'translate-en', label: '翻译EN', icon: Languages, prompt: '请将这段文字翻译成英文，保持专业术语准确' },
  { id: 'translate-zh', label: '翻译中', icon: Languages, prompt: '请将这段文字翻译成中文，保持专业术语准确' },
  { id: 'summarize', label: '总结', icon: FileText, prompt: '请用一句话总结这段文字的核心观点' },
  { id: 'expand', label: '扩展', icon: Maximize2, prompt: '请扩展这段文字，补充更多细节和论据' },
  { id: 'simplify', label: '精简', icon: Minimize2, prompt: '请精简这段文字，去除冗余，保留核心信息' },
];

export function SelectionAIBar({ containerRef, onAIEdit, disabled }: SelectionAIBarProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [showMore, setShowMore] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for text selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (showInput || loading || result) return;

      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        setSelection(null);
        return;
      }

      const text = sel.toString().trim();
      if (!text || text.length < 2) {
        setSelection(null);
        return;
      }

      const range = sel.getRangeAt(0);
      const container = containerRef.current;
      if (!container || !container.contains(range.commonAncestorContainer)) {
        setSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setSelection({ text, rect });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    const el = containerRef.current;
    el?.addEventListener('mouseup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      el?.removeEventListener('mouseup', handleSelectionChange);
    };
  }, [containerRef, showInput, loading, result]);

  // Ctrl+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed && sel.toString().trim().length >= 2) {
          e.preventDefault();
          setShowInput(true);
        }
      }
      if (e.key === 'Escape') {
        if (result) { handleDismiss(); }
        else if (showInput) { setShowInput(false); setInstruction(''); }
        else { setSelection(null); }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [result, showInput]);

  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleQuickAction = useCallback(async (actionId: string) => {
    if (!selection || loading || disabled) return;
    const action = QUICK_ACTIONS.find(a => a.id === actionId);
    if (!action) return;

    setLoading(true);
    setOriginalText(selection.text);
    try {
      const aiResult = await onAIEdit(selection.text, action.prompt);
      if (aiResult) setResult(aiResult);
    } finally {
      setLoading(false);
    }
  }, [selection, loading, disabled, onAIEdit]);

  const handleCustomInstruction = useCallback(async () => {
    if (!selection || !instruction.trim() || loading || disabled) return;
    setLoading(true);
    setOriginalText(selection.text);
    try {
      const aiResult = await onAIEdit(selection.text, instruction.trim());
      if (aiResult) setResult(aiResult);
    } finally {
      setLoading(false);
      setShowInput(false);
      setInstruction('');
    }
  }, [selection, instruction, loading, disabled, onAIEdit]);

  // Continue editing: send current result with new instruction
  const handleContinueEdit = useCallback(async () => {
    if (!result || !instruction.trim() || loading || disabled) return;
    setLoading(true);
    setOriginalText(result);
    try {
      const aiResult = await onAIEdit(result, instruction.trim());
      if (aiResult) setResult(aiResult);
    } finally {
      setLoading(false);
      setInstruction('');
    }
  }, [result, instruction, loading, disabled, onAIEdit]);

  const handleApply = useCallback(() => {
    if (!result) return;
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(result));
      sel.collapseToEnd();
    }
    // Dispatch input event so textarea/contenteditable knows content changed
    const container = containerRef.current;
    if (container) {
      const textarea = container.querySelector('textarea');
      if (textarea) {
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
        nativeInputValueSetter?.call(textarea, textarea.value);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
    setResult(null);
    setOriginalText(null);
    setSelection(null);
  }, [result, containerRef]);

  const handleDismiss = useCallback(() => {
    setResult(null);
    setOriginalText(null);
    setShowInput(false);
    setInstruction('');
  }, []);

  if (!selection || disabled) return null;

  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  const top = selection.rect.bottom - containerRect.top + 8;
  const left = Math.max(8, Math.min(
    (selection.rect.left + selection.rect.right) / 2 - containerRect.left - 140,
    containerRect.width - 300
  ));

  const primaryActions = QUICK_ACTIONS.slice(0, 4);
  const moreActions = QUICK_ACTIONS.slice(4);

  return (
    <div
      ref={barRef}
      className="absolute z-50 animate-in fade-in slide-in-from-top-2 duration-150"
      style={{ top, left }}
    >
      {result ? (
        /* ── Result preview with diff ── */
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl w-[360px] overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">AI修改结果</span>
            <button onClick={handleDismiss} className="ml-auto p-1 rounded hover:bg-muted/30">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>

          {/* Diff view */}
          <div className="max-h-[160px] overflow-auto">
            {originalText && originalText !== result && (
              <div className="px-3 py-1.5 bg-red-500/5 border-l-2 border-red-500/40">
                <span className="text-[10px] text-red-400/60 font-medium">原文</span>
                <div className="text-xs text-red-300/70 line-through whitespace-pre-wrap mt-0.5">{originalText}</div>
              </div>
            )}
            <div className="px-3 py-1.5 bg-green-500/5 border-l-2 border-green-500/40">
              <span className="text-[10px] text-green-400/60 font-medium">修改</span>
              <div className="text-xs text-green-300 whitespace-pre-wrap mt-0.5">{result}</div>
            </div>
          </div>

          {/* Continue editing */}
          <div className="px-3 py-1.5 border-t border-border/30">
            <div className="flex gap-1.5">
              <input
                value={instruction}
                onChange={e => setInstruction(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleContinueEdit()}
                placeholder="继续修改（可选）..."
                className="flex-1 bg-[#0d1117] border border-border rounded px-2 py-1 text-[11px] text-foreground outline-none focus:border-primary/50"
                disabled={loading}
              />
              <button onClick={handleContinueEdit} disabled={loading || !instruction.trim()}
                className="p-1 rounded hover:bg-muted/30 text-muted-foreground disabled:opacity-30 transition-colors">
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ArrowRight className="w-3 h-3" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-3 py-2 border-t border-border/30">
            <button onClick={handleApply}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              <Check className="w-3 h-3" /> 应用替换
            </button>
            <button onClick={handleDismiss}
              className="flex items-center gap-1 px-3 py-1.5 rounded text-xs text-muted-foreground hover:bg-muted/30 transition-colors">
              <RotateCcw className="w-3 h-3" /> 取消
            </button>
          </div>
        </div>
      ) : showInput ? (
        /* ── Custom instruction input ── */
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl p-2 w-[300px]">
          <div className="flex gap-1.5">
            <input
              ref={inputRef}
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCustomInstruction()}
              placeholder="输入修改指令..."
              className="flex-1 bg-[#0d1117] border border-border rounded px-2 py-1.5 text-xs text-foreground outline-none focus:border-primary/50"
              disabled={loading}
            />
            <button onClick={handleCustomInstruction} disabled={loading || !instruction.trim()}
              className="p-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            </button>
            <button onClick={() => { setShowInput(false); setInstruction(''); }}
              className="p-1.5 rounded hover:bg-muted/30 text-muted-foreground transition-colors">
              <X className="w-3 h-3" />
            </button>
          </div>
          <div className="flex items-center gap-1 mt-1.5 px-1">
            <Keyboard className="w-2.5 h-2.5 text-muted-foreground/40" />
            <span className="text-[10px] text-muted-foreground/40">Ctrl+K 唤起 · Enter 发送 · Esc 关闭</span>
          </div>
        </div>
      ) : (
        /* ── Quick action buttons ── */
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl">
          <div className="flex items-center gap-0.5 p-1">
            {primaryActions.map(action => (
              <button key={action.id} onClick={() => handleQuickAction(action.id)} disabled={loading}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50"
                title={action.prompt}>
                {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <action.icon className="w-3 h-3" />}
                <span>{action.label}</span>
              </button>
            ))}
            <div className="relative">
              <button onClick={() => setShowMore(!showMore)}
                className="flex items-center gap-0.5 px-1.5 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                ···
              </button>
              {showMore && (
                <div className="absolute top-full right-0 mt-1 bg-[#1e1e2e] border border-border rounded-lg shadow-2xl p-1 min-w-[120px] z-10">
                  {moreActions.map(action => (
                    <button key={action.id} onClick={() => { setShowMore(false); handleQuickAction(action.id); }}
                      className="flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors">
                      <action.icon className="w-3 h-3" />
                      <span>{action.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="w-px h-4 bg-border mx-0.5" />
            <button onClick={() => setShowInput(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10 transition-colors">
              <Sparkles className="w-3 h-3" />
              <span>自定义</span>
            </button>
          </div>
          <div className="flex items-center gap-1 px-2 pb-1">
            <Keyboard className="w-2.5 h-2.5 text-muted-foreground/30" />
            <span className="text-[10px] text-muted-foreground/30">Ctrl+K</span>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef, type RefObject } from 'react';
import { Sparkles, Wand2, BookOpen, RotateCcw, X, Loader2, Check } from 'lucide-react';

interface SelectionAIBarProps {
  /** The scrollable container that holds the editor */
  containerRef: RefObject<HTMLElement | null>;
  /** Called when user wants to send selected text to AI */
  onAIEdit: (selectedText: string, instruction: string) => Promise<string | null>;
  /** Whether AI is currently processing */
  disabled?: boolean;
}

interface SelectionInfo {
  text: string;
  rect: DOMRect;
}

export function SelectionAIBar({ containerRef, onAIEdit, disabled }: SelectionAIBarProps) {
  const [selection, setSelection] = useState<SelectionInfo | null>(null);
  const [showInput, setShowInput] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Listen for text selection changes
  useEffect(() => {
    const handleSelectionChange = () => {
      if (showInput || loading) return; // Don't update while editing

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

      // Check if selection is within our container
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
    // Also listen on mouseup for mobile
    const el = containerRef.current;
    el?.addEventListener('mouseup', handleSelectionChange);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      el?.removeEventListener('mouseup', handleSelectionChange);
    };
  }, [containerRef, showInput, loading]);

  // Focus input when shown
  useEffect(() => {
    if (showInput) inputRef.current?.focus();
  }, [showInput]);

  const handleQuickAction = useCallback(async (action: string) => {
    if (!selection || loading || disabled) return;
    setLoading(true);
    try {
      const instructionMap: Record<string, string> = {
        rewrite: '请用更正式、更专业的语气重写这段文字，保持原意不变',
        explain: '请解释这段文字的含义，用简单易懂的中文',
        improve: '请改进这段文字的表达，使其更清晰、更有说服力',
      };
      const instr = instructionMap[action] || action;
      const aiResult = await onAIEdit(selection.text, instr);
      if (aiResult) setResult(aiResult);
    } finally {
      setLoading(false);
    }
  }, [selection, loading, disabled, onAIEdit]);

  const handleCustomInstruction = useCallback(async () => {
    if (!selection || !instruction.trim() || loading || disabled) return;
    setLoading(true);
    try {
      const aiResult = await onAIEdit(selection.text, instruction.trim());
      if (aiResult) setResult(aiResult);
    } finally {
      setLoading(false);
      setShowInput(false);
      setInstruction('');
    }
  }, [selection, instruction, loading, disabled, onAIEdit]);

  const handleApply = useCallback(() => {
    if (!result) return;
    // Replace selection with result
    const sel = window.getSelection();
    if (sel && sel.rangeCount) {
      sel.deleteFromDocument();
      sel.getRangeAt(0).insertNode(document.createTextNode(result));
      sel.collapseToEnd();
    }
    setResult(null);
    setSelection(null);
  }, [result]);

  const handleDismiss = useCallback(() => {
    setResult(null);
    setShowInput(false);
    setInstruction('');
  }, []);

  // Don't show if no selection or disabled
  if (!selection || disabled) return null;

  // Position: below the selection, centered
  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  const top = selection.rect.bottom - containerRect.top + 8;
  const left = Math.max(8, (selection.rect.left + selection.rect.right) / 2 - containerRect.left - 120);

  return (
    <div
      ref={barRef}
      className="absolute z-50 animate-in fade-in slide-in-from-top-1 duration-150"
      style={{ top, left: Math.min(left, containerRect.width - 260) }}
    >
      {result ? (
        /* ── Result preview ── */
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl p-3 w-[320px]">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            <span className="text-xs font-medium text-foreground">AI修改结果</span>
            <button onClick={handleDismiss} className="ml-auto p-1 rounded hover:bg-muted/30">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
          <div className="bg-[#0d1117] rounded p-2 text-xs font-mono text-foreground max-h-[120px] overflow-auto whitespace-pre-wrap">
            {result}
          </div>
          <div className="flex gap-2 mt-2">
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
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl p-2 w-[280px]">
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
        </div>
      ) : (
        /* ── Quick action buttons ── */
        <div className="bg-[#1e1e2e] border border-border rounded-lg shadow-2xl flex items-center gap-0.5 p-1">
          <button onClick={() => handleQuickAction('rewrite')} disabled={loading}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            <span>重写</span>
          </button>
          <button onClick={() => handleQuickAction('explain')} disabled={loading}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50">
            <BookOpen className="w-3 h-3" />
            <span>解释</span>
          </button>
          <button onClick={() => handleQuickAction('improve')} disabled={loading}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-50">
            <Sparkles className="w-3 h-3" />
            <span>改进</span>
          </button>
          <div className="w-px h-4 bg-border mx-0.5" />
          <button onClick={() => setShowInput(true)}
            className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-primary hover:bg-primary/10 transition-colors">
            <Sparkles className="w-3 h-3" />
            <span>自定义</span>
          </button>
        </div>
      )}
    </div>
  );
}

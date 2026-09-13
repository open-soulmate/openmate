"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";

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

  const handleSelect = (opt: ChoiceOption) => {
    if (disabled || selected) return;
    setSelected(opt.id);
    onSelect(opt.id, opt.label);
  };

  const handleCustomSubmit = () => {
    if (!customText.trim() || disabled) return;
    onCustomSubmit(customText.trim());
  };

  return (
    <div className="mt-2 rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm overflow-hidden">
      {/* 标题 */}
      <div className="px-4 py-2.5 border-b border-border/40 bg-muted/30">
        <p className="text-sm font-medium text-foreground/90">{question}</p>
      </div>

      {/* 选项列表 */}
      <div className="divide-y divide-border/30">
        {pagedOptions.map((opt, idx) => (
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
              <span className="text-sm font-medium text-foreground/90">{opt.label}</span>
              {opt.description && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{opt.description}</p>
              )}
            </div>
            {selected === opt.id && (
              <span className="flex-shrink-0 text-xs text-primary font-medium mt-1">✓ 已选择</span>
            )}
          </button>
        ))}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-border/30 bg-muted/20">
          <button
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-xs text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="p-1 rounded hover:bg-muted/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 自定义输入 */}
      {!selected && (
        <div className="flex items-center gap-2 px-3 py-2.5 border-t border-border/40 bg-muted/20">
          <input
            type="text"
            value={customText}
            onChange={e => setCustomText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCustomSubmit(); }}
            placeholder="或输入自定义内容..."
            disabled={disabled}
            className="flex-1 text-sm bg-transparent outline-none placeholder:text-muted-foreground/50"
          />
          <button
            onClick={handleCustomSubmit}
            disabled={!customText.trim() || disabled}
            className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

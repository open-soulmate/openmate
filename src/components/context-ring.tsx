"use client";

import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ContextRingProps {
  className?: string;
}

export function ContextRing({ className }: ContextRingProps) {
  const [used, setUsed] = useState(0);
  const [total, setTotal] = useState(1000000);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [showDetail, setShowDetail] = useState(false);

  // Poll context usage from active session
  useEffect(() => {
    const poll = async () => {
      try {
        const apiBase = localStorage.getItem("openmate-api-url") || "";
        const token = localStorage.getItem("openmate-token") || "";
        if (!apiBase) return;

        const res = await fetch(`${apiBase}/api/chat/context-usage`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const data = await res.json();
          setUsed(data.used_tokens || 0);
          setTotal(data.total_tokens || 1000000);
          setInputTokens(data.input_tokens || 0);
          setOutputTokens(data.output_tokens || 0);
        }
      } catch {
        // Silent — endpoint may not exist yet
      }
    };

    poll();
    const interval = setInterval(poll, 30000); // every 30s
    return () => clearInterval(interval);
  }, []);

  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  // Color: green < 50%, amber 50-80%, red > 80%
  const color = pct > 80 ? "text-red-400" : pct > 50 ? "text-amber-400" : "text-emerald-400";
  const strokeColor = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#34d399";

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  return (
    <div
      className="relative shrink-0"
      onMouseEnter={() => setShowDetail(true)}
      onMouseLeave={() => setShowDetail(false)}
      onClick={() => setShowDetail(!showDetail)}
    >
      {/* Ring */}
      <div className="flex items-center gap-1 cursor-default touch-manipulation">
        <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
          {/* Background track */}
          <circle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-border/50"
            strokeWidth="2.5"
          />
          {/* Progress arc */}
          <circle
            cx="11"
            cy="11"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 11 11)"
            className="transition-all duration-500 ease-linear"
          />
        </svg>
        <span className={cn("text-[10px] font-medium tabular-nums hidden lg:inline", color)}>
          {pct.toFixed(0)}%
        </span>
      </div>

      {/* Detail popup */}
      {showDetail && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-52 rounded-xl border border-border bg-card shadow-lg p-3 z-50">
          <div className="text-xs font-medium text-foreground mb-2">上下文窗口</div>
          
          {/* Progress bar */}
          <div className="w-full h-1.5 rounded-full bg-border/30 mb-2">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, backgroundColor: strokeColor }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] mb-1.5">
            <span className="text-muted-foreground">已用</span>
            <span className={cn("font-medium tabular-nums", color)}>
              {formatTokens(used)} / {formatTokens(total)}
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>输入 {formatTokens(inputTokens)}</span>
            <span>输出 {formatTokens(outputTokens)}</span>
          </div>

          {/* Arrow */}
          <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-card border-l border-t border-border rotate-45" />
        </div>
      )}
    </div>
  );
}

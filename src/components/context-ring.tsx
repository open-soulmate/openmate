"use client";

import { useState, useEffect, useRef } from "react";

interface ContextRingProps {
  className?: string;
}

export function ContextRing({ className }: ContextRingProps) {
  const [used, setUsed] = useState(0);
  const [total, setTotal] = useState(1000000);
  const [inputTokens, setInputTokens] = useState(0);
  const [outputTokens, setOutputTokens] = useState(0);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ringRef = useRef<HTMLDivElement>(null);

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
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  const strokeColor = pct > 80 ? "#f87171" : pct > 50 ? "#fbbf24" : "#34d399";

  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
  };

  const tip = `${formatTokens(used)} / ${formatTokens(total)} (输入 ${formatTokens(inputTokens)} · 输出 ${formatTokens(outputTokens)})`;

  const handleEnter = () => {
    if (ringRef.current) {
      const rect = ringRef.current.getBoundingClientRect();
      setPos({ x: rect.left + rect.width / 2, y: rect.top });
    }
    setHover(true);
  };

  return (
    <div className="shrink-0" ref={ringRef} onMouseEnter={handleEnter} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center gap-1 cursor-default touch-manipulation">
        <svg width="22" height="22" viewBox="0 0 22 22" className="shrink-0">
          <circle cx="11" cy="11" r={radius} fill="none" stroke="currentColor" className="text-border/50" strokeWidth="2.5" />
          <circle cx="11" cy="11" r={radius} fill="none" stroke={strokeColor} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 11 11)" className="transition-all duration-500 ease-linear" />
        </svg>
        <span className="text-[10px] font-medium tabular-nums text-muted-foreground hidden lg:inline">
          {pct.toFixed(0)}%
        </span>
      </div>

      {hover && (
        <div
          className="fixed z-[9999] text-xs text-foreground bg-card border border-border rounded-lg px-3 py-2 shadow-lg whitespace-nowrap pointer-events-none"
          style={{ left: pos.x, top: pos.y - 8, transform: "translate(-50%, -100%)" }}
        >
          {tip}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-card border-r border-b border-border rotate-45 -mt-1" />
        </div>
      )}
    </div>
  );
}

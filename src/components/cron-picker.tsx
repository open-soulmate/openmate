"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown } from "lucide-react";

interface CronPreset {
  label: string;
  value: string;
  description: string;
}

const presets: CronPreset[] = [
  { label: "每小时", value: "0 * * * *", description: "每小时整点执行" },
  { label: "每天 8:00", value: "0 8 * * *", description: "每天早上 8 点" },
  { label: "每周一 9:00", value: "0 9 * * 1", description: "每周一早上 9 点" },
  { label: "每月1号", value: "0 0 1 * *", description: "每月 1 号零点" },
  { label: "每周五天", value: "0 9 * * 1-5", description: "工作日早上 9 点" },
];

function parseCronExpression(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return "无效的 Cron 表达式";

  const [min, hour, dom, month, dow] = parts;

  const dowNames: Record<string, string> = {
    "0": "周日", "1": "周一", "2": "周二", "3": "周三",
    "4": "周四", "5": "周五", "6": "周六", "7": "周日",
    "1-5": "工作日",
  };

  if (dom === "*" && month === "*") {
    if (dow !== "*") {
      const dayName = dowNames[dow] ?? `星期${dow}`;
      if (min === "0" && hour !== "*") return `${dayName} ${hour}:00`;
      if (hour !== "*") return `${dayName} ${hour}:${min.padStart(2, "0")}`;
      return `${dayName} 每小时`;
    }
    if (hour !== "*") {
      if (min === "0") return `每天 ${hour}:00`;
      return `每天 ${hour}:${min.padStart(2, "0")}`;
    }
    if (min === "0") return "每小时整点";
    return `每小时第 ${min} 分钟`;
  }

  if (dom !== "*" && month === "*") {
    if (hour !== "*" && min !== "*") {
      return `每月 ${dom} 日 ${hour}:${min.padStart(2, "0")}`;
    }
    return `每月 ${dom} 日`;
  }

  return expr;
}

function getNextRunPreview(expr: string): string | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;

  const [min, hour] = parts;

  if (min === "*" && hour === "*") return null;

  const now = new Date();
  const targetMin = min === "*" ? now.getMinutes() : parseInt(min, 10);
  const targetHour = hour === "*" ? now.getHours() : parseInt(hour, 10);

  if (isNaN(targetMin) || isNaN(targetHour)) return null;

  const target = new Date(now);
  target.setHours(targetHour, targetMin, 0, 0);

  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  const diff = target.getTime() - now.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) return `${minutes} 分钟后`;
  if (minutes === 0) return `${hours} 小时后`;
  return `${hours} 小时 ${minutes} 分钟后`;
}

interface CronPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CronPicker({ value, onChange, className }: CronPickerProps) {
  const [showCustom, setShowCustom] = useState(false);

  const activePreset = presets.find((p) => p.value === value);
  const description = useMemo(() => parseCronExpression(value), [value]);
  const nextRun = useMemo(() => getNextRunPreview(value), [value]);

  return (
    <div className={cn("space-y-3", className)}>
      {/* Presets */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              onChange(preset.value);
              setShowCustom(false);
            }}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs transition-colors",
              value === preset.value
                ? "bg-primary/15 text-primary font-medium"
                : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom(!showCustom)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs transition-colors",
            showCustom || !activePreset
              ? "bg-primary/15 text-primary font-medium"
              : "border border-border text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          自定义
          <ChevronDown size={11} className={cn("transition-transform", showCustom && "rotate-180")} />
        </button>
      </div>

      {/* Custom input */}
      {showCustom && (
        <div className="space-y-1.5">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="* * * * *"
            className="w-full rounded-md border border-border bg-muted px-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="text-[10px] text-muted-foreground">
            格式：分 时 日 月 星期（如 &quot;0 9 * * 1-5&quot; 表示工作日 9 点）
          </p>
        </div>
      )}

      {/* Preview */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
        <Clock size={13} className="shrink-0 text-muted-foreground" />
        <div className="flex-1 text-xs">
          <span className="text-foreground">{description}</span>
          {nextRun && (
            <span className="ml-2 text-muted-foreground">
              &middot; 下次运行：{nextRun}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

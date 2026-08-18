"use client";

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Clock, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface CronPreset {
  labelKey: string;
  value: string;
  descKey: string;
}

const presets: CronPreset[] = [
  { labelKey: "cronPicker.hourly", value: "0 * * * *", descKey: "cronPicker.hourly" },
  { labelKey: "cronPicker.dailyAt", value: "0 8 * * *", descKey: "cronPicker.dailyAt" },
  { labelKey: "cronPicker.weeklyMon", value: "0 9 * * 1", descKey: "cronPicker.weeklyMon" },
  { labelKey: "cronPicker.monthlyFirst", value: "0 0 1 * *", descKey: "cronPicker.monthlyFirst" },
  { labelKey: "cronPicker.weekdays9", value: "0 9 * * 1-5", descKey: "cronPicker.weekdays9" },
];

function parseCronExpression(expr: string, t: (key: string, opts?: any) => string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return t("cronPicker.invalidCron");

  const [min, hour, dom, month, dow] = parts;

  const dowNames: Record<string, string> = {
    "0": t("cronPicker.sunday"), "1": t("cronPicker.monday"), "2": t("cronPicker.tuesday"),
    "3": t("cronPicker.wednesday"), "4": t("cronPicker.thursday"), "5": t("cronPicker.friday"),
    "6": t("cronPicker.saturday"), "7": t("cronPicker.sunday"),
    "1-5": t("cronPicker.weekdays"),
  };

  if (dom === "*" && month === "*") {
    if (dow !== "*") {
      const dayName = dowNames[dow] ?? dow;
      if (min === "0" && hour !== "*") return `${dayName} ${hour}:00`;
      if (hour !== "*") return `${dayName} ${hour}:${min.padStart(2, "0")}`;
      return t("cronPicker.dayHourly", { day: dayName });
    }
    if (hour !== "*") {
      if (min === "0") return t("cronPicker.dailyAt", { hour });
      return `${t("cronPicker.dailyAt", { hour }).replace(/:00$/, ":" + min.padStart(2, "0"))}`;
    }
    if (min === "0") return t("cronPicker.hourly");
    return t("cronPicker.minuteOfHour", { min });
  }

  if (dom !== "*" && month === "*") {
    if (hour !== "*" && min !== "*") {
      return `${t("cronPicker.monthly", { dom })} ${hour}:${min.padStart(2, "0")}`;
    }
    return t("cronPicker.monthly", { dom });
  }

  return expr;
}

function getNextRunPreview(expr: string, t: (key: string, opts?: any) => string): string | null {
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

  if (hours === 0) return t("cronPicker.inMinutes", { minutes });
  if (minutes === 0) return t("cronPicker.inHours", { hours });
  return t("cronPicker.inHoursMinutes", { hours, minutes });
}

interface CronPickerProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}

export function CronPicker({ value, onChange, className }: CronPickerProps) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);

  const activePreset = presets.find((p) => p.value === value);
  const description = useMemo(() => parseCronExpression(value, t), [value, t]);
  const nextRun = useMemo(() => getNextRunPreview(value, t), [value, t]);

  const presetLabels: Record<string, string> = {
    "0 * * * *": t("cronPicker.hourly"),
    "0 8 * * *": t("cronPicker.dailyAt", { hour: "8" }),
    "0 9 * * 1": `${t("cronPicker.monday")} 9:00`,
    "0 0 1 * *": t("cronPicker.monthly", { dom: "1" }),
    "0 9 * * 1-5": `${t("cronPicker.weekdays")} 9:00`,
  };

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
            {presetLabels[preset.value] || preset.value}
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
          {t("cronPicker.custom")}
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
        </div>
      )}

      {/* Preview */}
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2">
        <Clock size={13} className="shrink-0 text-muted-foreground" />
        <div className="flex-1 text-xs">
          <span className="text-foreground">{description}</span>
          {nextRun && (
            <span className="ml-2 text-muted-foreground">
              &middot; {t("cronPicker.nextRun", { time: nextRun })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

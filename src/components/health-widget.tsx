"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, CheckCircle, XCircle, AlertTriangle, Loader2,
  RefreshCw, Stethoscope,
} from "lucide-react";

interface OrganHealth {
  label: string;
  status: "ok" | "error" | "loading";
  endpoint: string;
}

const CORE_ORGANS = [
  { key: "soul", label: "🧠 Soul", endpoint: "/api/health" },
  { key: "cortex", label: "🧩 Cortex", endpoint: "/api/cortex/health" },
  { key: "nerve", label: "⚡ Nerve", endpoint: "/api/nerve/health" },
  { key: "vein", label: "🩸 Vein", endpoint: "/api/vein/health" },
  { key: "sense", label: "👁 Sense", endpoint: "/api/sense/health" },
  { key: "gland", label: "🧪 Gland", endpoint: "/api/gland/health" },
  { key: "vital", label: "📊 Vital", endpoint: "/api/vital/health" },
  { key: "immune", label: "🛡 Immune", endpoint: "/api/immune/health" },
  { key: "will", label: "✨ Will", endpoint: "/api/will/health" },
  { key: "voice", label: "🎤 Voice", endpoint: "/api/voice/health" },
  { key: "vision", label: "🎨 Vision", endpoint: "/api/vision/health" },
  { key: "mind", label: "💭 Mind", endpoint: "/api/mind/health" },
];

export function HealthWidget() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState<Record<string, "ok" | "error" | "loading">>({});
  const [checking, setChecking] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const apiBase = getApiBaseUrl();

  const checkHealth = useCallback(async () => {
    if (!apiBase) return;
    setChecking(true);
    try {
      const res = await fetch(`${apiBase}/api/health/all`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        setHealth(data.organs || {});
      }
    } catch {
      // Fallback: check individually
      const results: Record<string, "ok" | "error"> = {};
      await Promise.allSettled(
        CORE_ORGANS.map(async (organ) => {
          try {
            const res = await fetch(`${apiBase}${organ.endpoint}`, { signal: AbortSignal.timeout(3000) });
            results[organ.key] = res.ok ? "ok" : "error";
          } catch {
            results[organ.key] = "error";
          }
        })
      );
      setHealth(results);
    } finally {
      setChecking(false);
    }
  }, [apiBase]);

  // Poll health every 60s
  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const totalOrgans = CORE_ORGANS.length;
  const healthyCount = CORE_ORGANS.filter((o) => health[o.key] === "ok").length;
  const errorCount = CORE_ORGANS.filter((o) => health[o.key] === "error").length;
  const allHealthy = healthyCount === totalOrgans;
  const hasErrors = errorCount > 0;

  const overallStatus = checking ? "loading" : allHealthy ? "ok" : hasErrors ? "error" : "loading";

  return (
    <div className="relative" ref={panelRef}>
      {/* Health Indicator Button */}
      <button
        onClick={() => { setOpen(!open); if (!open) checkHealth(); }}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        title={t("health.title") || "System Health"}
      >
        {overallStatus === "loading" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : overallStatus === "ok" ? (
          <div className="relative">
            <Activity size={16} />
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-500" />
          </div>
        ) : (
          <div className="relative">
            <Activity size={16} />
            <div className="absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
          </div>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[320px] rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Stethoscope size={16} className="text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {t("health.title") || "System Health"}
              </h3>
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                allHealthy
                  ? "bg-emerald-500/10 text-emerald-500"
                  : "bg-red-500/10 text-red-500"
              )}>
                {healthyCount}/{totalOrgans}
              </span>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); checkHealth(); }}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
                checking && "animate-spin"
              )}
              disabled={checking}
            >
              <RefreshCw size={14} />
            </button>
          </div>

          {/* Organ List */}
          <div className="max-h-[300px] overflow-y-auto py-1">
            {CORE_ORGANS.map((organ) => {
              const status = health[organ.key];
              return (
                <div
                  key={organ.key}
                  className="flex items-center justify-between px-4 py-2 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => { router.push(`/${organ.key}`); setOpen(false); }}
                >
                  <span className="text-sm text-foreground">{organ.label}</span>
                  {status === "ok" ? (
                    <CheckCircle size={14} className="text-emerald-500" />
                  ) : status === "error" ? (
                    <XCircle size={14} className="text-red-500" />
                  ) : (
                    <Loader2 size={14} className="animate-spin text-muted-foreground" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-4 py-2">
            <button
              onClick={() => { router.push("/diagnostics"); setOpen(false); }}
              className="text-xs text-primary hover:underline"
            >
              {t("health.viewDiagnostics") || "View Full Diagnostics"} →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

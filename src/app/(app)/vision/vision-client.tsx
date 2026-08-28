"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  ImageIcon, RefreshCw, CheckCircle, XCircle, Loader2,
  Paintbrush, BarChart3, Folder, FileImage, AlertTriangle,
} from "lucide-react";

interface VisionStats {
  status: string;
  component: string;
  engine: string;
  backends: Record<string, boolean>;
  total_generated: number;
  errors: number;
  output_dir: string;
  saved_outputs: number;
}

interface OutputFile {
  filename: string;
  size_bytes: number;
  created_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function StatusBadge({ online }: { online: boolean }) {
  return online ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
      <CheckCircle size={10} /> Online
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
      <XCircle size={10} /> Offline
    </span>
  );
}

export function VisionClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [stats, setStats] = useState<VisionStats | null>(null);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/vision/stats`);
      if (res.ok) {
        setStats(await res.json());
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch stats");
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  const fetchOutputs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vision/outputs`);
      if (res.ok) {
        const data = await res.json();
        setOutputs(data.outputs || data || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStats();
    fetchOutputs();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchOutputs]);

  const backends = stats?.backends || {};

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <ImageIcon size={20} className="text-indigo-500" />
          <h1 className="text-lg font-semibold">{t("vision.title") || "Vision Engine"}</h1>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
            {t("vision.badge") || "Charts"}
          </span>
          {stats && <StatusBadge online={stats.status === "ok"} />}
        </div>
        <button
          onClick={() => { fetchStats(); fetchOutputs(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs lg:text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("common.refresh") || "Refresh"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-xs lg:text-sm text-red-500">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("vision.totalGenerated") || "Generated"}</span>
                  <div className="rounded-lg p-1.5 bg-indigo-500/10"><BarChart3 size={14} className="text-indigo-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{stats.total_generated}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("vision.savedOutputs") || "Saved"}</span>
                  <div className="rounded-lg p-1.5 bg-emerald-500/10"><FileImage size={14} className="text-emerald-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{stats.saved_outputs}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("vision.engine") || "Engine"}</span>
                  <div className="rounded-lg p-1.5 bg-violet-500/10"><Paintbrush size={14} className="text-violet-500" /></div>
                </div>
                <p className="text-lg font-bold">{stats.engine}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("vision.errors") || "Errors"}</span>
                  <div className="rounded-lg p-1.5 bg-red-500/10"><AlertTriangle size={14} className="text-red-500" /></div>
                </div>
                <p className="text-xl lg:text-2xl font-bold">{stats.errors}</p>
              </div>
            </div>

            {/* Backend Status */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2 mb-4">
                <Paintbrush size={14} className="text-indigo-500" />
                {t("vision.backendStatus") || "Backend Status"}
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(backends).map(([name, available]) => (
                  <div
                    key={name}
                    className={cn(
                      "rounded-lg border p-3 flex items-center gap-3",
                      available
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : "border-red-500/30 bg-red-500/5"
                    )}
                  >
                    {available ? (
                      <CheckCircle size={16} className="text-emerald-500 shrink-0" />
                    ) : (
                      <XCircle size={16} className="text-red-500 shrink-0" />
                    )}
                    <div>
                      <p className="text-xs lg:text-sm font-medium">{name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {available ? (t("vision.available") || "Available") : (t("vision.unavailable") || "Unavailable")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Output Directory */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2 mb-2">
                <Folder size={14} className="text-indigo-500" />
                {t("vision.outputDirectory") || "Output Directory"}
              </h3>
              <p className="text-xs font-mono text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                {stats.output_dir}
              </p>
            </div>
          </>
        )}

        {/* Outputs List */}
        {outputs.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                <FileImage size={14} className="text-indigo-500" />
                {t("vision.recentOutputs") || "Recent Outputs"}
                <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-500">
                  {outputs.length}
                </span>
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
              {outputs.map((f) => (
                <div key={f.filename} className="rounded-lg border border-border bg-background p-3 space-y-2">
                  <div className="aspect-square rounded bg-muted flex items-center justify-center overflow-hidden">
                    <img
                      src={`${apiBase}/api/vision/outputs/${f.filename}`}
                      alt={f.filename}
                      className="w-full h-full object-contain"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                    />
                  </div>
                  <div className="text-xs font-mono truncate">{f.filename}</div>
                  <div className="text-[10px] text-muted-foreground">{formatBytes(f.size_bytes)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {!stats && loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        )}
      </div>
    </div>
  );
}

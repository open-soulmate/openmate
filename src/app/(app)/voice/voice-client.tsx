"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Volume2, RefreshCw, CheckCircle, XCircle, Loader2,
  Mic, Languages, Hash, Zap, Database, Settings,
  Globe, TrendingUp, BarChart3,
} from "lucide-react";

interface VoiceStats {
  status: string;
  component: string;
  engine: {
    backends: Record<string, boolean>;
    preferred_backend: string;
    total_synthesized: number;
    total_characters: number;
    cache_hits: number;
    errors: number;
    cache: {
      entries: number;
      size_bytes: number;
      max_size_bytes: number;
    };
  };
  profiles: {
    total_profiles: number;
    builtin_count: number;
    user_count: number;
    by_language: Record<string, number>;
  };
}

interface VoiceProfile {
  profile_id: string;
  name: string;
  language: string;
  voice_id: string;
  builtin: boolean;
  description?: string;
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

export function VoiceClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/voice/stats`);
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

  const fetchProfiles = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/voice/profiles`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || data || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStats();
    fetchProfiles();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchProfiles]);

  const backends = stats?.engine?.backends || {};
  const languages = stats?.profiles?.by_language || {};

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="text-rose-500" />
          <h1 className="text-lg font-semibold">{t("voice.title") || "Voice Engine"}</h1>
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-500">
            {t("voice.badge") || "TTS"}
          </span>
          {stats && <StatusBadge online={stats.status === "ok"} />}
        </div>
        <button
          onClick={() => { fetchStats(); fetchProfiles(); }}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("common.refresh") || "Refresh"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {stats && (
          <>
            {/* Backend Status */}
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="text-sm font-semibold flex items-center gap-2 mb-4">
                <Settings size={14} className="text-rose-500" />
                {t("voice.backendStatus") || "Backend Status"}
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
                      <p className="text-sm font-medium">{name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {available ? (t("voice.available") || "Available") : (t("voice.unavailable") || "Unavailable")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Zap size={12} className="text-rose-500" />
                <span>{t("voice.preferredBackend") || "Preferred"}: <strong className="text-foreground">{stats.engine.preferred_backend}</strong></span>
              </div>
            </div>

            {/* Synthesis Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.totalSynthesized") || "Synthesized"}</span>
                  <div className="rounded-lg p-1.5 bg-rose-500/10"><Mic size={14} className="text-rose-500" /></div>
                </div>
                <p className="text-2xl font-bold">{stats.engine.total_synthesized}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.totalCharacters") || "Characters"}</span>
                  <div className="rounded-lg p-1.5 bg-blue-500/10"><Hash size={14} className="text-blue-500" /></div>
                </div>
                <p className="text-2xl font-bold">{stats.engine.total_characters.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.cacheHits") || "Cache Hits"}</span>
                  <div className="rounded-lg p-1.5 bg-emerald-500/10"><Database size={14} className="text-emerald-500" /></div>
                </div>
                <p className="text-2xl font-bold">{stats.engine.cache_hits}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {stats.engine.cache.entries} entries · {formatBytes(stats.engine.cache.size_bytes)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.errors") || "Errors"}</span>
                  <div className="rounded-lg p-1.5 bg-red-500/10"><XCircle size={14} className="text-red-500" /></div>
                </div>
                <p className="text-2xl font-bold">{stats.engine.errors}</p>
              </div>
            </div>

            {/* Profile Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.totalProfiles") || "Total Profiles"}</span>
                  <div className="rounded-lg p-1.5 bg-violet-500/10"><Settings size={14} className="text-violet-500" /></div>
                </div>
                <p className="text-2xl font-bold">{stats.profiles.total_profiles}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {stats.profiles.builtin_count} {t("voice.builtin") || "builtin"} · {stats.profiles.user_count} {t("voice.user") || "user"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4 col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground">{t("voice.languageBreakdown") || "Language Breakdown"}</span>
                  <div className="rounded-lg p-1.5 bg-amber-500/10"><Globe size={14} className="text-amber-500" /></div>
                </div>
                <div className="flex flex-wrap gap-2 mt-2">
                  {Object.entries(languages).map(([lang, count]) => (
                    <span
                      key={lang}
                      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-500"
                    >
                      <Languages size={10} />
                      {lang}: {count}
                    </span>
                  ))}
                  {Object.keys(languages).length === 0 && (
                    <span className="text-xs text-muted-foreground">{t("voice.noLanguages") || "No language data"}</span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Profile List */}
        {profiles.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-5 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Mic size={14} className="text-rose-500" />
                {t("voice.voiceProfiles") || "Voice Profiles"}
                <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium text-rose-500">
                  {profiles.length}
                </span>
              </h3>
            </div>
            <div className="divide-y divide-border">
              {profiles.map((p) => (
                <div key={p.profile_id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      {p.builtin && (
                        <span className="rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-500">
                          {t("voice.builtin") || "builtin"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.description || p.voice_id}</p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">
                    {p.language}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading state */}
        {!stats && loading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-rose-500" />
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import {
  RefreshCw, Activity, Filter, Loader2,
  Droplets, Eye, Shield, Bone, Dna, Volume2, Layers, Link2,
  Zap, Brain, Bolt, Heart, Home, MousePointer, Mic, ImageIcon,
  Smile, Clock, Sparkles, ChevronDown,
  BarChart3,
} from "lucide-react";

interface StreamEvent {
  id: string;
  organ: string;
  emoji: string;
  type: string;
  summary: string;
  detail?: Record<string, unknown>;
  timestamp?: number;
  collected_at?: number;
}

interface StreamSummary {
  total_events: number;
  by_organ: Record<string, number>;
  by_type: Record<string, number>;
  most_active_organ: string | null;
  collected_at: number;
}

const ORGAN_ICONS: Record<string, React.ElementType> = {
  vein: Droplets,
  gland: Zap,
  immune: Shield,
  trajectory: Activity,
  echo: Volume2,
  mirror: Layers,
  link: Link2,
  limb: MousePointer,
  will: Sparkles,
};

const TYPE_COLORS: Record<string, string> = {
  stats: "text-blue-500 bg-blue-500/10",
  llm_call: "text-purple-500 bg-purple-500/10",
  security: "text-red-500 bg-red-500/10",
  agent_event: "text-emerald-500 bg-emerald-500/10",
  message: "text-amber-500 bg-amber-500/10",
  sandbox: "text-indigo-500 bg-indigo-500/10",
  webhook: "text-orange-500 bg-orange-500/10",
  rpa_task: "text-pink-500 bg-pink-500/10",
  cron_job: "text-cyan-500 bg-cyan-500/10",
};

function formatTimestamp(ts?: number, t?: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ts) return "";
  const date = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return t ? t('activity.justNow') : "just now";
  if (diff < 3600000) return t ? t('activity.minutesAgo', { count: Math.floor(diff / 60000) }) : `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return t ? t('activity.hoursAgo', { count: Math.floor(diff / 3600000) }) : `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString(undefined, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function ActivityFeedClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [summary, setSummary] = useState<StreamSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const isMobile = useIsMobile();
  const [showSummary, setShowSummary] = useState(false);
  const sseRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<StreamEvent[]>([]);

  // Keep eventsRef in sync
  useEffect(() => { eventsRef.current = events; }, [events]);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (selectedOrgan) params.set("organ", selectedOrgan);
      const res = await fetch(`${apiBase}/api/events/stream?${params}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch (e) {
      console.error("Failed to fetch events", e);
    }
    setLoading(false);
  }, [apiBase, selectedOrgan]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/events/stream/summary`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        setSummary(await res.json());
      }
    } catch {}
  }, [apiBase]);

  // Initial load
  useEffect(() => {
    fetchEvents();
    fetchSummary();
  }, [fetchEvents, fetchSummary]);

  // SSE real-time connection
  useEffect(() => {
    if (!autoRefresh) {
      // Disconnect SSE when live mode is off
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
        setSseConnected(false);
      }
      return;
    }

    const sseUrl = selectedOrgan
      ? `${apiBase}/api/events/sse?organ=${selectedOrgan}`
      : `${apiBase}/api/events/sse`;

    const es = new EventSource(sseUrl);
    sseRef.current = es;

    es.addEventListener("connected", () => {
      setSseConnected(true);
    });

    es.addEventListener("message", (e) => {
      try {
        const newEvent: StreamEvent = JSON.parse(e.data);
        setEvents((prev) => {
          // Deduplicate by id
          if (prev.some((ev) => ev.id === newEvent.id)) return prev;
          return [newEvent, ...prev].slice(0, 100);
        });
      } catch {}
    });

    es.onerror = () => {
      setSseConnected(false);
      // EventSource auto-reconnects, no action needed
    };

    // Refresh summary periodically (not via SSE)
    const summaryTimer = setInterval(fetchSummary, 30000);

    return () => {
      es.close();
      sseRef.current = null;
      setSseConnected(false);
      clearInterval(summaryTimer);
    };
  }, [autoRefresh, apiBase, selectedOrgan, fetchSummary]);

  const handleRefresh = async () => {
    setLoading(true);
    try {
      await fetch(`${apiBase}/api/events/stream/refresh`, { method: "POST" });
      await fetchEvents();
      await fetchSummary();
    } catch {}
    setLoading(false);
  };

  const uniqueOrgans = [...new Set(events.map((e) => e.organ))];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <Activity size={20} className="text-emerald-500" />
          <h1 className="text-lg font-semibold">{t('activity.title')}</h1>
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
            {events.length} {t('activity.events')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
              autoRefresh
                ? "bg-green-500/10 text-green-500 border border-green-500/30"
                : "border border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <div className={cn("w-1.5 h-1.5 rounded-full", autoRefresh ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
            {autoRefresh && sseConnected ? "SSE Live" : t('activity.live')}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors",
              selectedOrgan ? "border-primary/30 bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted"
            )}
          >
            <Filter size={12} />
            {selectedOrgan || t('activity.allOrgans')}
            <ChevronDown size={10} />
          </button>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            {t('activity.refresh')}
          </button>
          {isMobile && (
            <button
              onClick={() => setShowSummary(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              <BarChart3 size={12} />
              {t('activity.summary')}
            </button>
          )}
        </div>
      </div>

      {/* Filter dropdown */}
      {showFilters && (
        <div className="border-b border-border px-3 lg:px-6 py-3 bg-muted/30">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => { setSelectedOrgan(null); setShowFilters(false); }}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs transition-colors",
                !selectedOrgan ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
              )}
            >
              {t('activity.all')}
            </button>
            {uniqueOrgans.map((organ) => (
              <button
                key={organ}
                onClick={() => { setSelectedOrgan(organ); setShowFilters(false); }}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5",
                  selectedOrgan === organ ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
                )}
              >
                {events.find((e) => e.organ === organ)?.emoji} {organ}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {/* Event list */}
        <div className="flex-1 overflow-y-auto">
          {events.length === 0 && !loading ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Activity size={48} className="mb-4 opacity-30" />
              <p className="text-sm">{t('activity.noEvents')}</p>
              <p className="text-xs mt-1">{t('activity.noEventsHint')}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {events.map((event) => {
                const isExpanded = expandedEvent === event.id;
                const typeColor = TYPE_COLORS[event.type] || "text-muted-foreground bg-muted";
                const Icon = ORGAN_ICONS[event.organ] || Activity;

                return (
                  <div
                    key={event.id}
                    className={cn(
                      "px-3 lg:px-6 py-3 transition-colors hover:bg-muted/30 cursor-pointer",
                      isExpanded && "bg-muted/20"
                    )}
                    onClick={() => setExpandedEvent(isExpanded ? null : event.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Organ icon */}
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <span className="text-sm">{event.emoji}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium truncate">{event.summary}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", typeColor)}>
                            {event.type}
                          </span>
                          <span className="text-[10px] text-muted-foreground capitalize">{event.organ}</span>
                          {event.timestamp && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock size={9} /> {formatTimestamp(event.timestamp, t)}
                            </span>
                          )}
                        </div>

                        {/* Expanded detail */}
                        {isExpanded && event.detail && (
                          <div className="mt-2 rounded-lg bg-muted/50 p-3 text-xs font-mono overflow-x-auto">
                            <pre className="whitespace-pre-wrap break-all">
                              {JSON.stringify(event.detail, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>

                      {/* Timestamp */}
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatTimestamp(event.collected_at, t)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Summary sidebar — Sheet on mobile, inline on desktop */}
        {isMobile ? (
          <Sheet open={showSummary} onOpenChange={setShowSummary}>
            <SheetContent side="right" className="w-72 p-0 flex flex-col overflow-y-auto">
              <div className="p-4 space-y-4">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.summary')}</h3>
                  {summary ? (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border bg-card p-3">
                        <div className="text-xl lg:text-2xl font-bold">{summary.total_events}</div>
                        <div className="text-xs text-muted-foreground">{t('activity.totalEvents')}</div>
                      </div>
                      {summary.most_active_organ && (
                        <div className="rounded-lg border border-border bg-card p-3">
                          <div className="text-xs text-muted-foreground mb-1">{t('activity.mostActive')}</div>
                          <div className="text-sm font-medium capitalize">{summary.most_active_organ}</div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-20">
                      <Loader2 size={16} className="animate-spin text-muted-foreground" />
                    </div>
                  )}
                </div>
                {summary?.by_organ && Object.keys(summary.by_organ).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.byOrgan')}</h3>
                    <div className="space-y-1.5">
                      {Object.entries(summary.by_organ)
                        .sort(([, a], [, b]) => b - a)
                        .map(([organ, count]) => (
                          <div key={organ} className="flex items-center justify-between text-xs">
                            <span className="capitalize flex items-center gap-1.5">
                              {events.find((e) => e.organ === organ)?.emoji}
                              {organ}
                            </span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
                {summary?.by_type && Object.keys(summary.by_type).length > 0 && (
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.byType')}</h3>
                    <div className="space-y-1.5">
                      {Object.entries(summary.by_type)
                        .sort(([, a], [, b]) => b - a)
                        .map(([type, count]) => (
                          <div key={type} className="flex items-center justify-between text-xs">
                            <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TYPE_COLORS[type] || "text-muted-foreground bg-muted")}>
                              {type}
                            </span>
                            <span className="text-muted-foreground">{count}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>
        ) : (
        <div className="w-64 border-l border-border overflow-y-auto p-3 lg:p-4 space-y-4">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.summary')}</h3>
            {summary ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="text-xl lg:text-2xl font-bold">{summary.total_events}</div>
                  <div className="text-xs text-muted-foreground">{t('activity.totalEvents')}</div>
                </div>

                {summary.most_active_organ && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="text-xs text-muted-foreground mb-1">{t('activity.mostActive')}</div>
                    <div className="text-sm font-medium capitalize">{summary.most_active_organ}</div>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-20">
                <Loader2 size={16} className="animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* By Organ */}
          {summary?.by_organ && Object.keys(summary.by_organ).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.byOrgan')}</h3>
              <div className="space-y-1.5">
                {Object.entries(summary.by_organ)
                  .sort(([, a], [, b]) => b - a)
                  .map(([organ, count]) => (
                    <div key={organ} className="flex items-center justify-between text-xs">
                      <span className="capitalize flex items-center gap-1.5">
                        {events.find((e) => e.organ === organ)?.emoji}
                        {organ}
                      </span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* By Type */}
          {summary?.by_type && Object.keys(summary.by_type).length > 0 && (
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{t('activity.byType')}</h3>
              <div className="space-y-1.5">
                {Object.entries(summary.by_type)
                  .sort(([, a], [, b]) => b - a)
                  .map(([type, count]) => (
                    <div key={type} className="flex items-center justify-between text-xs">
                      <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium", TYPE_COLORS[type] || "text-muted-foreground bg-muted")}>
                        {type}
                      </span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import {
  RefreshCw, Newspaper, TrendingUp, TrendingDown, Activity,
  CheckCircle, XCircle, AlertTriangle, Clock, Zap, BarChart3,
  ChevronRight, Loader2, Star, ArrowUpRight, ArrowDownRight,
  Calendar, Hash, Flame, Eye,
} from 'lucide-react';
import Link from 'next/link';

interface DigestData {
  id: string;
  date: string;
  score: number;
  total_events: number;
  active_organs: number;
  total_organs?: number;
  highlights: string[];
  warnings: string[];
  organ_summary: Record<string, { emoji: string; status: string; response_time_ms: number }>;
  timeline_summary: { total_events: number; by_organ: Record<string, number>; by_type: Record<string, number> };
  metrics_summary: { knowledge_entries: number; trajectory_sessions: number; trajectory_events: number; trajectory_tokens: number };
  generated_at: number;
}

interface DigestListItem {
  id: string;
  date: string;
  score: number;
  total_events: number;
  active_organs: number;
  generated_at: number;
  highlights: string[];
  warnings: string[];
}

interface TrendPoint {
  date: string;
  value: number;
}

function scoreColor(score: number): string {
  if (score >= 95) return 'text-emerald-400';
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function scoreGlow(score: number): string {
  if (score >= 95) return 'shadow-emerald-500/20';
  if (score >= 80) return 'shadow-green-500/20';
  if (score >= 60) return 'shadow-amber-500/20';
  return 'shadow-red-500/20';
}

function statusIcon(status: string) {
  if (status === 'ok') return <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />;
  if (status === 'error') return <XCircle className="w-3.5 h-3.5 text-red-400" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

function MiniSparkline({ data, color = '#10b981' }: { data: number[]; color?: string }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 120;
  const h = 32;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} className="opacity-70">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function DailyDigestClient() {
  const { t } = useTranslation();
  const [digest, setDigest] = useState<DigestData | null>(null);
  const [history, setHistory] = useState<DigestListItem[]>([]);
  const [trends, setTrends] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [tab, setTab] = useState<'today' | 'history' | 'trends'>('today');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${getToken()}` };

  const fetchToday = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/daily-digest/today`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDigest(data);
      }
    } catch {}
  }, [apiBase]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/daily-digest/digests?limit=60`, { headers });
      if (res.ok) {
        const data = await res.json();
        setHistory(data.digests || []);
      }
    } catch {}
  }, [apiBase]);

  const fetchTrends = useCallback(async (metric = 'health_score', days = 30) => {
    try {
      const res = await fetch(`${apiBase}/api/plugins/daily-digest/trends?metric=${metric}&days=${days}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setTrends(data.data || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchToday(), fetchHistory(), fetchTrends()]).finally(() => setLoading(false));
  }, []);

  const generateDigest = async () => {
    setGenerating(true);
    try {
      const res = await fetch(`${apiBase}/api/plugins/daily-digest/generate?force=true`, { method: 'POST', headers });
      if (res.ok) {
        const data = await res.json();
        setDigest(data);
        fetchHistory();
      }
    } catch {}
    setGenerating(false);
  };

  const viewDigest = async (date: string) => {
    setSelectedDate(date);
    try {
      const res = await fetch(`${apiBase}/api/plugins/daily-digest/digests/${date}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setDigest(data);
        setTab('today');
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const score = digest?.score || 0;
  const totalOrgans = digest?.active_organs || Object.keys(digest?.organ_summary || {}).length;
  const healthyOrgans = Object.values(digest?.organ_summary || {}).filter(o => o.status === 'ok').length;
  const avgResponse = Object.values(digest?.organ_summary || {}).reduce((s, o) => s + o.response_time_ms, 0) / Math.max(Object.keys(digest?.organ_summary || {}).length, 1);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-fuchsia-500/20 border border-violet-500/20">
            <Newspaper className="w-6 h-6 text-violet-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Daily Digest</h1>
            <p className="text-sm text-muted-foreground">{t('plugins.t33844')}<p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generateDigest}
            disabled={generating}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white text-sm font-medium hover:from-violet-500 hover:to-fuchsia-500 transition-all disabled:opacity-50"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {generating ? t('vision.generating') : t('plugins.t55476')}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted/30 rounded-lg w-fit">
        {[
          { key: 'today', label: t('plugins.t32746'), icon: Newspaper },
          { key: 'history', label: t('plugins.t62627'), icon: Calendar },
          { key: 'trends', label: t('plugins.t69858'), icon: TrendingUp },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all',
              tab === key ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Today Tab */}
      {tab === 'today' && digest && (
        <div className="space-y-6">
          {/* Score & Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Health Score */}
            <div className={cn(
              'relative p-6 rounded-2xl border border-border bg-gradient-to-br from-card to-card/50 shadow-lg',
              scoreGlow(score)
            )}>
              <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Health Score</div>
              <div className={cn('text-5xl font-black tabular-nums', scoreColor(score))}>
                {score.toFixed(0)}
              </div>
              <div className="text-xs text-muted-foreground mt-1">/ 100</div>
              <div className="mt-3 w-full h-2 bg-muted/30 rounded-full overflow-hidden">
                <div
                  className={cn('h-full rounded-full transition-all duration-1000', score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500')}
                  style={{ width: `${Math.min(score, 100)}%t('plugins.t18699')${(count / maxCount) * 100}%` }}
                              />
                            </div>
                            <span className="text-xs tabular-nums text-muted-foreground w-8 text-right">{count}</span>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* By Type */}
                <div className="p-5 rounded-2xl border border-border bg-card">
                  <div className="text-xs text-muted-foreground mb-3">{t('pulse.byType')}<div>
                  <div className="space-y-2">
                    {Object.entries(digest.timeline_summary.by_type)
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 10)
                      .map(([type, count]) => {
                        const maxCount = Math.max(...Object.values(digest.timeline_summary.by_type));
                        return (
                          <div key={type} className="flex items-center gap-2">
                            <span className="text-xs w-32 truncate text-muted-foreground">{type}</span>
                            <div className="flex-1 h-4 bg-muted/20 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                                style={{ width: `${(count / maxCount) * 100}%t('plugins.t52456')${Math.max(h, 2)}%` }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
                <span>{trends[0]?.date}</span>
                <span>{trends[trends.length - 1]?.date}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

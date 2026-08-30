'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import dynamic from 'next/dynamic';
import { assembleECharts } from 'flint-chart';
import { getApiBaseUrl } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { PageLayout } from '@/components/page-layout';
import { DetailPanel } from '@/components/detail-panel';
import { LeftPanel } from '@/components/left-panel';
import { useAppStore } from '@/stores/app-store';
import {
  Activity, RefreshCw, CheckCircle, XCircle, Loader2,
  Server, Clock, Cpu, HardDrive, MemoryStick,
  Gauge, AlertTriangle, Info, Wifi, WifiOff,
  BarChart3, TrendingUp, Play, History, Target,
  Zap, Shield, Droplets, Volume2, Layers, Link2,
  MousePointer, Sparkles, Filter, ChevronDown,
  ChevronUp, Trash2,
} from 'lucide-react';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false });

// ── Types ────────────────────────────────────────────────────

// Diagnostics types
interface OrganResult {
  key: string;
  label: string;
  category: string;
  status: 'ok' | 'error';
  status_code: number;
  response_time_ms: number;
}

interface SystemInfo {
  hostname: string;
  os: string;
  arch: string;
  python: string;
  cpu_count: number;
  cpu_percent: number;
  memory_total_gb: number;
  memory_used_gb: number;
  memory_percent: number;
  disk_total_gb: number;
  disk_used_gb: number;
  disk_percent: number;
  uptime_seconds: number;
}

interface DiagnosticsSummary {
  total: number;
  healthy: number;
  unhealthy: number;
  avg_response_ms: number;
  max_response_ms: number;
  overall: string;
}

interface CheckAllResult {
  summary: DiagnosticsSummary;
  system: SystemInfo;
  organs: OrganResult[];
}

// Metrics types
interface ParsedMetrics {
  info: { version: string; python: string; os: string } | null;
  uptime: number;
  memory: number;
  cpuTime: number;
  httpRequests: { path: string; method: string; count: number }[];
  httpErrors: { status: string; count: number }[];
  organHealth: { organ: string; healthy: boolean }[];
  system: {
    cpuCount: number;
    memTotal: number;
    memAvailable: number;
    diskTotal: number;
    diskFree: number;
  };
}

// Benchmark types
interface BenchmarkTarget {
  organ: string;
  label: string;
  endpoint: string;
}

interface LatencyStats {
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
}

interface BenchmarkResultItem {
  organ: string;
  label: string;
  iterations: number;
  success: number;
  errors: number;
  latency: LatencyStats;
  throughput_rps: number;
  total_duration_ms: number;
  timestamp: number;
}

interface BenchmarkRun {
  run_id: string;
  organs_benchmarked: number;
  iterations: number;
  concurrency: number;
  results: BenchmarkResultItem[];
}

interface HistoryEntry {
  id: number;
  run_id: string;
  organ: string;
  label: string;
  iterations: number;
  success: number;
  errors: number;
  min_ms: number;
  max_ms: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  rps?: number;
  throughput_rps?: number;
  total_ms: number;
  total_duration_ms?: number;
  timestamp: number;
}

// Activity types
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

// ── Constants ────────────────────────────────────────────────

type MonitoringTab = 'overview' | 'system' | 'benchmark' | 'activity';
type BenchmarkSubTab = 'run' | 'comparison' | 'history';

const ORGAN_ICONS: Record<string, React.ElementType> = {
  vein: Droplets, gland: Zap, immune: Shield, trajectory: Activity,
  echo: Volume2, mirror: Layers, link: Link2, limb: MousePointer, will: Sparkles,
};

const TYPE_COLORS: Record<string, string> = {
  stats: 'text-blue-500 bg-blue-500/10',
  llm_call: 'text-purple-500 bg-purple-500/10',
  security: 'text-red-500 bg-red-500/10',
  agent_event: 'text-emerald-500 bg-emerald-500/10',
  message: 'text-amber-500 bg-amber-500/10',
  sandbox: 'text-indigo-500 bg-indigo-500/10',
  webhook: 'text-orange-500 bg-orange-500/10',
  rpa_task: 'text-pink-500 bg-pink-500/10',
  cron_job: 'text-cyan-500 bg-cyan-500/10',
};

// ── Helpers ──────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatMs(ms: number) {
  return ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(ts?: number, t?: (key: string, opts?: Record<string, unknown>) => string): string {
  if (!ts) return '';
  const date = new Date(ts * 1000);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  if (diff < 60000) return t ? t('activity.justNow') : 'just now';
  if (diff < 3600000) return t ? t('activity.minutesAgo', { count: Math.floor(diff / 60000) }) : `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return t ? t('activity.hoursAgo', { count: Math.floor(diff / 3600000) }) : `${Math.floor(diff / 3600000)}h ago`;
  return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function parsePrometheus(text: string): ParsedMetrics {
  const lines = text.split('\n');
  const result: ParsedMetrics = {
    info: null, uptime: 0, memory: 0, cpuTime: 0,
    httpRequests: [], httpErrors: [], organHealth: [],
    system: { cpuCount: 0, memTotal: 0, memAvailable: 0, diskTotal: 0, diskFree: 0 },
  };
  const requestMap: Record<string, number> = {};
  for (const line of lines) {
    if (line.startsWith('#') || !line.trim()) continue;
    const match = line.match(/^(\w+)(?:\{([^}]*)\})?\s+(.+)$/);
    if (!match) continue;
    const [, name, labelsStr, valueStr] = match;
    const value = parseFloat(valueStr);
    const labels: Record<string, string> = {};
    if (labelsStr) {
      for (const part of labelsStr.split(',')) {
        const [k, v] = part.split('=');
        if (k && v) labels[k.trim()] = v.replace(/"/g, '').trim();
      }
    }
    switch (name) {
      case 'opensoul_info':
        result.info = { version: labels.version || '', python: labels.python || '', os: labels.os || '' };
        break;
      case 'opensoul_uptime_seconds': result.uptime = value; break;
      case 'opensoul_process_resident_memory_bytes': result.memory = value; break;
      case 'opensoul_process_cpu_seconds_total': result.cpuTime = value; break;
      case 'opensoul_http_requests_total': {
        const key = `${labels.method} ${labels.path}`;
        requestMap[key] = (requestMap[key] || 0) + value;
        break;
      }
      case 'opensoul_http_errors_total':
        result.httpErrors.push({ status: labels.status, count: value });
        break;
      case 'opensoul_organ_health':
        result.organHealth.push({ organ: labels.organ, healthy: value === 1 });
        break;
      case 'opensoul_system_cpu_count': result.system.cpuCount = value; break;
      case 'opensoul_system_memory_total_bytes': result.system.memTotal = value; break;
      case 'opensoul_system_memory_available_bytes': result.system.memAvailable = value; break;
      case 'opensoul_system_disk_total_bytes': result.system.diskTotal = value; break;
      case 'opensoul_system_disk_free_bytes': result.system.diskFree = value; break;
    }
  }
  result.httpRequests = Object.entries(requestMap)
    .map(([key, count]) => { const [method, path] = key.split(' '); return { method, path, count }; })
    .sort((a, b) => b.count - a.count).slice(0, 20);
  result.organHealth.sort((a, b) => a.organ.localeCompare(b.organ));
  return result;
}

function getLatencyColor(ms: number) {
  if (ms < 5) return 'text-green-500';
  if (ms < 20) return 'text-emerald-400';
  if (ms < 50) return 'text-yellow-400';
  if (ms < 100) return 'text-orange-400';
  return 'text-red-400';
}

function getLatencyBg(ms: number) {
  if (ms < 5) return 'bg-green-500';
  if (ms < 20) return 'bg-emerald-400';
  if (ms < 50) return 'bg-yellow-400';
  if (ms < 100) return 'bg-orange-400';
  return 'bg-red-400';
}

// ── Shared UI Components ────────────────────────────────────

function StatusBadge({ status }: { status: 'ok' | 'error' }) {
  return status === 'ok' ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
      <CheckCircle size={10} /> OK
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-500">
      <XCircle size={10} /> ERROR
    </span>
  );
}

function GaugeBar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const barColor = pct < 60 ? 'bg-emerald-500' : pct < 85 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono font-medium">{pct.toFixed(1)}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all duration-500', barColor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ResponseTimeBar({ ms }: { ms: number }) {
  const width = Math.min(ms / 10, 100);
  const color = ms < 50 ? 'bg-emerald-500' : ms < 200 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${width}%` }} />
      </div>
      <span className="text-[10px] font-mono text-muted-foreground w-14 text-right">{ms.toFixed(1)}ms</span>
    </div>
  );
}

// ── ECharts Components ──────────────────────────────────────

function ResponseTimeChart({ organs }: { organs: OrganResult[] }) {
  const option = useMemo(() => {
    const sorted = [...organs].sort((a, b) => a.response_time_ms - b.response_time_ms).slice(0, 20);
    const values = sorted.map(o => ({ organ: o.label, time: o.response_time_ms }));
    return assembleECharts({
      data: { values },
      semantic_types: { organ: 'Nominal', time: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'organ' }, y: { field: 'time' } },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [organs]);

  if (organs.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-orange-500" />
        <h4 className="text-xs font-medium">Response Time Distribution</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

function OrganStatusPieChart({ organs }: { organs: OrganResult[] }) {
  const option = useMemo(() => {
    const ok = organs.filter(o => o.status === 'ok').length;
    const err = organs.filter(o => o.status === 'error').length;
    const values = [
      { status: 'Healthy', count: ok },
      { status: 'Error', count: err },
    ];
    return assembleECharts({
      data: { values },
      semantic_types: { status: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Pie Chart',
        encodings: { x: { field: 'status' }, y: { field: 'count' } },
        chartProperties: { innerRadius: 35 },
        canvasSize: { width: 300, height: 200 },
      },
    });
  }, [organs]);

  if (organs.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-emerald-500" />
        <h4 className="text-xs font-medium">Organ Status</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

function HttpRequestRateChart({ httpRequests }: { httpRequests: { path: string; method: string; count: number }[] }) {
  const option = useMemo(() => {
    const values = httpRequests.slice(0, 10).map(r => ({
      endpoint: `${r.method} ${r.path}`,
      count: r.count,
    }));
    return assembleECharts({
      data: { values },
      semantic_types: { endpoint: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'endpoint' }, y: { field: 'count' } },
        canvasSize: { width: 500, height: 200 },
      },
    });
  }, [httpRequests]);

  if (httpRequests.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-blue-500" />
        <h4 className="text-xs font-medium">HTTP Request Rate</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

function ErrorRateChart({ httpErrors }: { httpErrors: { status: string; count: number }[] }) {
  const option = useMemo(() => {
    const values = httpErrors.map(e => ({ status: e.status, count: e.count }));
    return assembleECharts({
      data: { values },
      semantic_types: { status: 'Nominal', count: 'Quantity' },
      chart_spec: {
        chartType: 'Pie Chart',
        encodings: { x: { field: 'status' }, y: { field: 'count' } },
        chartProperties: { innerRadius: 35 },
        canvasSize: { width: 300, height: 200 },
      },
    });
  }, [httpErrors]);

  if (httpErrors.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-red-500" />
        <h4 className="text-xs font-medium">Error Rate</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 200 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

function BenchmarkLatencyChart({ results }: { results: BenchmarkResultItem[] }) {
  const option = useMemo(() => {
    const sorted = [...results].sort((a, b) => a.latency.avg_ms - b.latency.avg_ms);
    const values = sorted.map(r => ({ organ: r.label, avg: r.latency.avg_ms, p95: r.latency.p95_ms, p99: r.latency.p99_ms }));
    return assembleECharts({
      data: { values },
      semantic_types: { organ: 'Nominal', avg: 'Quantity', p95: 'Quantity', p99: 'Quantity' },
      chart_spec: {
        chartType: 'Bar Chart',
        encodings: { x: { field: 'organ' }, y: { field: 'avg' } },
        canvasSize: { width: 600, height: 250 },
      },
    });
  }, [results]);

  if (results.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} className="text-primary" />
        <h4 className="text-xs font-medium">Latency Comparison</h4>
      </div>
      <ReactECharts option={option as any} style={{ height: 250 }} opts={{ renderer: 'svg' }} />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────

export function MonitoringClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const setPageSidebar = useAppStore((s) => s.setPageSidebar);
  const setPageWorkspace = useAppStore((s) => s.setPageWorkspace);

  // ── Tab state ──────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<MonitoringTab>('overview');

  // ── Diagnostics (Overview) state ───────────────────────────
  const [diagData, setDiagData] = useState<CheckAllResult | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState('');

  // ── Metrics (System) state ─────────────────────────────────
  const [metrics, setMetrics] = useState<ParsedMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [autoRefreshMetrics, setAutoRefreshMetrics] = useState(true);
  const [lastMetricsUpdate, setLastMetricsUpdate] = useState<Date | null>(null);

  // ── Benchmark state ────────────────────────────────────────
  const [benchTab, setBenchTab] = useState<BenchmarkSubTab>('run');
  const [targets, setTargets] = useState<BenchmarkTarget[]>([]);
  const [selectedOrgans, setSelectedOrgans] = useState<Set<string>>(new Set());
  const [iterations, setIterations] = useState(20);
  const [concurrency, setConcurrency] = useState(5);
  const [benchRunning, setBenchRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(null);
  const [comparison, setComparison] = useState<HistoryEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState('');
  const [expandedOrgan, setExpandedOrgan] = useState<string | null>(null);

  // ── Activity state ─────────────────────────────────────────
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [summary, setSummary] = useState<StreamSummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [selectedOrgan, setSelectedOrgan] = useState<string | null>(null);
  const [autoRefreshActivity, setAutoRefreshActivity] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<StreamEvent | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const [sseConnected, setSseConnected] = useState(false);

  // ── Detail selection state ─────────────────────────────────
  const [selectedOrganDetail, setSelectedOrganDetail] = useState<OrganResult | null>(null);

  // ── Diagnostics data fetching ──────────────────────────────

  const runDiagnostics = useCallback(async () => {
    setDiagLoading(true);
    setDiagError('');
    try {
      const res = await fetch(`${apiBase}/api/diagnostics/check-all`, {
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        setDiagData(await res.json());
      } else {
        setDiagError(`HTTP ${res.status}`);
      }
    } catch (e: unknown) {
      setDiagError(e instanceof Error ? e.message : 'Check failed');
    } finally {
      setDiagLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    runDiagnostics();
    const interval = setInterval(runDiagnostics, 60000);
    return () => clearInterval(interval);
  }, [runDiagnostics]);

  // ── Metrics data fetching ──────────────────────────────────

  const fetchMetrics = useCallback(async () => {
    try {
      const resp = await fetch(`${apiBase}/metrics`);
      const text = await resp.text();
      setMetrics(parsePrometheus(text));
      setLastMetricsUpdate(new Date());
    } catch {} finally {
      setMetricsLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { fetchMetrics(); }, [fetchMetrics]);

  useEffect(() => {
    if (!autoRefreshMetrics) return;
    const timer = setInterval(fetchMetrics, 15000);
    return () => clearInterval(timer);
  }, [autoRefreshMetrics, fetchMetrics]);

  // ── Benchmark data fetching ────────────────────────────────

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/benchmark/targets`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets || []);
        setSelectedOrgans(new Set((data.targets || []).map((t: BenchmarkTarget) => t.organ)));
      }
    } catch {}
  }, [apiBase]);

  const fetchComparison = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/benchmark/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparison(data.comparison || []);
      }
    } catch {}
  }, [apiBase]);

  const fetchHistory = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (historyFilter) params.set('organ', historyFilter);
      const res = await fetch(`${apiBase}/api/benchmark/history?${params}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {}
  }, [apiBase, historyFilter]);

  useEffect(() => {
    fetchTargets();
    fetchComparison();
  }, [fetchTargets, fetchComparison]);

  useEffect(() => {
    if (benchTab === 'history') fetchHistory();
    if (benchTab === 'comparison') fetchComparison();
  }, [benchTab, fetchHistory, fetchComparison]);

  const runBenchmark = async () => {
    if (selectedOrgans.size === 0) return;
    setBenchRunning(true);
    setCurrentRun(null);
    try {
      const res = await fetch(`${apiBase}/api/benchmark/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organs: Array.from(selectedOrgans), iterations, concurrency }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentRun(data);
        fetchComparison();
      }
    } catch {}
    setBenchRunning(false);
  };

  const quickBench = async (organ: string) => {
    setBenchRunning(true);
    try {
      const res = await fetch(`${apiBase}/api/benchmark/quick/${organ}?iterations=10`, { method: 'POST' });
      if (res.ok) {
        setCurrentRun(await res.json());
      }
    } catch {}
    setBenchRunning(false);
  };

  const deleteHistory = async () => {
    try {
      await fetch(`${apiBase}/api/benchmark/history`, { method: 'DELETE' });
      setHistory([]);
      setComparison([]);
    } catch {}
  };

  const toggleOrgan = (organ: string) => {
    const next = new Set(selectedOrgans);
    if (next.has(organ)) next.delete(organ);
    else next.add(organ);
    setSelectedOrgans(next);
  };

  // ── Activity data fetching ─────────────────────────────────

  const fetchEvents = useCallback(async () => {
    setActivityLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (selectedOrgan) params.set('organ', selectedOrgan);
      const res = await fetch(`${apiBase}/api/events/stream?${params}`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) {
        const data = await res.json();
        setEvents(data.events || []);
      }
    } catch {}
    setActivityLoading(false);
  }, [apiBase, selectedOrgan]);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/events/stream/summary`, { signal: AbortSignal.timeout(10000) });
      if (res.ok) setSummary(await res.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchEvents();
    fetchSummary();
  }, [fetchEvents, fetchSummary]);

  // SSE real-time connection
  useEffect(() => {
    if (!autoRefreshActivity || activeTab !== 'activity') {
      if (sseRef.current) { sseRef.current.close(); sseRef.current = null; setSseConnected(false); }
      return;
    }
    const sseUrl = selectedOrgan
      ? `${apiBase}/api/events/sse?organ=${selectedOrgan}`
      : `${apiBase}/api/events/sse`;
    const es = new EventSource(sseUrl);
    sseRef.current = es;
    es.addEventListener('connected', () => setSseConnected(true));
    es.addEventListener('message', (e) => {
      try {
        const newEvent: StreamEvent = JSON.parse(e.data);
        setEvents((prev) => {
          if (prev.some((ev) => ev.id === newEvent.id)) return prev;
          return [newEvent, ...prev].slice(0, 100);
        });
      } catch {}
    });
    es.onerror = () => setSseConnected(false);
    const summaryTimer = setInterval(fetchSummary, 30000);
    return () => { es.close(); sseRef.current = null; setSseConnected(false); clearInterval(summaryTimer); };
  }, [autoRefreshActivity, activeTab, apiBase, selectedOrgan, fetchSummary]);

  const handleActivityRefresh = async () => {
    setActivityLoading(true);
    try {
      await fetch(`${apiBase}/api/events/stream/refresh`, { method: 'POST' });
      await fetchEvents();
      await fetchSummary();
    } catch {}
    setActivityLoading(false);
  };

  // ── Computed values ────────────────────────────────────────

  const sortedOrgans = diagData?.organs
    ? [...diagData.organs].sort((a, b) => a.response_time_ms - b.response_time_ms)
    : [];

  const grouped = sortedOrgans.reduce<Record<string, OrganResult[]>>((acc, o) => {
    (acc[o.category] = acc[o.category] || []).push(o);
    return acc;
  }, {});

  const categoryLabels: Record<string, string> = {
    core: t('diagnostics.coreLayer') || 'Core',
    platform: t('diagnostics.platformLayer') || 'Platform',
    advanced: t('diagnostics.advancedLayer') || 'Advanced',
    system: t('diagnostics.systemLayer') || 'System',
    service: t('diagnostics.serviceLayer') || 'Service',
    organ: t('diagnostics.organLayer') || 'Organ',
  };

  const healthyMetricsOrgans = metrics?.organHealth.filter(o => o.healthy).length ?? 0;
  const totalMetricsOrgans = metrics?.organHealth.length ?? 0;

  const memUsedPercent = metrics && metrics.system.memTotal > 0
    ? ((metrics.system.memTotal - metrics.system.memAvailable) / metrics.system.memTotal) * 100 : 0;
  const diskUsedPercent = metrics && metrics.system.diskTotal > 0
    ? ((metrics.system.diskTotal - metrics.system.diskFree) / metrics.system.diskTotal) * 100 : 0;

  const maxAvgMs = comparison.length > 0 ? Math.max(...comparison.map(c => c.avg_ms || 0), 1) : 1;

  const uniqueOrgans = [...new Set(events.map(e => e.organ))];

  // ── Tab definitions ────────────────────────────────────────

  const tabs: { id: MonitoringTab; label: string; icon: React.ElementType; color: string }[] = [
    { id: 'overview', label: 'Overview', icon: Activity, color: 'text-orange-500' },
    { id: 'system', label: 'System', icon: BarChart3, color: 'text-blue-500' },
    { id: 'benchmark', label: 'Benchmark', icon: Gauge, color: 'text-primary' },
    { id: 'activity', label: 'Activity', icon: Zap, color: 'text-emerald-500' },
  ];

  // ── Register sidebar content (LeftPanel) ───────────────────

  useEffect(() => {
    if (activeTab === 'overview') {
      // Overview sidebar: organ list grouped by category
      setPageSidebar(
        <LeftPanel
          items={sortedOrgans}
          filter={(organ, q) => organ.label.toLowerCase().includes(q) || organ.key.toLowerCase().includes(q)}
          renderItem={(organ) => (
            <button
              key={organ.key}
              onClick={() => { setSelectedOrganDetail(organ); setSelectedEvent(null); }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg transition-colors',
                selectedOrganDetail?.key === organ.key
                  ? 'bg-orange-500/10 border border-orange-500/30'
                  : 'hover:bg-muted/50 border border-transparent',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', organ.status === 'ok' ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-xs font-medium truncate flex-1">{organ.label}</span>
              </div>
              <div className="ml-3.5 mt-1">
                <span className="text-[10px] font-mono text-muted-foreground">{organ.response_time_ms.toFixed(1)}ms</span>
              </div>
            </button>
          )}
          header={
            <div className="px-2 pb-2">
              <button
                onClick={runDiagnostics}
                disabled={diagLoading}
                className="flex items-center justify-center gap-1.5 rounded-lg bg-orange-500/10 border border-orange-500/30 px-3 py-1.5 text-xs font-medium text-orange-500 hover:bg-orange-500/20 transition-colors w-full"
              >
                <RefreshCw size={12} className={diagLoading ? 'animate-spin' : ''} />
                {diagLoading ? 'Checking...' : 'Refresh'}
              </button>
            </div>
          }
          placeholder={t('diagnostics.searchOrgans') || 'Search organs...'}
          emptyState={
            <div className="px-2 py-8 text-center text-muted-foreground/50">
              <Server className="w-8 h-8 mx-auto mb-1.5" />
              <p className="text-xs">No organs</p>
            </div>
          }
        />
      );
    } else if (activeTab === 'system') {
      // System sidebar: organ health grid
      setPageSidebar(
        <LeftPanel
          items={metrics?.organHealth ?? []}
          filter={(o, q) => o.organ.toLowerCase().includes(q)}
          renderItem={(o) => (
            <button
              key={o.organ}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg transition-colors',
                'hover:bg-muted/50 border border-transparent',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', o.healthy ? 'bg-emerald-500' : 'bg-red-500')} />
                <span className="text-xs font-medium truncate flex-1">{o.organ}</span>
                <span className="text-[10px]">{o.healthy ? '✅' : '❌'}</span>
              </div>
            </button>
          )}
          header={
            <div className="px-2 pb-2">
              <button
                onClick={() => setAutoRefreshMetrics(!autoRefreshMetrics)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors w-full',
                  autoRefreshMetrics
                    ? 'bg-green-500/10 border border-green-500/30 text-green-600'
                    : 'bg-muted border border-border text-muted-foreground',
                )}
              >
                <div className={cn('w-1.5 h-1.5 rounded-full', autoRefreshMetrics ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground')} />
                {autoRefreshMetrics ? 'Auto-refresh ON' : 'Auto-refresh OFF'}
              </button>
            </div>
          }
          placeholder={t('metrics.searchOrgans') || 'Search organs...'}
          emptyState={
            <div className="px-2 py-8 text-center text-muted-foreground/50">
              <BarChart3 className="w-8 h-8 mx-auto mb-1.5" />
              <p className="text-xs">No metrics data</p>
            </div>
          }
        />
      );
    } else if (activeTab === 'benchmark') {
      // Benchmark sidebar: organ selection
      setPageSidebar(
        <LeftPanel
          items={targets}
          filter={(target, q) => target.label.toLowerCase().includes(q) || target.organ.toLowerCase().includes(q)}
          renderItem={(target) => (
            <button
              key={target.organ}
              onClick={() => toggleOrgan(target.organ)}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg transition-colors',
                selectedOrgans.has(target.organ)
                  ? 'bg-primary/10 border border-primary/30'
                  : 'hover:bg-muted/50 border border-transparent',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className={cn('w-2 h-2 rounded-full shrink-0', selectedOrgans.has(target.organ) ? 'bg-primary' : 'bg-muted-foreground/30')} />
                <span className="text-xs font-medium truncate flex-1">{target.label}</span>
              </div>
              <div className="ml-3.5 mt-1 flex gap-2">
                <button
                  onClick={(e) => { e.stopPropagation(); quickBench(target.organ); }}
                  className="text-[10px] text-primary hover:underline"
                  disabled={benchRunning}
                >
                  Quick bench
                </button>
              </div>
            </button>
          )}
          header={
            <div className="px-2 pb-2 flex gap-1.5">
              <button
                onClick={() => setSelectedOrgans(new Set(targets.map(t => t.organ)))}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                All
              </button>
              <button
                onClick={() => setSelectedOrgans(new Set())}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
              >
                None
              </button>
            </div>
          }
          placeholder={t('benchmark.searchOrgans') || 'Search organs...'}
          emptyState={
            <div className="px-2 py-8 text-center text-muted-foreground/50">
              <Gauge className="w-8 h-8 mx-auto mb-1.5" />
              <p className="text-xs">No targets</p>
            </div>
          }
        />
      );
    } else if (activeTab === 'activity') {
      // Activity sidebar: event list
      setPageSidebar(
        <LeftPanel
          items={events}
          filter={(event, q) => event.summary.toLowerCase().includes(q) || event.organ.toLowerCase().includes(q)}
          renderItem={(event) => (
            <button
              key={event.id}
              onClick={() => { setSelectedEvent(event); setSelectedOrganDetail(null); }}
              className={cn(
                'w-full text-left px-2 py-2 rounded-lg transition-colors',
                selectedEvent?.id === event.id
                  ? 'bg-emerald-500/10 border border-emerald-500/30'
                  : 'hover:bg-muted/50 border border-transparent',
              )}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-sm shrink-0">{event.emoji}</span>
                <span className="text-xs font-medium truncate flex-1">{event.summary}</span>
              </div>
              <div className="ml-5 mt-1 flex items-center gap-2">
                <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', TYPE_COLORS[event.type] || 'text-muted-foreground bg-muted')}>
                  {event.type}
                </span>
                <span className="text-[10px] text-muted-foreground">{formatTimestamp(event.timestamp, t)}</span>
              </div>
            </button>
          )}
          header={
            <div className="px-2 pb-2 flex gap-1.5">
              <button
                onClick={() => setAutoRefreshActivity(!autoRefreshActivity)}
                className={cn(
                  'flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors flex-1',
                  autoRefreshActivity
                    ? 'bg-green-500/10 border border-green-500/30 text-green-500'
                    : 'border border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <div className={cn('w-1.5 h-1.5 rounded-full', autoRefreshActivity ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground')} />
                {autoRefreshActivity && sseConnected ? 'SSE Live' : 'Live'}
              </button>
              <button
                onClick={handleActivityRefresh}
                disabled={activityLoading}
                className="flex items-center justify-center rounded-lg border border-border px-2.5 py-1.5 text-xs hover:bg-muted transition-colors disabled:opacity-50"
              >
                {activityLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              </button>
            </div>
          }
          placeholder={t('activity.searchEvents') || 'Search events...'}
          emptyState={
            <div className="px-2 py-8 text-center text-muted-foreground/50">
              <Activity className="w-8 h-8 mx-auto mb-1.5" />
              <p className="text-xs">{t('activity.noEvents') || 'No events'}</p>
            </div>
          }
        />
      );
    }
    return () => setPageSidebar(null);
  }, [activeTab, sortedOrgans, selectedOrganDetail, metrics, targets, selectedOrgans, events, selectedEvent,
      autoRefreshActivity, sseConnected, activityLoading, diagLoading, benchRunning, t, setPageSidebar,
      runDiagnostics, toggleOrgan, quickBench, handleActivityRefresh, setAutoRefreshMetrics]);

  // ── Register workspace content (DetailPanel) ───────────────

  useEffect(() => {
    if (activeTab === 'overview' && selectedOrganDetail) {
      setPageWorkspace(
        <DetailPanel
          title={selectedOrganDetail.label}
          subtitle={selectedOrganDetail.key}
          icon={<Server className="w-5 h-5 text-orange-500" />}
          badge={selectedOrganDetail.status === 'ok' ? 'Healthy' : 'Error'}
          onClose={() => setSelectedOrganDetail(null)}
          sections={[
            {
              title: t('diagnostics.details') || 'Details',
              items: [
                { label: 'Key', value: selectedOrganDetail.key },
                { label: t('diagnostics.category') || 'Category', value: categoryLabels[selectedOrganDetail.category] || selectedOrganDetail.category },
                { label: t('diagnostics.status') || 'Status', value: selectedOrganDetail.status.toUpperCase(), icon: selectedOrganDetail.status === 'ok' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" /> },
                { label: t('diagnostics.statusCode') || 'Status Code', value: String(selectedOrganDetail.status_code) },
                { label: t('diagnostics.responseTime') || 'Response Time', value: `${selectedOrganDetail.response_time_ms.toFixed(1)}ms`, icon: <Clock className="w-3.5 h-3.5" /> },
              ],
            },
          ]}
        />
      );
    } else if (activeTab === 'activity' && selectedEvent) {
      setPageWorkspace(
        <DetailPanel
          title={selectedEvent.summary}
          subtitle={`${selectedEvent.organ} · ${selectedEvent.type}`}
          icon={<span className="text-lg">{selectedEvent.emoji}</span>}
          badge={selectedEvent.type}
          onClose={() => setSelectedEvent(null)}
          sections={[
            {
              title: t('activity.details') || 'Details',
              items: [
                { label: 'ID', value: selectedEvent.id },
                { label: t('activity.organ') || 'Organ', value: selectedEvent.organ },
                { label: t('activity.type') || 'Type', value: selectedEvent.type },
                ...(selectedEvent.timestamp ? [{ label: t('activity.time') || 'Time', value: formatTimestamp(selectedEvent.timestamp, t), icon: <Clock className="w-3.5 h-3.5" /> }] : []),
              ],
            },
            ...(selectedEvent.detail ? [{
              title: t('activity.payload') || 'Payload',
              items: [{
                label: '',
                value: (
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
                    {JSON.stringify(selectedEvent.detail, null, 2)}
                  </pre>
                ),
              }],
            }] : []),
          ]}
        />
      );
    } else {
      setPageWorkspace(null);
    }
    return () => setPageWorkspace(null);
  }, [activeTab, selectedOrganDetail, selectedEvent, categoryLabels, t, setPageWorkspace]);

  // ── Main render ────────────────────────────────────────────

  return (
    <PageLayout
      title="Monitoring"
      icon={<Activity size={16} className="text-orange-500" />}
    >
      <div className="h-full overflow-y-auto">
        {/* ── Tab bar ──────────────────────────────────────── */}
        <div className="border-b border-border px-3 lg:px-6">
          <div className="flex gap-1">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  setSelectedOrganDetail(null);
                  setSelectedEvent(null);
                }}
                className={cn(
                  'px-3 py-2 text-xs font-medium border-b-2 transition-colors',
                  activeTab === tab.id
                    ? `border-current ${tab.color}`
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground/30',
                )}
              >
                <tab.icon className="w-3.5 h-3.5 inline mr-1.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Overview Tab ─────────────────────────────────── */}
        {activeTab === 'overview' && (
          <div className="p-3 lg:p-6 space-y-3 lg:space-y-6">
            {diagError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 lg:p-4 text-xs lg:text-sm text-red-500">
                {diagError}
              </div>
            )}

            {diagData && (
              <>
                {/* Health Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4">
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{t('diagnostics.totalOrgans') || 'Total'}</span>
                      <div className="rounded-lg p-1.5 bg-blue-500/10"><Server size={14} className="text-blue-500" /></div>
                    </div>
                    <p className="text-xl lg:text-2xl font-bold">{diagData.summary.total}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      <span className="text-emerald-500">{diagData.summary.healthy}</span> ok ·
                      <span className="text-red-500 ml-1">{diagData.summary.unhealthy}</span> error
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{t('diagnostics.avgResponse') || 'Avg Response'}</span>
                      <div className="rounded-lg p-1.5 bg-amber-500/10"><Clock size={14} className="text-amber-500" /></div>
                    </div>
                    <p className="text-xl lg:text-2xl font-bold">{diagData.summary.avg_response_ms}<span className="text-xs lg:text-sm font-normal ml-0.5">ms</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">max {diagData.summary.max_response_ms.toFixed(1)}ms</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">CPU</span>
                      <div className="rounded-lg p-1.5 bg-violet-500/10"><Cpu size={14} className="text-violet-500" /></div>
                    </div>
                    <p className="text-xl lg:text-2xl font-bold">{diagData.system.cpu_percent}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{diagData.system.cpu_count} cores</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">{t('diagnostics.memory') || 'Memory'}</span>
                      <div className="rounded-lg p-1.5 bg-emerald-500/10"><MemoryStick size={14} className="text-emerald-500" /></div>
                    </div>
                    <p className="text-xl lg:text-2xl font-bold">{diagData.system.memory_percent}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{diagData.system.memory_used_gb}G / {diagData.system.memory_total_gb}G</p>
                  </div>
                </div>

                {/* System Gauges */}
                <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                  <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                    <Gauge size={14} className="text-orange-500" />
                    {t('diagnostics.systemGauges') || 'System Gauges'}
                  </h3>
                  <GaugeBar value={diagData.system.cpu_percent} max={100} label="CPU" />
                  <GaugeBar value={diagData.system.memory_percent} max={100} label={`${t('diagnostics.memory') || 'Memory'} (${diagData.system.memory_used_gb}G / ${diagData.system.memory_total_gb}G)`} />
                  <GaugeBar value={diagData.system.disk_percent} max={100} label={`${t('diagnostics.disk') || 'Disk'} (${diagData.system.disk_used_gb}G / ${diagData.system.disk_total_gb}G)`} />
                </div>

                {/* ECharts */}
                <div className="grid gap-3 lg:gap-4 lg:grid-cols-2">
                  <ResponseTimeChart organs={sortedOrgans} />
                  <OrganStatusPieChart organs={sortedOrgans} />
                </div>

                {/* System Info */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2 mb-4">
                    <Info size={14} className="text-blue-500" />
                    {t('diagnostics.systemInfo') || 'System Info'}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4 text-xs lg:text-sm">
                    <div><span className="text-muted-foreground">{t('diagnostics.hostname') || 'Hostname'}: </span><span className="font-mono">{diagData.system.hostname}</span></div>
                    <div><span className="text-muted-foreground">{t('diagnostics.os') || 'OS'}: </span>{diagData.system.os}</div>
                    <div><span className="text-muted-foreground">{t('diagnostics.arch') || 'Arch'}: </span>{diagData.system.arch}</div>
                    <div><span className="text-muted-foreground">Python: </span><span className="font-mono">{diagData.system.python}</span></div>
                    <div><span className="text-muted-foreground">{t('diagnostics.uptime') || 'Uptime'}: </span>{formatUptime(diagData.system.uptime_seconds)}</div>
                  </div>
                </div>

                {/* Organ List — grouped by category */}
                {Object.entries(grouped).map(([category, organs]) => (
                  <div key={category} className="rounded-xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/30">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                          <Gauge size={14} className="text-orange-500" />
                          {categoryLabels[category] || category}
                        </h3>
                        <span className="text-[10px] text-muted-foreground">
                          {organs.filter(o => o.status === 'ok').length}/{organs.length} {t('diagnostics.healthy') || 'healthy'}
                        </span>
                      </div>
                    </div>
                    <div className="divide-y divide-border">
                      {organs.map(organ => (
                        <div key={organ.key} className="flex items-center gap-2 lg:gap-4 px-5 py-3 hover:bg-muted/30 transition-colors">
                          <StatusBadge status={organ.status} />
                          <span className="text-xs lg:text-sm font-medium flex-1">{organ.label}</span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground">{organ.key}</span>
                          <ResponseTimeBar ms={organ.response_time_ms} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {/* Overall Status Banner */}
                <div
                  className={cn(
                    'rounded-xl border p-5 flex items-center gap-2 lg:gap-4',
                    diagData.summary.overall === 'ok'
                      ? 'border-emerald-500/30 bg-emerald-500/5'
                      : 'border-amber-500/30 bg-amber-500/5',
                  )}
                >
                  {diagData.summary.overall === 'ok' ? (
                    <CheckCircle size={24} className="text-emerald-500 shrink-0" />
                  ) : (
                    <AlertTriangle size={24} className="text-amber-500 shrink-0" />
                  )}
                  <div>
                    <p className="text-xs lg:text-sm font-semibold">
                      {diagData.summary.overall === 'ok'
                        ? (t('diagnostics.allOk') || 'All systems operational')
                        : (t('diagnostics.partialError') || 'Some systems have issues')}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {diagData.summary.healthy}/{diagData.summary.total} {t('diagnostics.organHealth') || 'organs healthy'} ·
                      {t('diagnostics.avgResponse') || 'Avg'} {diagData.summary.avg_response_ms}ms ·
                      {diagData.system.hostname} ({diagData.system.os})
                    </p>
                  </div>
                </div>
              </>
            )}

            {!diagData && diagLoading && (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={24} className="animate-spin text-orange-500" />
              </div>
            )}
          </div>
        )}

        {/* ── System Tab ───────────────────────────────────── */}
        {activeTab === 'system' && (
          <div className="p-3 lg:p-6 space-y-4 lg:space-y-6 max-w-7xl mx-auto">
            {metricsLoading && !metrics ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : !metrics ? (
              <div className="p-3 lg:p-6 text-center text-muted-foreground">
                {t('metrics.loadFailed', 'Failed to load metrics')}
              </div>
            ) : (
              <>
                {/* Header bar */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg lg:text-xl font-bold flex items-center gap-2">
                      📊 {t('metrics.title', 'Prometheus Metrics')}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                      {lastMetricsUpdate && `${t('metrics.updated', 'Updated')}: ${lastMetricsUpdate.toLocaleTimeString()}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setAutoRefreshMetrics(!autoRefreshMetrics)}
                      className={cn(
                        'px-3 py-1.5 text-xs rounded-lg border',
                        autoRefreshMetrics
                          ? 'bg-green-500/10 border-green-500/30 text-green-600'
                          : 'bg-muted border-border text-muted-foreground',
                      )}
                    >
                      {autoRefreshMetrics ? t('metrics.autoRefresh', 'Auto-refresh ON') : t('metrics.autoRefreshOff', 'Auto-refresh OFF')}
                    </button>
                    <button onClick={fetchMetrics} className="px-3 py-1.5 text-xs rounded-lg border border-border hover:bg-accent">
                      {t('metrics.refresh', 'Refresh')}
                    </button>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4">
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs text-muted-foreground mb-1">{t('metrics.uptime', 'Uptime')}</div>
                    <div className="text-xl lg:text-2xl font-bold">{formatUptime(metrics.uptime)}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs text-muted-foreground mb-1">{t('metrics.organs', 'Organs')}</div>
                    <div className="text-xl lg:text-2xl font-bold">
                      <span className={healthyMetricsOrgans === totalMetricsOrgans ? 'text-green-500' : 'text-yellow-500'}>{healthyMetricsOrgans}</span>
                      <span className="text-muted-foreground">/{totalMetricsOrgans}</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs text-muted-foreground mb-1">{t('metrics.memory', 'Memory')}</div>
                    <div className="text-xl lg:text-2xl font-bold">{formatBytes(metrics.memory)}</div>
                    <div className="text-xs text-muted-foreground">RSS</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs text-muted-foreground mb-1">{t('metrics.cpuTime', 'CPU Time')}</div>
                    <div className="text-xl lg:text-2xl font-bold">{metrics.cpuTime.toFixed(1)}s</div>
                  </div>
                </div>

                {/* System Resources */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 lg:gap-4">
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">🖥️ {t('metrics.cpu', 'CPU')}</div>
                    <div className="text-2xl lg:text-3xl font-bold mb-1">{metrics.system.cpuCount}</div>
                    <div className="text-xs text-muted-foreground">{t('metrics.cores', 'cores')}</div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">🧠 {t('metrics.systemMemory', 'System Memory')}</div>
                    <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                      <div className={cn('h-2.5 rounded-full', memUsedPercent > 90 ? 'bg-red-500' : memUsedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500')} style={{ width: `${Math.min(memUsedPercent, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(metrics.system.memTotal - metrics.system.memAvailable)} {t('metrics.used', 'used')}</span>
                      <span>{formatBytes(metrics.system.memTotal)} total</span>
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">💾 {t('metrics.disk', 'Disk')}</div>
                    <div className="w-full bg-muted rounded-full h-2.5 mb-2">
                      <div className={cn('h-2.5 rounded-full', diskUsedPercent > 90 ? 'bg-red-500' : diskUsedPercent > 70 ? 'bg-yellow-500' : 'bg-green-500')} style={{ width: `${Math.min(diskUsedPercent, 100)}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatBytes(metrics.system.diskTotal - metrics.system.diskFree)} {t('metrics.used', 'used')}</span>
                      <span>{formatBytes(metrics.system.diskTotal)} total</span>
                    </div>
                  </div>
                </div>

                {/* Organ Health Grid */}
                <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                  <div className="text-xs lg:text-sm font-medium mb-3">🫀 {t('metrics.organHealth', 'Organ Health Status')}</div>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {metrics.organHealth.map(o => (
                      <div key={o.organ} className={cn('text-center p-2 rounded-lg text-xs', o.healthy ? 'bg-green-500/10 text-green-600 border border-green-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20')}>
                        <div className="text-lg">{o.healthy ? '✅' : '❌'}</div>
                        <div className="font-medium mt-1">{o.organ}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ECharts */}
                <div className="grid gap-3 lg:gap-4 lg:grid-cols-2">
                  <HttpRequestRateChart httpRequests={metrics.httpRequests} />
                  <ErrorRateChart httpErrors={metrics.httpErrors} />
                </div>

                {/* Top HTTP Endpoints + Errors */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 lg:gap-4">
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">🔥 {t('metrics.topEndpoints', 'Top HTTP Endpoints')}</div>
                    <div className="space-y-1 max-h-80 overflow-y-auto">
                      {metrics.httpRequests.map((r, i) => (
                        <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-accent">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono', r.method === 'GET' ? 'bg-blue-500/10 text-blue-600' : r.method === 'POST' ? 'bg-green-500/10 text-green-600' : 'bg-orange-500/10 text-orange-600')}>{r.method}</span>
                            <span className="font-mono truncate">{r.path}</span>
                          </div>
                          <span className="font-bold ml-2">{r.count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">⚠️ {t('metrics.errors', 'HTTP Errors')}</div>
                    {metrics.httpErrors.length === 0 ? (
                      <div className="text-center text-muted-foreground py-8">{t('metrics.noErrors', 'No errors recorded ✨')}</div>
                    ) : (
                      <div className="space-y-1">
                        {metrics.httpErrors.map((e, i) => (
                          <div key={i} className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-accent">
                            <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-mono', e.status.startsWith('4') ? 'bg-yellow-500/10 text-yellow-600' : 'bg-red-500/10 text-red-600')}>{e.status}</span>
                            <span className="font-bold">{e.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="mt-6 p-3 bg-muted/50 rounded-lg">
                      <div className="text-xs font-medium mb-1">{t('metrics.scrapeConfig', 'Prometheus Scrape Config')}</div>
                      <code className="text-xs text-muted-foreground block">
                        {`scrape_configs:\n  - job_name: 'opensoul'\n    scrape_interval: 15s\n    static_configs:\n      - targets: ['localhost:8090']\n    metrics_path: /metrics`}
                      </code>
                    </div>
                  </div>
                </div>

                {/* Instance Info */}
                {metrics.info && (
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs lg:text-sm font-medium mb-3">ℹ️ {t('metrics.instanceInfo', 'Instance Info')}</div>
                    <div className="flex gap-2 lg:gap-6 text-xs">
                      <div><span className="text-muted-foreground">Version: </span><span className="font-mono">{metrics.info.version}</span></div>
                      <div><span className="text-muted-foreground">Python: </span><span className="font-mono">{metrics.info.python}</span></div>
                      <div><span className="text-muted-foreground">OS: </span><span className="font-mono">{metrics.info.os}</span></div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Benchmark Tab ────────────────────────────────── */}
        {activeTab === 'benchmark' && (
          <div className="p-3 lg:p-6 space-y-3 lg:space-y-6">
            {/* Sub-tab bar */}
            <div className="flex items-center gap-2">
              {([
                { id: 'run' as BenchmarkSubTab, label: t('benchmark.run'), icon: Play },
                { id: 'comparison' as BenchmarkSubTab, label: t('benchmark.comparison'), icon: BarChart3 },
                { id: 'history' as BenchmarkSubTab, label: t('benchmark.history'), icon: History },
              ]).map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setBenchTab(tab.id)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    benchTab === tab.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <tab.icon size={14} />
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Run sub-tab */}
            {benchTab === 'run' && (
              <div className="space-y-3 lg:space-y-6">
                {/* Config Panel */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xs lg:text-sm font-semibold">{t('benchmark.testConfig')}</h2>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setSelectedOrgans(new Set(targets.map(t => t.organ)))} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{t('benchmark.selectAll')}</button>
                      <button onClick={() => setSelectedOrgans(new Set())} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{t('benchmark.clearAll')}</button>
                    </div>
                  </div>
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {targets.map(t => (
                      <button
                        key={t.organ}
                        onClick={() => toggleOrgan(t.organ)}
                        className={cn(
                          'flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                          selectedOrgans.has(t.organ)
                            ? 'bg-primary/10 text-primary border border-primary/30'
                            : 'bg-muted text-muted-foreground border border-transparent hover:border-border',
                        )}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 lg:gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('benchmark.iterations')}</span>
                      <input type="number" value={iterations} onChange={e => setIterations(Math.max(1, Math.min(200, Number(e.target.value))))} className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-xs" min={1} max={200} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{t('benchmark.concurrency')}</span>
                      <input type="number" value={concurrency} onChange={e => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value))))} className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-xs" min={1} max={50} />
                    </div>
                    <button onClick={runBenchmark} disabled={benchRunning || selectedOrgans.size === 0} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50">
                      {benchRunning ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                      {benchRunning ? t('benchmark.testing') : t('benchmark.runTest', { count: selectedOrgans.size })}
                    </button>
                  </div>
                </div>

                {/* Results */}
                {currentRun && currentRun.results && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs lg:text-sm font-semibold">
                        {t('benchmark.testResults', { organs: currentRun.organs_benchmarked, iterations: currentRun.iterations })}
                      </h2>
                      <span className="text-xs text-muted-foreground">Run ID: {currentRun.run_id}</span>
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-border bg-muted/50">
                            <th className="px-3 py-2 text-left font-medium">{t('benchmark.organ')}</th>
                            <th className="px-3 py-2 text-right font-medium">{t('benchmark.success')}</th>
                            <th className="px-3 py-2 text-right font-medium">{t('benchmark.failure')}</th>
                            <th className="px-3 py-2 text-right font-medium">{t('benchmark.avg')}</th>
                            <th className="px-3 py-2 text-right font-medium">P50</th>
                            <th className="px-3 py-2 text-right font-medium">P95</th>
                            <th className="px-3 py-2 text-right font-medium">P99</th>
                            <th className="px-3 py-2 text-right font-medium">{t('benchmark.min')}</th>
                            <th className="px-3 py-2 text-right font-medium">{t('benchmark.max')}</th>
                            <th className="px-3 py-2 text-right font-medium">RPS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentRun.results.slice().sort((a, b) => a.latency.avg_ms - b.latency.avg_ms).map(r => (
                            <tr key={r.organ} className="border-b border-border/50 hover:bg-muted/30">
                              <td className="px-3 py-2 font-medium">{r.label}</td>
                              <td className="px-3 py-2 text-right text-green-500">{r.success}</td>
                              <td className="px-3 py-2 text-right">{r.errors > 0 ? <span className="text-red-400">{r.errors}</span> : <span className="text-muted-foreground">0</span>}</td>
                              <td className={cn('px-3 py-2 text-right font-mono font-medium', getLatencyColor(r.latency.avg_ms))}>{formatMs(r.latency.avg_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(r.latency.p50_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(r.latency.p95_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(r.latency.p99_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(r.latency.min_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(r.latency.max_ms)}</td>
                              <td className="px-3 py-2 text-right font-mono">{r.throughput_rps.toFixed(0)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* ECharts latency comparison */}
                    <BenchmarkLatencyChart results={currentRun.results} />

                    {/* Visual Latency Bars */}
                    <div className="rounded-xl border border-border bg-card p-5">
                      <h3 className="mb-3 text-xs font-semibold text-muted-foreground">{t('benchmark.latencyDistribution')}</h3>
                      <div className="space-y-2">
                        {currentRun.results.slice().sort((a, b) => a.latency.avg_ms - b.latency.avg_ms).map(r => {
                          const maxMs = Math.max(...currentRun.results.map(x => x.latency.avg_ms), 1);
                          const pct = (r.latency.avg_ms / maxMs) * 100;
                          return (
                            <div key={r.organ} className="flex items-center gap-3">
                              <span className="w-24 shrink-0 text-xs font-medium truncate">{r.label}</span>
                              <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                                <div className={cn('h-full rounded-full transition-all', getLatencyBg(r.latency.avg_ms))} style={{ width: `${Math.max(pct, 1)}%` }} />
                              </div>
                              <span className={cn('w-16 text-right text-xs font-mono', getLatencyColor(r.latency.avg_ms))}>{formatMs(r.latency.avg_ms)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {!currentRun && !benchRunning && (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <Gauge size={48} className="mb-4 opacity-30" />
                    <p className="text-xs lg:text-sm">{t('benchmark.selectOrgans')}</p>
                    <p className="text-xs">{t('benchmark.resultsHint')}</p>
                  </div>
                )}
              </div>
            )}

            {/* Comparison sub-tab */}
            {benchTab === 'comparison' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs lg:text-sm font-semibold">{t('benchmark.comparisonTitle')}</h2>
                  <button onClick={fetchComparison} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                    <RefreshCw size={12} /> {t('common.refresh')}
                  </button>
                </div>
                {comparison.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <BarChart3 size={48} className="mb-4 opacity-30" />
                    <p className="text-xs lg:text-sm">{t('benchmark.noData')}</p>
                    <p className="text-xs">{t('benchmark.noDataHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {comparison.map((item, idx) => {
                      const pct = (item.avg_ms / maxAvgMs) * 100;
                      const rank = idx + 1;
                      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                      return (
                        <div key={item.organ}>
                          <div
                            className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/30 transition-colors"
                            onClick={() => setExpandedOrgan(expandedOrgan === item.organ ? null : item.organ)}
                          >
                            <span className="w-8 text-center text-xs lg:text-sm">{medal}</span>
                            <span className="w-24 shrink-0 text-xs font-medium">{item.label}</span>
                            <div className="flex-1 h-6 rounded-full bg-muted/50 overflow-hidden">
                              <div className={cn('h-full rounded-full transition-all', getLatencyBg(item.avg_ms))} style={{ width: `${Math.max(pct, 1)}%` }} />
                            </div>
                            <div className="flex items-center gap-2 lg:gap-4 text-xs">
                              <span className={cn('font-mono font-medium', getLatencyColor(item.avg_ms))}>{formatMs(item.avg_ms)}</span>
                              <span className="text-muted-foreground">P95: {formatMs(item.p95_ms)}</span>
                              <span className="text-muted-foreground">{item.rps?.toFixed(0) || '—'} rps</span>
                              <span className="text-muted-foreground">{item.success}/{item.iterations}</span>
                            </div>
                            {expandedOrgan === item.organ ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </div>
                          {expandedOrgan === item.organ && (
                            <div className="ml-11 rounded-lg border border-border bg-muted/30 p-3 lg:p-4">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 lg:gap-4 text-xs">
                                <div><span className="text-muted-foreground">{t('benchmark.minLatency')}</span><p className="font-mono font-medium">{formatMs(item.min_ms)}</p></div>
                                <div><span className="text-muted-foreground">{t('benchmark.maxLatency')}</span><p className="font-mono font-medium">{formatMs(item.max_ms)}</p></div>
                                <div><span className="text-muted-foreground">{t('benchmark.p99Latency')}</span><p className="font-mono font-medium">{formatMs(item.p99_ms)}</p></div>
                                <div><span className="text-muted-foreground">{t('benchmark.totalDuration')}</span><p className="font-mono font-medium">{formatMs(item.total_ms)}</p></div>
                                <div><span className="text-muted-foreground">{t('benchmark.throughput')}</span><p className="font-mono font-medium">{item.rps?.toFixed(1)} req/s</p></div>
                                <div><span className="text-muted-foreground">{t('benchmark.testTime')}</span><p className="font-mono font-medium">{new Date(item.timestamp * 1000).toLocaleString()}</p></div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* History sub-tab */}
            {benchTab === 'history' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs lg:text-sm font-semibold">{t('benchmark.historyTitle')}</h2>
                  <div className="flex items-center gap-2">
                    <select value={historyFilter} onChange={e => setHistoryFilter(e.target.value)} className="rounded-lg border border-border bg-background px-2 py-1 text-xs">
                      <option value="">{t('benchmark.allOrgans')}</option>
                      {targets.map(t => (<option key={t.organ} value={t.organ}>{t.label}</option>))}
                    </select>
                    <button onClick={fetchHistory} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"><RefreshCw size={12} /></button>
                    <button onClick={deleteHistory} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10"><Trash2 size={12} /> {t('common.delete')}</button>
                  </div>
                </div>
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                    <History size={48} className="mb-4 opacity-30" />
                    <p className="text-xs lg:text-sm">{t('benchmark.noHistory')}</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-border bg-muted/50">
                          <th className="px-3 py-2 text-left font-medium">{t('benchmark.time')}</th>
                          <th className="px-3 py-2 text-left font-medium">{t('benchmark.organ')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('benchmark.iterShort')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('benchmark.success')}</th>
                          <th className="px-3 py-2 text-right font-medium">{t('benchmark.avg')}</th>
                          <th className="px-3 py-2 text-right font-medium">P50</th>
                          <th className="px-3 py-2 text-right font-medium">P95</th>
                          <th className="px-3 py-2 text-right font-medium">P99</th>
                          <th className="px-3 py-2 text-right font-medium">RPS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.map(h => (
                          <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30">
                            <td className="px-3 py-2 text-muted-foreground">{new Date(h.timestamp * 1000).toLocaleString()}</td>
                            <td className="px-3 py-2 font-medium">{h.label}</td>
                            <td className="px-3 py-2 text-right">{h.iterations}</td>
                            <td className="px-3 py-2 text-right text-green-500">{h.success}</td>
                            <td className={cn('px-3 py-2 text-right font-mono font-medium', getLatencyColor(h.avg_ms))}>{formatMs(h.avg_ms)}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(h.p50_ms)}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(h.p95_ms)}</td>
                            <td className="px-3 py-2 text-right font-mono text-muted-foreground">{formatMs(h.p99_ms)}</td>
                            <td className="px-3 py-2 text-right font-mono">{h.rps?.toFixed(0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Activity Tab ─────────────────────────────────── */}
        {activeTab === 'activity' && (
          <div className="p-3 lg:p-6 space-y-3 lg:space-y-6">
            {/* Filter bar */}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={cn(
                  'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition-colors',
                  selectedOrgan ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                <Filter size={12} />
                {selectedOrgan || t('activity.allOrgans') || 'All Organs'}
                <ChevronDown size={10} />
              </button>
              {showFilters && (
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => { setSelectedOrgan(null); setShowFilters(false); }}
                    className={cn('rounded-lg px-3 py-1.5 text-xs transition-colors', !selectedOrgan ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted')}
                  >
                    {t('activity.all') || 'All'}
                  </button>
                  {uniqueOrgans.map(organ => (
                    <button
                      key={organ}
                      onClick={() => { setSelectedOrgan(organ); setShowFilters(false); }}
                      className={cn('rounded-lg px-3 py-1.5 text-xs transition-colors flex items-center gap-1.5', selectedOrgan === organ ? 'bg-primary text-primary-foreground' : 'border border-border hover:bg-muted')}
                    >
                      {events.find(e => e.organ === organ)?.emoji} {organ}
                    </button>
                  ))}
                </div>
              )}
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                {events.length} {t('activity.events') || 'events'}
              </span>
            </div>

            {/* Summary cards */}
            {summary && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 lg:gap-4">
                <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                  <div className="text-xl lg:text-2xl font-bold">{summary.total_events}</div>
                  <div className="text-[10px] text-muted-foreground">{t('activity.totalEvents') || 'Total Events'}</div>
                </div>
                {summary.most_active_organ && (
                  <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                    <div className="text-xs text-muted-foreground mb-1">{t('activity.mostActive') || 'Most Active'}</div>
                    <div className="text-sm font-medium capitalize">{summary.most_active_organ}</div>
                  </div>
                )}
                <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                  <div className="text-xl lg:text-2xl font-bold">{Object.keys(summary.by_organ || {}).length}</div>
                  <div className="text-[10px] text-muted-foreground">{t('activity.byOrgan') || 'Active Organs'}</div>
                </div>
                <div className="rounded-xl border border-border bg-card p-3 lg:p-4">
                  <div className="text-xl lg:text-2xl font-bold">{Object.keys(summary.by_type || {}).length}</div>
                  <div className="text-[10px] text-muted-foreground">{t('activity.byType') || 'Event Types'}</div>
                </div>
              </div>
            )}

            {/* Event list */}
            {events.length === 0 && !activityLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Activity size={48} className="mb-4 opacity-30" />
                <p className="text-sm">{t('activity.noEvents') || 'No events yet'}</p>
                <p className="text-xs mt-1">{t('activity.noEventsHint') || 'Events will appear here as organs emit them'}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="divide-y divide-border">
                  {events.map(event => {
                    const typeColor = TYPE_COLORS[event.type] || 'text-muted-foreground bg-muted';
                    return (
                      <div
                        key={event.id}
                        className="px-3 lg:px-5 py-3 transition-colors hover:bg-muted/30 cursor-pointer"
                        onClick={() => { setSelectedEvent(event); setSelectedOrganDetail(null); }}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <span className="text-sm">{event.emoji}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-medium truncate">{event.summary}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', typeColor)}>{event.type}</span>
                              <span className="text-[10px] text-muted-foreground capitalize">{event.organ}</span>
                              {event.timestamp && (
                                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                  <Clock size={9} /> {formatTimestamp(event.timestamp, t)}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatTimestamp(event.collected_at, t)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

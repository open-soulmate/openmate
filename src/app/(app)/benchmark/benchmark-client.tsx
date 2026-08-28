"use client";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import {
  Zap, Play, Square, Clock, BarChart3, TrendingUp, Trash2,
  Loader2, CheckCircle, XCircle, ChevronDown, ChevronUp,
  RefreshCw, History, Target, Gauge, ArrowUpDown,
} from "lucide-react";

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

// Comparison items come from DB with flat fields
type ComparisonItem = HistoryEntry;

type TabId = "run" | "comparison" | "history";

export function BenchmarkClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [tab, setTab] = useState<TabId>("run");
  const [targets, setTargets] = useState<BenchmarkTarget[]>([]);
  const [selectedOrgans, setSelectedOrgans] = useState<Set<string>>(new Set());
  const [iterations, setIterations] = useState(20);
  const [concurrency, setConcurrency] = useState(5);
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<BenchmarkRun | null>(null);
  const [comparison, setComparison] = useState<ComparisonItem[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyFilter, setHistoryFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedOrgan, setExpandedOrgan] = useState<string | null>(null);

  const fetchTargets = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/benchmark/targets`);
      if (res.ok) {
        const data = await res.json();
        setTargets(data.targets || []);
        // Select all by default
        setSelectedOrgans(new Set((data.targets || []).map((t: BenchmarkTarget) => t.organ)));
      }
    } catch {}
  }, [apiBase]);

  const fetchComparison = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/benchmark/comparison`);
      if (res.ok) {
        const data = await res.json();
        setComparison(data.comparison || []);
      }
    } catch {}
  }, [apiBase]);

  const fetchHistory = useCallback(async () => {
    if (!apiBase) return;
    try {
      const params = new URLSearchParams({ limit: "100" });
      if (historyFilter) params.set("organ", historyFilter);
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
    if (tab === "history") fetchHistory();
    if (tab === "comparison") fetchComparison();
  }, [tab, fetchHistory, fetchComparison]);

  const runBenchmark = async () => {
    if (!apiBase || selectedOrgans.size === 0) return;
    setRunning(true);
    setCurrentRun(null);
    try {
      const res = await fetch(`${apiBase}/api/benchmark/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organs: Array.from(selectedOrgans),
          iterations,
          concurrency,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentRun(data);
        fetchComparison();
      }
    } catch {}
    setRunning(false);
  };

  const quickBench = async (organ: string) => {
    if (!apiBase) return;
    setRunning(true);
    try {
      const res = await fetch(`${apiBase}/api/benchmark/quick/${organ}?iterations=10`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setCurrentRun(data);
      }
    } catch {}
    setRunning(false);
  };

  const deleteHistory = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/benchmark/history`, { method: "DELETE" });
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

  const selectAll = () => setSelectedOrgans(new Set(targets.map(t => t.organ)));
  const selectNone = () => setSelectedOrgans(new Set());

  const formatMs = (ms: number) => ms < 1 ? `${(ms * 1000).toFixed(0)}μs` : ms < 1000 ? `${ms.toFixed(1)}ms` : `${(ms / 1000).toFixed(2)}s`;

  const getLatencyColor = (ms: number) => {
    if (ms < 5) return "text-green-500";
    if (ms < 20) return "text-emerald-400";
    if (ms < 50) return "text-yellow-400";
    if (ms < 100) return "text-orange-400";
    return "text-red-400";
  };

  const getLatencyBg = (ms: number) => {
    if (ms < 5) return "bg-green-500";
    if (ms < 20) return "bg-emerald-400";
    if (ms < 50) return "bg-yellow-400";
    if (ms < 100) return "bg-orange-400";
    return "bg-red-400";
  };

  const maxAvgMs = comparison.length > 0 ? Math.max(...comparison.map(c => c.avg_ms || 0), 1) : 1;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "run", label: t("benchmark.run"), icon: Play },
    { id: "comparison", label: t("benchmark.comparison"), icon: BarChart3 },
    { id: "history", label: t("benchmark.history"), icon: History },
  ];

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 lg:px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Gauge size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">OpenBenchmark</h1>
            <p className="text-xs text-muted-foreground">{t("benchmark.subtitle", { count: targets.length })}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <t.icon size={14} />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 lg:p-6">
        {/* ── Run Tab ── */}
        {tab === "run" && (
          <div className="space-y-3 lg:space-y-6">
            {/* Config Panel */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-xs lg:text-sm font-semibold">{t("benchmark.testConfig")}</h2>
                <div className="flex items-center gap-2">
                  <button onClick={selectAll} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{t("benchmark.selectAll")}</button>
                  <button onClick={selectNone} className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">{t("benchmark.clearAll")}</button>
                </div>
              </div>

              {/* Organ Selection Grid */}
              <div className="mb-4 flex flex-wrap gap-1.5">
                {targets.map(t => (
                  <button
                    key={t.organ}
                    onClick={() => toggleOrgan(t.organ)}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                      selectedOrgans.has(t.organ)
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "bg-muted text-muted-foreground border border-transparent hover:border-border"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Params */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("benchmark.iterations")}</span>
                  <input
                    type="number"
                    value={iterations}
                    onChange={e => setIterations(Math.max(1, Math.min(200, Number(e.target.value))))}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-xs"
                    min={1}
                    max={200}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t("benchmark.concurrency")}</span>
                  <input
                    type="number"
                    value={concurrency}
                    onChange={e => setConcurrency(Math.max(1, Math.min(50, Number(e.target.value))))}
                    className="w-16 rounded-lg border border-border bg-background px-2 py-1 text-center text-xs"
                    min={1}
                    max={50}
                  />
                </div>
                <button
                  onClick={runBenchmark}
                  disabled={running || selectedOrgans.size === 0}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {running ? t("benchmark.testing") : t("benchmark.runTest", { count: selectedOrgans.size })}
                </button>
              </div>
            </div>

            {/* Results */}
            {currentRun && currentRun.results && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs lg:text-sm font-semibold">
                    {t("benchmark.testResults", { organs: currentRun.organs_benchmarked, iterations: currentRun.iterations })}
                  </h2>
                  <span className="text-xs text-muted-foreground">Run ID: {currentRun.run_id}</span>
                </div>

                {/* Results Table */}
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/50">
                        <th className="px-3 py-2 text-left font-medium">{t("benchmark.organ")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("benchmark.success")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("benchmark.failure")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("benchmark.avg")}</th>
                        <th className="px-3 py-2 text-right font-medium">P50</th>
                        <th className="px-3 py-2 text-right font-medium">P95</th>
                        <th className="px-3 py-2 text-right font-medium">P99</th>
                        <th className="px-3 py-2 text-right font-medium">{t("benchmark.min")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("benchmark.max")}</th>
                        <th className="px-3 py-2 text-right font-medium">RPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRun.results
                        .slice()
                        .sort((a, b) => a.latency.avg_ms - b.latency.avg_ms)
                        .map(r => (
                        <tr key={r.organ} className="border-b border-border/50 hover:bg-muted/30">
                          <td className="px-3 py-2 font-medium">{r.label}</td>
                          <td className="px-3 py-2 text-right text-green-500">{r.success}</td>
                          <td className="px-3 py-2 text-right">{r.errors > 0 ? <span className="text-red-400">{r.errors}</span> : <span className="text-muted-foreground">0</span>}</td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${getLatencyColor(r.latency.avg_ms)}`}>{formatMs(r.latency.avg_ms)}</td>
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

                {/* Visual Latency Bars */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-3 text-xs font-semibold text-muted-foreground">{t("benchmark.latencyDistribution")}</h3>
                  <div className="space-y-2">
                    {currentRun.results
                      .slice()
                      .sort((a, b) => a.latency.avg_ms - b.latency.avg_ms)
                      .map(r => {
                        const maxMs = Math.max(...currentRun.results.map(x => x.latency.avg_ms), 1);
                        const pct = (r.latency.avg_ms / maxMs) * 100;
                        return (
                          <div key={r.organ} className="flex items-center gap-3">
                            <span className="w-24 shrink-0 text-xs font-medium truncate">{r.label}</span>
                            <div className="flex-1 h-5 rounded-full bg-muted/50 overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${getLatencyBg(r.latency.avg_ms)}`}
                                style={{ width: `${Math.max(pct, 1)}%` }}
                              />
                            </div>
                            <span className={`w-16 text-right text-xs font-mono ${getLatencyColor(r.latency.avg_ms)}`}>
                              {formatMs(r.latency.avg_ms)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {!currentRun && !running && (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <Gauge size={48} className="mb-4 opacity-30" />
                <p className="text-xs lg:text-sm">{t("benchmark.selectOrgans")}</p>
                <p className="text-xs">{t("benchmark.resultsHint")}</p>
              </div>
            )}
          </div>
        )}

        {/* ── Comparison Tab ── */}
        {tab === "comparison" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs lg:text-sm font-semibold">{t("benchmark.comparisonTitle")}</h2>
              <button onClick={fetchComparison} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                <RefreshCw size={12} /> {t("common.refresh")}
              </button>
            </div>

            {comparison.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <BarChart3 size={48} className="mb-4 opacity-30" />
                <p className="text-xs lg:text-sm">{t("benchmark.noData")}</p>
                <p className="text-xs">{t("benchmark.noDataHint")}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {comparison.map((item, idx) => {
                  const pct = (item.avg_ms / maxAvgMs) * 100;
                  const rank = idx + 1;
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `#${rank}`;
                  return (
                    <div
                      key={item.organ}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => setExpandedOrgan(expandedOrgan === item.organ ? null : item.organ)}
                    >
                      <span className="w-8 text-center text-xs lg:text-sm">{medal}</span>
                      <span className="w-24 shrink-0 text-xs font-medium">{item.label}</span>
                      <div className="flex-1 h-6 rounded-full bg-muted/50 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${getLatencyBg(item.avg_ms)}`}
                          style={{ width: `${Math.max(pct, 1)}%` }}
                        />
                      </div>
                      <div className="flex items-center gap-2 lg:gap-4 text-xs">
                        <span className={`font-mono font-medium ${getLatencyColor(item.avg_ms)}`}>
                          {formatMs(item.avg_ms)}
                        </span>
                        <span className="text-muted-foreground">
                          P95: {formatMs(item.p95_ms)}
                        </span>
                        <span className="text-muted-foreground">
                          {item.rps?.toFixed(0) || "—"} rps
                        </span>
                        <span className="text-muted-foreground">
                          {item.success}/{item.iterations}
                        </span>
                      </div>
                      {expandedOrgan === item.organ ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                  );
                })}

                {/* Expanded Detail */}
                {expandedOrgan && comparison.find(c => c.organ === expandedOrgan) && (() => {
                  const item = comparison.find(c => c.organ === expandedOrgan)!;
                  return (
                    <div className="ml-11 rounded-lg border border-border bg-muted/30 p-3 lg:p-4">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 lg:gap-4 text-xs">
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.minLatency")}</span>
                          <p className="font-mono font-medium">{formatMs(item.min_ms)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.maxLatency")}</span>
                          <p className="font-mono font-medium">{formatMs(item.max_ms)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.p99Latency")}</span>
                          <p className="font-mono font-medium">{formatMs(item.p99_ms)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.totalDuration")}</span>
                          <p className="font-mono font-medium">{formatMs(item.total_ms)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.throughput")}</span>
                          <p className="font-mono font-medium">{item.rps?.toFixed(1)} req/s</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">{t("benchmark.testTime")}</span>
                          <p className="font-mono font-medium">{new Date(item.timestamp * 1000).toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* ── History Tab ── */}
        {tab === "history" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs lg:text-sm font-semibold">{t("benchmark.historyTitle")}</h2>
              <div className="flex items-center gap-2">
                <select
                  value={historyFilter}
                  onChange={e => { setHistoryFilter(e.target.value); }}
                  className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
                >
                  <option value="">{t("benchmark.allOrgans")}</option>
                  {targets.map(t => (
                    <option key={t.organ} value={t.organ}>{t.label}</option>
                  ))}
                </select>
                <button onClick={fetchHistory} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
                  <RefreshCw size={12} />
                </button>
                <button onClick={deleteHistory} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-red-400 hover:bg-red-500/10">
                  <Trash2 size={12} /> {t("common.delete")}
                </button>
              </div>
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <History size={48} className="mb-4 opacity-30" />
                <p className="text-xs lg:text-sm">{t("benchmark.noHistory")}</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">{t("benchmark.time")}</th>
                      <th className="px-3 py-2 text-left font-medium">{t("benchmark.organ")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("benchmark.iterShort")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("benchmark.success")}</th>
                      <th className="px-3 py-2 text-right font-medium">{t("benchmark.avg")}</th>
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
                        <td className={`px-3 py-2 text-right font-mono font-medium ${getLatencyColor(h.avg_ms)}`}>{formatMs(h.avg_ms)}</td>
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
    </div>
  );
}

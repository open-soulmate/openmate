"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Zap, RefreshCw, Plus, Trash2, Search,
  Activity, Settings, Target, BarChart3,
  CheckCircle, XCircle, Loader2, Edit3, Save,
} from "lucide-react";

interface CacheEntry {
  entry_id: string;
  query: string;
  response: string;
  category: string;
  tags: string[];
  hit_count: number;
  importance: number;
  source: string;
  created_at: number;
  last_hit_at: number;
  ttl_seconds: number;
}

interface ReflexStats {
  cache: {
    total_entries: number;
    active_entries: number;
    expired_entries: number;
    usage_percent: number;
    total_hits: number;
    total_queries: number;
    hit_rate_percent: number;
    similarity_threshold: number;
    by_category: Record<string, number>;
    by_source: Record<string, number>;
  };
}

function formatTime(ts: number): string {
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString(undefined, {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function ReflexClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"cache" | "lookup" | "config">("cache");
  const [stats, setStats] = useState<ReflexStats | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCategory, setSearchCategory] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editResponse, setEditResponse] = useState("");

  // Create form
  const [newQuery, setNewQuery] = useState("");
  const [newResponse, setNewResponse] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [newImportance, setNewImportance] = useState(0.5);

  // Lookup form
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

  const apiBase = getApiBaseUrl();

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/reflex/health`);
      setStats(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (searchCategory) params.set("category", searchCategory);
      params.set("limit", "200");
      const res = await fetch(`${apiBase}/api/reflex/cache?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
    } catch {}
  }, [apiBase, searchCategory]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    if (tab === "cache") fetchEntries();
  }, [tab, fetchEntries]);

  const handleCreate = async () => {
    if (!newQuery.trim() || !newResponse.trim()) return;
    setLoading(true);
    try {
      await fetch(`${apiBase}/api/reflex/cache`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: newQuery, response: newResponse,
          category: newCategory, importance: newImportance,
        }),
      });
      setNewQuery(""); setNewResponse(""); setNewCategory("");
      fetchEntries(); fetchStats();
    } catch {} finally { setLoading(false); }
  };

  const handleLookup = async () => {
    if (!lookupQuery.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/reflex/lookup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: lookupQuery }),
      });
      setLookupResult(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/reflex/cache/${id}`, { method: "DELETE" });
      fetchEntries(); fetchStats();
    } catch {}
  };

  const handleSaveEdit = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/reflex/cache/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: editResponse }),
      });
      setEditId(null); setEditResponse(""); fetchEntries();
    } catch {}
  };

  const handleCleanup = async () => {
    try {
      const res = await fetch(`${apiBase}/api/reflex/cleanup`, { method: "POST" });
      const data = await res.json();
      alert(t("reflex.cleanupComplete", { count: data.removed }));
      fetchEntries(); fetchStats();
    } catch {}
  };

  const tabs = [
    { id: "cache" as const, label: t("reflex.cache") || "缓存管理", icon: Zap },
    { id: "lookup" as const, label: t("reflex.lookup") || "快速查询", icon: Target },
    { id: "config" as const, label: t("reflex.config") || "配置", icon: Settings },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-yellow-500" />
          <h1 className="text-lg font-semibold">{t("reflex.title") || "反射 · 高速应答"}</h1>
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">
            {t("reflex.subtitle") || "缓存 · 模糊匹配 · 快速应答"}
          </span>
        </div>
        <button onClick={() => { fetchStats(); tab === "cache" && fetchEntries(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
          <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Zap} label={t("reflex.activeEntries") || "活跃缓存"} value={String(stats.cache.active_entries)}
              sub={`${stats.cache.total_entries} ${t("reflex.total") || "总数"}`} color="text-yellow-500" bg="bg-yellow-500/10" />
            <StatCard icon={Target} label={t("reflex.hitRate") || "命中率"} value={`${stats.cache.hit_rate_percent}%`}
              sub={`${stats.cache.total_hits}/${stats.cache.total_queries} ${t("reflex.hits") || "命中"}`} color="text-emerald-500" bg="bg-emerald-500/10" />
            <StatCard icon={Activity} label={t("reflex.threshold") || "相似阈值"} value={`${Math.round(stats.cache.similarity_threshold * 100)}%`}
              sub={t("reflex.fuzzyMatch") || "模糊匹配"} color="text-blue-500" bg="bg-blue-500/10" />
            <StatCard icon={BarChart3} label={t("reflex.usage") || "使用率"} value={`${stats.cache.usage_percent}%`}
              sub={`${stats.cache.expired_entries} ${t("reflex.expired") || "已过期"}`} color="text-violet-500" bg="bg-violet-500/10" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === tabItem.id ? "bg-yellow-500/10 text-yellow-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Cache Management Tab */}
        {tab === "cache" && (
          <div className="space-y-4">
            {/* Create */}
            <div className="rounded-xl border border-border p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("reflex.addEntry") || "添加缓存条目"}</h3>
              <div className="grid grid-cols-2 gap-3">
                <input value={newQuery} onChange={(e) => setNewQuery(e.target.value)}
                  placeholder={t("reflex.queryPlaceholder") || "问题/查询..."}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/20" />
                <input value={newResponse} onChange={(e) => setNewResponse(e.target.value)}
                  placeholder={t("reflex.responsePlaceholder") || "标准回答..."}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/20" />
              </div>
              <div className="flex gap-3">
                <input value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
                  placeholder={t("reflex.category") || "分类"}
                  className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-yellow-500/20" />
                <div className="flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">{t("reflex.importance") || "重要性"}</label>
                  <input type="range" min="0" max="1" step="0.1" value={newImportance}
                    onChange={(e) => setNewImportance(parseFloat(e.target.value))} className="w-20" />
                  <span className="text-xs w-6">{newImportance}</span>
                </div>
                <button onClick={handleCreate} disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-4 py-2 text-sm text-white hover:bg-yellow-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t("common.add") || "添加"}
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-xs">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={searchCategory} onChange={(e) => setSearchCategory(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && fetchEntries()}
                  placeholder={t("reflex.filterCategory") || "按分类过滤..."}
                  className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-yellow-500/20" />
              </div>
              <button onClick={handleCleanup}
                className="flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
                <Trash2 size={14} /> {t("reflex.cleanup") || "清理过期"}
              </button>
              <span className="text-xs text-muted-foreground">{entries.length} {t("reflex.entries") || "条"}</span>
            </div>

            {/* Entry List */}
            {entries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Zap size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t("reflex.noEntries") || "暂无缓存条目"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map((e) => (
                  <div key={e.entry_id} className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{e.query}</span>
                          {e.category && (
                            <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-600">
                              {e.category}
                            </span>
                          )}
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                            {e.source}
                          </span>
                        </div>
                        {editId === e.entry_id ? (
                          <div className="flex gap-2">
                            <input value={editResponse} onChange={(ev) => setEditResponse(ev.target.value)}
                              className="flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm" />
                            <button onClick={() => handleSaveEdit(e.entry_id)}
                              className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-500/10"><Save size={14} /></button>
                            <button onClick={() => setEditId(null)}
                              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted"><XCircle size={14} /></button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">{e.response}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>{t("reflex.hits") || "命中"}: <strong>{e.hit_count}</strong></span>
                          <span>{t("reflex.importance") || "重要性"}: {e.importance}</span>
                          <span>{t("reflex.created") || "创建"}: {formatTime(e.created_at)}</span>
                          {e.last_hit_at > 0 && <span>{t("reflex.lastHit") || "最近命中"}: {formatTime(e.last_hit_at)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <button onClick={() => { setEditId(e.entry_id); setEditResponse(e.response); }}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-blue-500 hover:bg-blue-500/10 transition-colors">
                          <Edit3 size={14} />
                        </button>
                        <button onClick={() => handleDelete(e.entry_id)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Lookup Tab */}
        {tab === "lookup" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold">{t("reflex.testLookup") || "测试快速查询"}</h3>
              <p className="text-xs text-muted-foreground">{t("reflex.lookupDesc") || "输入问题，测试是否能从缓存中命中答案（模糊匹配）"}</p>
              <div className="flex gap-3">
                <input value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                  placeholder={t("reflex.lookupPlaceholder") || "输入问题..."}
                  className="flex-1 rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-yellow-500/20" />
                <button onClick={handleLookup} disabled={loading}
                  className="flex items-center gap-1.5 rounded-lg bg-yellow-500 px-5 py-3 text-sm text-white hover:bg-yellow-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {t("reflex.lookup") || "查询"}
                </button>
              </div>

              {lookupResult && (
                <div className={cn("rounded-xl border p-5 space-y-3", lookupResult.hit ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
                  <div className="flex items-center gap-2">
                    {lookupResult.hit ? <CheckCircle size={18} className="text-emerald-500" /> : <XCircle size={18} className="text-red-500" />}
                    <span className="font-medium">{lookupResult.hit ? (t("reflex.cacheHit") || "缓存命中!") : (t("reflex.cacheMiss") || "缓存未命中")}</span>
                  </div>
                  {lookupResult.hit && (
                    <>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{t("reflex.matchedQuery") || "匹配问题"}: {lookupResult.query}</span>
                        <span>{t("reflex.hitCount") || "命中次数"}: {lookupResult.hit_count}</span>
                        {lookupResult.category && <span>{t("reflex.category") || "分类"}: {lookupResult.category}</span>}
                      </div>
                      <div className="rounded-lg bg-muted p-4">
                        <p className="text-sm">{lookupResult.response}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Config Tab */}
        {tab === "config" && stats && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 space-y-4">
              <h3 className="text-sm font-semibold">{t("reflex.cacheConfig") || "缓存配置"}</h3>
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="text-xs text-muted-foreground">{t("reflex.maxEntries") || "最大条目"}</label>
                  <div className="mt-1 text-2xl font-bold">{stats.cache.total_entries}<span className="text-sm font-normal text-muted-foreground"> / 5000</span></div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("reflex.similarityThreshold") || "相似度阈值"}</label>
                  <div className="mt-1 text-2xl font-bold">{Math.round(stats.cache.similarity_threshold * 100)}%</div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t("reflex.defaultTTL") || "默认TTL"}</label>
                  <div className="mt-1 text-2xl font-bold">24h</div>
                </div>
              </div>

              {/* Category breakdown */}
              {Object.keys(stats.cache.by_category).length > 0 && (
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">{t("reflex.byCategory") || "按分类"}</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.cache.by_category).map(([cat, count]) => (
                      <span key={cat} className="rounded-full bg-yellow-500/10 px-3 py-1 text-xs text-yellow-600">
                        {cat}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Source breakdown */}
              {Object.keys(stats.cache.by_source).length > 0 && (
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">{t("reflex.bySource") || "按来源"}</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.cache.by_source).map(([src, count]) => (
                      <span key={src} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                        {src}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bg)}><Icon size={14} className={color} /></div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

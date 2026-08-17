"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Camera, RefreshCw, Trash2, ExternalLink, Search,
  FileText, Type, CheckCircle, Loader2, ArrowUpCircle,
  Globe, Clock, Hash,
} from "lucide-react";

interface Capture {
  id: number;
  capture_type: string;
  title: string;
  url: string;
  description: string;
  keywords: string[];
  content: string;
  content_hash: string;
  status: string;
  created_at: number;
  user_id: string;
}

interface CaptureStats {
  total_captures: number;
  page_captures: number;
  selection_captures: number;
}

function TypeBadge({ type }: { type: string }) {
  return type === "page" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-500">
      <Globe size={10} /> 页面
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-500">
      <Type size={10} /> 选文
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    captured: "bg-emerald-500/10 text-emerald-500",
    duplicate: "bg-yellow-500/10 text-yellow-500",
    promoted: "bg-blue-500/10 text-blue-500",
  };
  const labels: Record<string, string> = {
    captured: "已采集",
    duplicate: "重复",
    promoted: "已入库",
  };
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium", colors[status] || "bg-gray-500/10 text-gray-500")}>
      {labels[status] || status}
    </span>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const diff = (now.getTime() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function CaptureClient() {
  const apiBase = getApiBaseUrl();
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [stats, setStats] = useState<CaptureStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "page" | "selection">("all");
  const [search, setSearch] = useState("");
  const [promoting, setPromoting] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const typeParam = filter !== "all" ? `&capture_type=${filter}` : "";
      const [listRes, healthRes] = await Promise.all([
        fetch(`${apiBase}/api/capture/list?limit=100${typeParam}`),
        fetch(`${apiBase}/api/capture/health`),
      ]);
      const listData = await listRes.json();
      const healthData = await healthRes.json();
      setCaptures(listData.captures || []);
      setStats(healthData);
    } catch {}
    setLoading(false);
  }, [apiBase, filter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id: number) => {
    try {
      await fetch(`${apiBase}/api/capture/${id}`, { method: "DELETE" });
      setCaptures(prev => prev.filter(c => c.id !== id));
    } catch {}
  };

  const handlePromote = async (id: number) => {
    setPromoting(id);
    try {
      const res = await fetch(`${apiBase}/api/capture/${id}/promote?user_id=default`, { method: "POST" });
      if (res.ok) {
        setCaptures(prev => prev.map(c => c.id === id ? { ...c, status: "promoted" } : c));
      }
    } catch {}
    setPromoting(null);
  };

  const filteredCaptures = captures.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.url.toLowerCase().includes(q) || c.content.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10">
            <Camera size={18} className="text-orange-500" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">采集管理</h1>
            <p className="text-xs text-muted-foreground">浏览器扩展采集的内容，可提升到知识库</p>
          </div>
        </div>
        <button onClick={fetchData} className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> 刷新
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-3 border-b border-border px-6 py-3">
          <div className="rounded-lg bg-muted/50 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">总计</div>
            <div className="text-lg font-bold">{stats.total_captures}</div>
          </div>
          <div className="rounded-lg bg-blue-500/5 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">页面采集</div>
            <div className="text-lg font-bold text-blue-500">{stats.page_captures}</div>
          </div>
          <div className="rounded-lg bg-purple-500/5 px-3 py-2">
            <div className="text-[10px] text-muted-foreground">文本采集</div>
            <div className="text-lg font-bold text-purple-500">{stats.selection_captures}</div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 border-b border-border px-6 py-2.5">
        <div className="flex rounded-lg border border-border p-0.5">
          {(["all", "page", "selection"] as const).map(t => (
            <button key={t} onClick={() => setFilter(t)}
              className={cn("rounded-md px-2.5 py-1 text-xs transition-colors", filter === t ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}>
              {t === "all" ? "全部" : t === "page" ? "页面" : "选文"}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="搜索标题、URL或内容..." className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-3 text-xs" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-3">
        {loading && captures.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={16} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filteredCaptures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Camera size={32} className="mb-2 opacity-30" />
            <p className="text-sm">暂无采集内容</p>
            <p className="text-xs mt-1">使用浏览器扩展采集网页内容</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredCaptures.map(capture => (
              <div key={capture.id} className="group rounded-xl border border-border bg-card p-4 transition-colors hover:border-orange-500/30">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <TypeBadge type={capture.capture_type} />
                      <StatusBadge status={capture.status} />
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                        <Clock size={10} /> {formatTime(capture.created_at)}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium truncate">{capture.title || "无标题"}</h3>
                    <a href={capture.url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-blue-500 truncate mt-0.5">
                      <ExternalLink size={10} /> {capture.url}
                    </a>
                    {capture.content && (
                      <p className="mt-2 text-xs text-muted-foreground line-clamp-2">{capture.content}</p>
                    )}
                    {capture.description && capture.description !== capture.content && (
                      <p className="mt-1 text-[10px] text-muted-foreground/70 italic">{capture.description}</p>
                    )}
                    {capture.keywords && capture.keywords.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {capture.keywords.map((kw, i) => (
                          <span key={i} className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            <Hash size={8} /> {kw}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {capture.status !== "promoted" && (
                      <button onClick={() => handlePromote(capture.id)}
                        disabled={promoting === capture.id}
                        className="flex items-center gap-1 rounded-lg bg-blue-500/10 px-2 py-1.5 text-[10px] font-medium text-blue-500 hover:bg-blue-500/20 disabled:opacity-50"
                        title="提升到知识库">
                        {promoting === capture.id ? <Loader2 size={10} className="animate-spin" /> : <ArrowUpCircle size={10} />}
                        入库
                      </button>
                    )}
                    <button onClick={() => handleDelete(capture.id)}
                      className="flex items-center gap-1 rounded-lg bg-red-500/10 px-2 py-1.5 text-[10px] font-medium text-red-500 hover:bg-red-500/20"
                      title="删除">
                      <Trash2 size={10} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

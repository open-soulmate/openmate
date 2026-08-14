"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Droplets, Upload, Download, Trash2, RefreshCw,
  HardDrive, Database, Activity, FileText, Search,
  FolderOpen, Zap, Clock,
} from "lucide-react";

interface FileItem {
  file_id: string;
  name: string;
  size: number;
  mime_type: string;
  tags: string[];
  created_at: number;
  content_hash: string;
}

interface VeinStats {
  store: {
    total_files: number;
    total_size_bytes: number;
    unique_blobs: number;
    disk_usage_bytes: number;
    dedup_savings_bytes: number;
  };
  cache: {
    entries: number;
    current_size_bytes: number;
    max_size_bytes: number;
    usage_percent: number;
    hits: number;
    misses: number;
    hit_rate: number;
    default_ttl_seconds: number;
  };
  uploads: {
    active_sessions: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function VeinClient() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<VeinStats | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiBase = getApiBaseUrl();

  const fetchFiles = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("name", search);
      const res = await fetch(`${apiBase}/api/vein/files?${params}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Failed to fetch files", e);
    }
  }, [apiBase, search]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vein/stats`);
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to fetch stats", e);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchFiles();
    fetchStats();
  }, [fetchFiles, fetchStats]);

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const form = new FormData();
        form.append("file", file);
        form.append("tags", "");
        await fetch(`${apiBase}/api/vein/upload`, { method: "POST", body: form });
      }
      await fetchFiles();
      await fetchStats();
    } catch (e) {
      console.error("Upload failed", e);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = (fileId: string, name: string) => {
    const a = document.createElement("a");
    a.href = `${apiBase}/api/vein/files/${fileId}/download`;
    a.download = name;
    a.click();
  };

  const handleDelete = async (fileId: string) => {
    if (!confirm("确定删除此文件？")) return;
    try {
      await fetch(`${apiBase}/api/vein/files/${fileId}`, { method: "DELETE" });
      await fetchFiles();
      await fetchStats();
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Droplets size={20} className="text-red-500" />
          <h1 className="text-lg font-semibold">{t("vein.title") || "血管 · 文件管理"}</h1>
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
            {t("vein.subtitle") || "大文件 · 缓存 · 分片"}
          </span>
        </div>
        <button
          onClick={() => { fetchFiles(); fetchStats(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <RefreshCw size={14} />
          {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={FileText}
              label={t("vein.files") || "文件总数"}
              value={String(stats.store.total_files)}
              sub={`${formatBytes(stats.store.total_size_bytes)}`}
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <StatCard
              icon={Database}
              label={t("vein.dedupSaving") || "去重节省"}
              value={formatBytes(stats.store.dedup_savings_bytes)}
              sub={`${stats.store.unique_blobs} ${t("vein.uniqueBlobs") || "唯一 blob"}`}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
            <StatCard
              icon={Zap}
              label={t("vein.hitRate") || "缓存命中率"}
              value={`${stats.cache.hit_rate}%`}
              sub={`${stats.cache.entries} ${t("vein.entries") || "条目"} · ${formatBytes(stats.cache.current_size_bytes)}`}
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
            <StatCard
              icon={Activity}
              label={t("vein.chunkedUpload") || "上传会话"}
              value={String(stats.uploads.active_sessions)}
              sub={t("vein.activeSessions") || "活跃分片上传"}
              color="text-violet-500"
              bg="bg-violet-500/10"
            />
          </div>
        )}

        {/* Upload Zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={cn(
            "flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 cursor-pointer transition-colors",
            dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
            uploading && "opacity-50 pointer-events-none"
          )}
        >
          <Upload size={32} className={cn("text-muted-foreground", dragOver && "text-primary")} />
          <div className="text-center">
            <p className="text-sm font-medium">
              {uploading ? (t("common.uploading") || "上传中...") : (t("vein.uploadHint") || "拖拽文件到此处或点击上传")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {t("vein.uploadSupport") || "支持任意文件 · 自动去重 · 自动缓存"}
            </p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>

        {/* Search + File List */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("vein.search") || "搜索文件名..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && fetchFiles()}
                className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <span className="text-xs text-muted-foreground">{files.length} {t("vein.files") || "个文件"}</span>
          </div>

          {files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen size={40} className="mb-3 opacity-30" />
              <p className="text-sm">{t("vein.noFiles") || "暂无文件"}</p>
              <p className="text-xs mt-1">{t("vein.uploadToStart") || "上传文件开始使用"}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("common.name") || "文件名"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">{t("vein.size") || "大小"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-32">{t("vein.type") || "类型"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-36">{t("vein.createdAt") || "上传时间"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-20">{t("vein.tags") || "标签"}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-24">{t("common.actions") || "操作"}</th>
                  </tr>
                </thead>
                <tbody>
                  {files.map((f) => (
                    <tr key={f.file_id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <FileText size={14} className="text-muted-foreground shrink-0" />
                          <span className="truncate max-w-[200px]">{f.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">{formatBytes(f.size)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{f.mime_type.split("/")[1] || f.mime_type}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(f.created_at)}</td>
                      <td className="px-4 py-2.5">
                        {f.tags.filter(Boolean).map((tag) => (
                          <span key={tag} className="inline-block rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary mr-1">
                            {tag}
                          </span>
                        ))}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownload(f.file_id, f.name)}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t("vein.download") || "下载"}
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleDelete(f.file_id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                            title={t("vein.delete") || "删除"}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub: string;
  color: string;
  bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon size={14} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

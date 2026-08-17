"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Folder, HardDrive, Upload, FolderOpen, Search,
  Image, FileText, Code, Paperclip, RefreshCw,
  Download, Trash2, Database, Zap, BarChart3,
  Layers, Database as CacheIcon, ArrowDownToLine, ArrowUpFromLine,
  X, Copy, Hash, Clock, FileType, Tag, Eye,
  BookOpen,
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
    versioning?: {
      total_versions: number;
      total_versioned_files: number;
      avg_versions_per_file: number;
    };
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

interface CacheEntry {
  key: string;
  size_bytes: number;
  created_at: number;
  ttl_seconds: number;
  hits: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith("image/")) return Image;
  if (
    mimeType.startsWith("text/") ||
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation") ||
    mimeType.includes("msword") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint")
  )
    return FileText;
  if (
    mimeType.includes("javascript") ||
    mimeType.includes("json") ||
    mimeType.includes("xml") ||
    mimeType.includes("html") ||
    mimeType.includes("css") ||
    mimeType.includes("typescript") ||
    mimeType.includes("python") ||
    mimeType.includes("java") ||
    mimeType.includes("zip") ||
    mimeType.includes("tar") ||
    mimeType.includes("gzip")
  )
    return Code;
  return Paperclip;
}

function getFileTypeLabel(mimeType: string): string {
  const ext = mimeType.split("/")[1] || mimeType;
  const map: Record<string, string> = {
    pdf: "PDF",
    msword: "Word",
    "vnd.openxmlformats-officedocument.wordprocessingml.document": "Word",
    "vnd.ms-excel": "Excel",
    "vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel",
    "vnd.ms-powerpoint": "PPT",
    "vnd.openxmlformats-officedocument.presentationml.presentation": "PPT",
    jpeg: "JPEG",
    png: "PNG",
    gif: "GIF",
    svg: "SVG",
    webp: "WebP",
    mp4: "MP4",
    "x-matroska": "MKV",
    quicktime: "MOV",
    plain: "Text",
    html: "HTML",
    css: "CSS",
    javascript: "JS",
    json: "JSON",
    xml: "XML",
    zip: "ZIP",
    "x-tar": "TAR",
    "x-gzip": "GZ",
  };
  return map[ext] || ext.toUpperCase();
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string | number; sub: string; color: string; bg: string;
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

type TabId = "files" | "cache";

// ── Version History Panel ──────────────────────────────────────

interface VersionInfo {
  version_number: number;
  content_hash: string;
  size: number;
  change_summary: string;
  created_at: number;
}

function VersionHistoryPanel({ fileId, apiBase, onRollback }: {
  fileId: string;
  apiBase: string;
  onRollback: () => void;
}) {
  const [versions, setVersions] = useState<VersionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [rollingBack, setRollingBack] = useState<number | null>(null);

  const fetchVersions = useCallback(async () => {
    if (!apiBase || !fileId) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/versions?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setVersions(data.versions || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [apiBase, fileId]);

  useEffect(() => {
    if (expanded) fetchVersions();
  }, [expanded, fetchVersions]);

  const handleRollback = async (versionNumber: number) => {
    if (!confirm(t('vein.t38989', { versionNumber: versionNumber }))) return;
    setRollingBack(versionNumber);
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/rollback/${versionNumber}t('vein.t03287')${apiBase}/api/vein/files?${params}`);
      const data = await res.json();
      setFiles(data.files || []);
    } catch (e) {
      console.error("Failed to fetch files", e);
    } finally {
      setLoading(false);
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

  const fetchChunkedUploads = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vein/upload/chunked`);
      const data = await res.json();
      setChunkedUploads(data.sessions || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchFiles();
    fetchStats();
    fetchChunkedUploads();
  }, [fetchFiles, fetchStats, fetchChunkedUploads]);

  const handleSearch = () => {
    fetchFiles();
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const file = fileList[0];

    // Use chunked upload for files > 10MB
    const CHUNK_THRESHOLD = 10 * 1024 * 1024;
    if (file.size > CHUNK_THRESHOLD) {
      await handleChunkedUpload(file);
    } else {
      setUploadProgress(t('vein.t12347', { name: file.name, size: formatBytes(file.size) }));
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${apiBase}/api/vein/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        setUploadProgress(t('vein.t32757', { name: data.name, size: formatBytes(data.size) }));
        fetchFiles();
        fetchStats();
      } catch (e: any) {
        setUploadProgress(t('vein.t07464', { message: e.message }));
      } finally {
        setUploading(false);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    }
  };

  const handleChunkedUpload = async (file: File) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    setUploadProgress(t('vein.t90764', { name: file.name, size: formatBytes(file.size), totalChunks: totalChunks }));

    try {
      // Init session
      const initRes = await fetch(`${apiBase}/api/vein/upload/chunked/init`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          total_size: file.size,
          chunk_size: CHUNK_SIZE,
          mime_type: file.type || "application/octet-stream",
        }),
      });
      if (!initRes.ok) throw new Error(`Init failed: ${initRes.status}`);
      const session = await initRes.json();
      const uploadId = session.upload_id;

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        setUploadProgress(t('vein.t93644', { i1: i + 1, totalChunks: totalChunks, name: file.name }));

        const formData = new FormData();
        formData.append("file", chunk, `chunk_${i}`);

        const chunkRes = await fetch(
          `${apiBase}/api/vein/upload/chunked/${uploadId}/chunk/${i}`,
          { method: "POST", body: formData }
        );
        if (!chunkRes.ok) throw new Error(`Chunk ${i} failed: ${chunkRes.status}`);
      }

      // Complete
      setUploadProgress(t('vein.t02684'));
      const completeRes = await fetch(`${apiBase}/api/vein/upload/chunked/${uploadId}/complete`, {
        method: "POST",
      });
      if (!completeRes.ok) throw new Error(`Complete failed: ${completeRes.status}`);
      const result = await completeRes.json();

      setUploadProgress(t('vein.t96070', { name: result.name, size: formatBytes(result.size) }));
      fetchFiles();
      fetchStats();
      fetchChunkedUploads();
    } catch (e: any) {
      setUploadProgress(t('vein.t92789', { message: e.message }));
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(""), 5000);
    }
  };

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/download`);
      if (!res.ok) throw new Error(`Download failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("Download failed", e);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
      setSelectedFile(null);
      fetchFiles();
      fetchStats();
    } catch (e: any) {
      console.error("Delete failed", e);
    }
  };

  const handlePromote = async (fileId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "default" }),
      });
      if (!res.ok) throw new Error(`Promote failed: ${res.status}`);
      const data = await res.json();
      alert(t('vein.t72439', { filename: data.filename }));
    } catch (e: any) {
      console.error("Promote failed", e);
      alert(t('vein.t03163', { message: e.message }));
    }
  };

  const [autoProcessing, setAutoProcessing] = useState(false);
  const [autoProcessResult, setAutoProcessResult] = useState<any>(null);
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchResult, setBatchResult] = useState<any>(null);

  const handleAutoProcess = async (fileId: string) => {
    setAutoProcessing(true);
    setAutoProcessResult(null);
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/auto-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "default", auto_promote: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || `Auto-process failed: ${res.status}`);
      }
      const data = await res.json();
      setAutoProcessResult(data);
      if (data.promoted_to_knowledge) fetchFiles();
    } catch (e: any) {
      console.error("Auto-process failed", e);
      setAutoProcessResult({ status: "error", error: e.message });
    } finally {
      setAutoProcessing(false);
    }
  };

  const handleBatchAutoProcess = async () => {
    if (!confirm(t('vein.t34722'))) return;
    setBatchProcessing(true);
    setBatchResult(null);
    try {
      const res = await fetch(`${apiBase}/api/vein/auto-process/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "default", auto_promote: true, limit: 100 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
        throw new Error(err.detail || `Batch process failed: ${res.status}`);
      }
      const data = await res.json();
      setBatchResult(data);
      fetchFiles();
      fetchStats();
    } catch (e: any) {
      setBatchResult({ status: "error", error: e.message });
    } finally {
      setBatchProcessing(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.length) handleUpload(e.dataTransfer.files);
  };

  const handleCacheClear = async () => {
    if (!confirm(t('vein.t56284'))) return;
    try {
      await fetch(`${apiBase}/api/vein/cache/clear`, { method: "POST" });
      fetchStats();
    } catch {}
  };

  const handleCacheCleanup = async () => {
    try {
      await fetch(`${apiBase}/api/vein/cache/cleanup`, { method: "POST" });
      fetchStats();
    } catch {}
  };

  const handleCancelUpload = async (uploadId: string) => {
    try {
      await fetch(`${apiBase}/api/vein/upload/chunked/${uploadId}`, { method: "DELETE" });
      fetchChunkedUploads();
    } catch {}
  };

  const loadPreview = useCallback(async (file: FileItem) => {
    setLoadingPreview(true);
    setPreviewContent(null);
    setPreviewType("none");

    try {
      if (file.mime_type.startsWith("image/")) {
        // Image preview — use download URL directly
        setPreviewContent(`${apiBase}/api/vein/files/${file.file_id}/download`);
        setPreviewType("image");
      } else if (
        file.mime_type.startsWith("text/") ||
        file.mime_type.includes("json") ||
        file.mime_type.includes("xml") ||
        file.mime_type.includes("javascript") ||
        file.mime_type.includes("html") ||
        file.mime_type.includes("css") ||
        file.mime_type.includes("yaml") ||
        file.mime_type.includes("markdown")
      ) {
        // Text preview — fetch content
        const res = await fetch(`${apiBase}/api/vein/files/${file.file_id}/download`);
        if (res.ok) {
          const text = await res.text();
          setPreviewContent(text.length > 5000 ? text.slice(0, 5000) + "\n\n... (truncated)" : text);
          setPreviewType("text");
        }
      } else {
        setPreviewType("none");
      }
    } catch {
      setPreviewType("none");
    } finally {
      setLoadingPreview(false);
    }
  }, [apiBase]);

  const handleSelectFile = (file: FileItem) => {
    if (selectedFile?.file_id === file.file_id) {
      setSelectedFile(null);
      setPreviewContent(null);
      setPreviewType("none");
    } else {
      setSelectedFile(file);
      loadPreview(file);
    }
  };

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const filteredFiles = files;

  const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
    { id: "files", label: t("vein.filesTab")), icon: Folder },
    { id: "cache", label: t("vein.cacheTab")), icon: CacheIcon },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Folder size={20} className="text-red-500" />
          <h1 className="text-lg font-semibold">{t("vein.title"))}</h1>
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
            Vein
          </span>
        </div>
        <div className="flex gap-2">
          {tab === "files" && (
            <>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload size={14} />
                {uploading ? (t("vein.uploading"))) : (t("vein.upload")))}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            </>
          )}
          <button
            onClick={() => { fetchFiles(); fetchStats(); fetchChunkedUploads(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} /> {t("common.refresh"))}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-6">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors",
              tab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Upload progress */}
        {uploadProgress && (
          <div className={cn(
            "rounded-lg px-4 py-2.5 text-sm",
            uploadProgress.startsWith(t('vein.uploadSuccess')) || uploadProgress.startsWith(t('vein.t68750'))
              ? "bg-emerald-500/10 text-emerald-500"
              : uploadProgress.startsWith(t('vein.uploadFailed')) || uploadProgress.startsWith(t('vein.t34319'))
                ? "bg-red-500/10 text-red-500"
                : "bg-blue-500/10 text-blue-500"
          )}>
            {uploadProgress}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Folder}
              label={t("vein.totalFiles"))}
              value={stats.store.total_files}
              sub={t('vein.t55014', { uniqueblobs: stats.store.unique_blobs })}
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <StatCard
              icon={HardDrive}
              label={t("vein.totalSize"))}
              value={formatBytes(stats.store.total_size_bytes)}
              sub={t('vein.t98791', { diskusagebytes: formatBytes(stats.store.disk_usage_bytes) })}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
            <StatCard
              icon={Database}
              label=t('vein.dedupSaving')
              value={formatBytes(stats.store.dedup_savings_bytes)}
              sub={t('vein.t97948', { uniqueblobs: stats.store.total_files - stats.store.unique_blobs })}
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
            {stats.store.versioning && (
              <StatCard
                icon={Layers}
                label=t('vein.versionTracking')
                value={stats.store.versioning.total_versions}
                sub={t('vein.t58984', { totalversionedfiles: stats.store.versioning.total_versioned_files })}
                color="text-indigo-500"
                bg="bg-indigo-500/10"
              />
            )}
            <StatCard
              icon={Zap}
              label=t('vein.cacheHitRate')
              value={`${stats.cache.hit_rate.toFixed(1)}%`}
              sub={t('vein.t85524', { hits: stats.cache.hits, misses: stats.cache.misses })}
              color="text-purple-500"
              bg="bg-purple-500/10"
            />
          </div>
        )}

        {/* Tab Content */}
        {tab === "files" && (
          <>
            {/* Drag & drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-primary/50"
              )}
            >
              <Upload size={32} className="mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm font-medium">
                {dragActive ? (t("vein.dropToUpload"))) : (t("vein.dragOrClick")))}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("vein.supportAll"))}
              </p>
            </div>

            {/* Chunked Upload Sessions */}
            {chunkedUploads.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Layers size={14} className="text-blue-500" /> 
                  {t('vein.t53343')}
                <h3>
                <div className="space-y-2">
                  {chunkedUploads.map((s: any) => (
                    <div key={s.upload_id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${s.progress || 0}%t('vein.t55939')Updated to ${file.name}`);
                            try {
                              const res = await fetch(`${apiBase}/api/vein/files/${selectedFile.file_id}/contentt('vein.t72231')${formatBytes(stats.cache.current_size_bytes)} / ${formatBytes(stats.cache.max_size_bytes)}`}
                color="text-purple-500"
                bg="bg-purple-500/10"
              />
              <StatCard
                icon={BarChart3}
                label=t('hippo.usage')
                value={`${stats.cache.usage_percent.toFixed(1)}%`}
                sub={`TTL: ${stats.cache.default_ttl_seconds}s`}
                color="text-blue-500"
                bg="bg-blue-500/10"
              />
              <StatCard
                icon={ArrowDownToLine}
                label=t('reflex.cacheHit')
                value={stats.cache.hits}
                sub={t('vein.t02777', { toFixed1: stats.cache.hit_rate.toFixed(1) })}
                color="text-emerald-500"
                bg="bg-emerald-500/10"
              />
              <StatCard
                icon={ArrowUpFromLine}
                label=t('vein.cacheMiss')
                value={stats.cache.misses}
                sub={t('vein.t11655', { misses: stats.cache.hits + stats.cache.misses })}
                color="text-amber-500"
                bg="bg-amber-500/10"
              />
            </div>

            {/* Cache Usage Bar */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">{t('vein.cacheSpaceUsage')}<h3>
                <span className="text-xs text-muted-foreground">
                  {formatBytes(stats.cache.current_size_bytes)} / {formatBytes(stats.cache.max_size_bytes)}
                </span>
              </div>
              <div className="h-3 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    stats.cache.usage_percent > 80 ? "bg-red-500" :
                    stats.cache.usage_percent > 50 ? "bg-amber-500" : "bg-emerald-500"
                  )}
                  style={{ width: `${Math.min(stats.cache.usage_percent, 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {stats.cache.entries > 0
                  ? t('vein.t09317', { entries: formatBytes(stats.cache.current_size_bytes / stats.cache.entries) })
                  : t('vein.cacheEmpty')
                }
              </p>
            </div>

            {/* Cache Actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-medium mb-3">{t('vein.cacheOperations')}<h3>
              <div className="flex gap-3">
                <button
                  onClick={handleCacheCleanup}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <RefreshCw size={14} /> 
                  {t('vein.t78281')}
                <button>
                <button
                  onClick={handleCacheClear}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} /> 
                  {t('vein.t65717')}
                <button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('vein.t93396')}
              <p>
            </div>

            {/* Dedup Info */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Database size={14} className="text-amber-500" /> 
                {t('vein.t12397')}
              <h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold">{stats.store.total_files}</p>
                  <p className="text-xs text-muted-foreground">{t('vein.logicalFiles')}<p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.store.unique_blobs}</p>
                  <p className="text-xs text-muted-foreground">{t('vein.uniqueBlobs')}<p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{formatBytes(stats.store.dedup_savings_bytes)}</p>
                  <p className="text-xs text-muted-foreground">{t('vein.dedupSavingSpace')}<p>
                </div>
              </div>
              {stats.store.total_files > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{t('vein.dedupEfficiency')}<span>
                    <span className="text-xs font-medium">
                      {((1 - stats.store.unique_blobs / stats.store.total_files) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full"
                      style={{ width: `${Math.min((1 - stats.store.unique_blobs / stats.store.total_files) * 100, 100)}%` }}
                    />
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

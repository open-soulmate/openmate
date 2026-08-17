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
    if (!confirm(`{t("vein.ok")} ${versionNumber}？`)) return;
    setRollingBack(versionNumber);
    try {
      const res = await fetch(`${apiBase}/api/vein/files/${fileId}/rollback/${versionNumber}`, { method: "POST" });
      if (res.ok) {
        fetchVersions();
        onRollback();
      }
    } catch {} finally {
      setRollingBack(null);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Layers size={12} /> {t("vein.versionHistory")}
          {versions.length > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary font-medium">
              v{versions[0]?.version_number || 0}
            </span>
          )}
        </div>
        <span className="text-xs text-primary">
          {expanded ? t("vein.collapse") : t("vein.expand")}
        </span>
      </button>

      {expanded && (
        <div className="rounded-lg border border-border bg-muted/20 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <RefreshCw size={14} className="animate-spin mr-2" />
              <span className="text-xs">{t("vein.version")}...</span>
            </div>
          ) : versions.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              {t('vein.t1de45')}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              {versions.map((v, idx) => (
                <div
                  key={v.version_number}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 border-b border-border last:border-0",
                    idx === 0 && "bg-primary/5"
                  )}
                >
                  {/* Version badge */}
                  <div className={cn(
                    "shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold",
                    idx === 0 ? "bg-primary text-white" : "bg-muted text-muted-foreground"
                  )}>
                    v{v.version_number}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">
                        {v.change_summary || t("vein.update")}
                      </span>
                      {idx === 0 && (
                        <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-500 font-medium">
                          {t('vein.t48ac4')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(v.created_at)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatBytes(v.size)}
                      </span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {v.content_hash.slice(0, 8)}...
                      </span>
                    </div>
                  </div>

                  {/* Rollback button */}
                  {idx > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleRollback(v.version_number); }}
                      disabled={rollingBack === v.version_number}
                      className="shrink-0 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
                      title={`{t("vein.text1")} ${v.version_number}`}
                    >
                      {rollingBack === v.version_number ? (
                        <RefreshCw size={10} className="animate-spin" />
                      ) : (
                        t("vein.text2")
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function VeinClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>("files");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<VeinStats | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<"text" | "image" | "none">("none");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiBase = getApiBaseUrl();

  // Chunked upload state
  const [chunkedUploads, setChunkedUploads] = useState<any[]>([]);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("name", search);
      const res = await fetch(`${apiBase}/api/vein/files?${params}`);
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
      setUploadProgress(`{t("vein.text3")}: ${file.name} (${formatBytes(file.size)})`);
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`${apiBase}/api/vein/upload`, { method: "POST", body: form });
        if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
        const data = await res.json();
        setUploadProgress(`{t("vein.success")}: ${data.name} (${formatBytes(data.size)})`);
        fetchFiles();
        fetchStats();
      } catch (e: any) {
        setUploadProgress(`{t("vein.failed")}: ${e.message}`);
      } finally {
        setUploading(false);
        setTimeout(() => setUploadProgress(""), 3000);
      }
    }
  };

  const handleChunkedUpload = async (file: File) => {
    const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    setUploadProgress(`{t("vein.text4")}: ${file.name} (${formatBytes(file.size)}, ${totalChunks} {t("vein.text5")})`);

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

        setUploadProgress(`{t("vein.text6")} ${i + 1}/${totalChunks}: ${file.name}`);

        const formData = new FormData();
        formData.append("file", chunk, `chunk_${i}`);

        const chunkRes = await fetch(
          `${apiBase}/api/vein/upload/chunked/${uploadId}/chunk/${i}`,
          { method: "POST", body: formData }
        );
        if (!chunkRes.ok) throw new Error(`Chunk ${i} failed: ${chunkRes.status}`);
      }

      // Complete
      {t('vein.t7c2cb')}
      const completeRes = await fetch(`${apiBase}/api/vein/upload/chunked/${uploadId}/complete`, {
        method: "POST",
      });
      if (!completeRes.ok) throw new Error(`Complete failed: ${completeRes.status}`);
      const result = await completeRes.json();

      setUploadProgress(`{t("vein.text7")}: ${result.name} (${formatBytes(result.size)})`);
      fetchFiles();
      fetchStats();
      fetchChunkedUploads();
    } catch (e: any) {
      setUploadProgress(`{t("vein.text8")}: ${e.message}`);
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
      alert(`{t("vein.promoteToKnowledge")}: ${data.filename}`);
    } catch (e: any) {
      console.error("Promote failed", e);
      alert(`{t("vein.text9")}: ${e.message}`);
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
    if (!confirm(t("vein.time"))) return;
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
    if (!confirm(t("vein.text10"))) return;
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
    { id: "files", label: t("vein.filesTab") || t("vein.text11"), icon: Folder },
    { id: "cache", label: t("vein.cacheTab") || t("vein.text12"), icon: CacheIcon },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Folder size={20} className="text-red-500" />
          <h1 className="text-lg font-semibold">{t("vein.title") || t("vein.text11")}</h1>
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
                {uploading ? (t("vein.uploading") || t("vein.text13")) : (t("vein.upload") || t("vein.text14"))}
              </button>
              <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
            </>
          )}
          <button
            onClick={() => { fetchFiles(); fetchStats(); fetchChunkedUploads(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} /> {t("common.refresh") || t("vein.refresh")}
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
            uploadProgress.startsWith(t("vein.success")) || uploadProgress.startsWith(t("vein.text7"))
              ? "bg-emerald-500/10 text-emerald-500"
              : uploadProgress.startsWith(t("vein.failed")) || uploadProgress.startsWith(t("vein.text8"))
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
              label={t("vein.totalFiles") || t("vein.text15")}
              value={stats.store.total_files}
              sub={`${stats.store.unique_blobs} {t("vein.text16")}`}
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <StatCard
              icon={HardDrive}
              label={t("vein.totalSize") || t("vein.text17")}
              value={formatBytes(stats.store.total_size_bytes)}
              sub={`{t("vein.text18")}: ${formatBytes(stats.store.disk_usage_bytes)}`}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
            <StatCard
              icon={Database}
              label={t("vein.text19")}
              value={formatBytes(stats.store.dedup_savings_bytes)}
              sub={`${stats.store.total_files - stats.store.unique_blobs} {t("vein.text20")}`}
              color="text-amber-500"
              bg="bg-amber-500/10"
            />
            {stats.store.versioning && (
              <StatCard
                icon={Layers}
                label={t("vein.text21")}
                value={stats.store.versioning.total_versions}
                sub={`${stats.store.versioning.total_versioned_files} {t("vein.text22")}`}
                color="text-indigo-500"
                bg="bg-indigo-500/10"
              />
            )}
            <StatCard
              icon={Zap}
              label={t("vein.text23")}
              value={`${stats.cache.hit_rate.toFixed(1)}%`}
              sub={`${stats.cache.hits}{t("vein.text24")} / ${stats.cache.misses}{t("vein.text25")}`}
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
                {dragActive ? (t("vein.dropToUpload") || t("vein.text26")) : (t("vein.dragOrClick") || t("vein.select"))}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("vein.supportAll") || t("vein.auto")}
              </p>
            </div>

            {/* Chunked Upload Sessions */}
            {chunkedUploads.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                  <Layers size={14} className="text-blue-500" />
                  {t("vein.text27")} ({chunkedUploads.length})
                </h3>
                <div className="space-y-2">
                  {chunkedUploads.map((s: any) => (
                    <div key={s.upload_id} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{s.filename}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-blue-500 rounded-full transition-all"
                              style={{ width: `${s.progress || 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {s.progress || 0}% ({s.received_chunks?.length || 0}/{s.total_chunks || 0})
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleCancelUpload(s.upload_id)}
                        className="rounded-md border border-red-500/30 p-1.5 text-red-500 hover:bg-red-500/10"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Search + File List */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder={t("vein.searchPlaceholder") || t("vein.search")}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                    className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <button
                  onClick={handleSearch}
                  className="rounded-lg bg-primary px-4 py-2 text-sm text-white hover:bg-primary/90 transition-colors"
                >
                  {t("common.search") || t("vein.text28")}
                </button>
                <button
                  onClick={handleBatchAutoProcess}
                  disabled={batchProcessing}
                  className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-600 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                >
                  {batchProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                  {batchProcessing ? t("vein.text29") : t("vein.text30")}
                </button>
                <span className="text-xs text-muted-foreground">
                  {loading ? (t("common.loading") || t("vein.loading")) : `${filteredFiles.length} ${(t("vein.files") || t("vein.text31"))}`}
                </span>
              </div>

              {/* Batch Auto-Process Result */}
              {batchResult && (
                <div className={cn(
                  "rounded-xl border p-4 text-sm",
                  batchResult.status === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"
                )}>
                  {batchResult.status === "ok" ? (
                    <div className="flex items-center gap-4">
                      <Zap size={16} className="text-amber-500 shrink-0" />
                      <div className="flex-1">
                        <span className="font-medium">{t("vein.done")}</span>
                        <span className="ml-3 text-xs text-muted-foreground">
                          {t("vein.text32")} {batchResult.total_files} {t("vein.text33")} {batchResult.eligible_files} {t("vein.text34")} ·
                          {t("vein.text35")} {batchResult.processed} {t("vein.text36")} {batchResult.promoted} {t("vein.text34")}
                        </span>
                      </div>
                      <button onClick={() => setBatchResult(null)} className="text-muted-foreground hover:text-foreground">
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-500">
                      <span>❌ {batchResult.error}</span>
                      <button onClick={() => setBatchResult(null)} className="ml-auto"><X size={14} /></button>
                    </div>
                  )}
                </div>
              )}

              {filteredFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <FolderOpen size={40} className="opacity-30 mb-3" />
                  <p className="text-sm">{t("vein.noFiles") || t("vein.empty")}</p>
                  <p className="text-xs mt-1">
                    {search ? (t("vein.noMatch") || t("vein.text37")) : (t("vein.startUpload") || t("vein.start"))}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                          {t("vein.fileName") || t("vein.text38")}
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">
                          {t("vein.size") || t("vein.text39")}
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">
                          {t("vein.type") || t("vein.text40")}
                        </th>
                        <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-40">
                          {t("vein.uploadTime") || t("vein.text41")}
                        </th>
                        <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-28">
                          {t("vein.actions") || t("vein.action")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredFiles.map((f) => {
                        const FileIcon = getFileIcon(f.mime_type);
                        return (
                          <tr
                            key={f.file_id}
                            className={cn(
                              "border-b border-border last:border-0 hover:bg-muted/30 transition-colors cursor-pointer",
                              selectedFile?.file_id === f.file_id && "bg-primary/5 border-l-2 border-l-primary"
                            )}
                            onClick={() => handleSelectFile(f)}
                          >
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-2">
                                <FileIcon size={14} className="shrink-0 text-muted-foreground" />
                                <span className="truncate max-w-[280px]" title={f.name}>
                                  {f.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {formatBytes(f.size)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {getFileTypeLabel(f.mime_type)}
                            </td>
                            <td className="px-4 py-2.5 text-xs text-muted-foreground">
                              {formatTime(f.created_at)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <div className="flex gap-1 justify-end">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDownload(f.file_id, f.name); }}
                                  title={t("vein.download") || t("vein.text42")}
                                  className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  <Download size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDelete(f.file_id); }}
                                  title={t("vein.delete") || t("vein.text43")}
                                  className="rounded-md border border-red-500/30 p-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 size={12} />
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); handlePromote(f.file_id); }}
                                  title={t("vein.text44")}
                                  className="rounded-md border border-emerald-500/30 p-1.5 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                                >
                                  <BookOpen size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* File Detail Panel */}
              {selectedFile && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2 min-w-0">
                      {(() => { const Icon = getFileIcon(selectedFile.mime_type); return <Icon size={16} className="shrink-0 text-primary" />; })()}
                      <h3 className="text-sm font-medium truncate">{selectedFile.name}</h3>
                      <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {getFileTypeLabel(selectedFile.mime_type)}
                      </span>
                    </div>
                    <button
                      onClick={() => { setSelectedFile(null); setPreviewContent(null); }}
                      className="rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Preview Area */}
                    {loadingPreview ? (
                      <div className="flex items-center justify-center py-12 text-muted-foreground">
                        <RefreshCw size={16} className="animate-spin mr-2" />
                        <span className="text-sm">{t("vein.text45")}...</span>
                      </div>
                    ) : previewType === "image" && previewContent ? (
                      <div className="rounded-lg border border-border bg-muted/20 p-3 flex items-center justify-center">
                        <img
                          src={previewContent}
                          alt={selectedFile.name}
                          className="max-h-64 max-w-full object-contain rounded"
                        />
                      </div>
                    ) : previewType === "text" && previewContent ? (
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <pre className="text-xs font-mono whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-foreground/80">
                          {previewContent}
                        </pre>
                      </div>
                    ) : null}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <HardDrive size={12} /> {t("vein.text39")}
                        </div>
                        <p className="text-sm font-medium">{formatBytes(selectedFile.size)}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <FileType size={12} /> MIME{t("vein.text40")}
                        </div>
                        <p className="text-sm font-medium">{selectedFile.mime_type}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock size={12} /> {t("vein.text41")}
                        </div>
                        <p className="text-sm font-medium">{formatTime(selectedFile.created_at)}</p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Tag size={12} /> {t("vein.tags")}
                        </div>
                        <p className="text-sm font-medium">
                          {selectedFile.tags.length > 0 ? selectedFile.tags.join(", ") : "—"}
                        </p>
                      </div>
                    </div>

                    {/* Hash with copy */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Hash size={12} /> {t("vein.content")})
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-foreground/70 truncate flex-1">
                          {selectedFile.content_hash}
                        </code>
                        <button
                          onClick={() => copyToClipboard(selectedFile.content_hash, "hash")}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                          title={t("vein.copy")}
                        >
                          {copiedField === "hash" ? (
                            <span className="text-xs text-emerald-500">✓</span>
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* File ID with copy */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Database size={12} /> {t("vein.fileId")}
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-foreground/70">{selectedFile.file_id}</code>
                        <button
                          onClick={() => copyToClipboard(selectedFile.file_id, "id")}
                          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted transition-colors"
                          title={t("vein.text46")}
                        >
                          {copiedField === "id" ? (
                            <span className="text-xs text-emerald-500">✓</span>
                          ) : (
                            <Copy size={12} />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Version History */}
                    <VersionHistoryPanel
                      fileId={selectedFile.file_id}
                      apiBase={getApiBaseUrl()}
                      onRollback={() => { fetchFiles(); fetchStats(); }}
                    />

                    {/* Actions */}
                    <div className="flex gap-2 pt-2 border-t border-border">
                      <button
                        onClick={() => handleDownload(selectedFile.file_id, selectedFile.name)}
                        className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-white hover:bg-primary/90 transition-colors"
                      >
                        <Download size={14} /> {t("vein.downloadFile")}
                      </button>
                      <label className="flex items-center justify-center gap-1.5 rounded-lg border border-blue-500/30 px-3 py-2 text-sm text-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer">
                        <Upload size={14} /> {t("vein.updateVersion")}
                        <input
                          type="file"
                          className="hidden"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const form = new FormData();
                            form.append("file", file);
                            form.append("change_summary", `Updated to ${file.name}`);
                            try {
                              const res = await fetch(`${apiBase}/api/vein/files/${selectedFile.file_id}/content`, { method: "PUT", body: form });
                              if (res.ok) {
                                fetchFiles();
                                fetchStats();
                                setSelectedFile(null);
                              }
                            } catch {}
                            e.target.value = "";
                          }}
                        />
                      </label>
                      <button
                        onClick={() => { if (confirm(`{t("vein.text47")} ${selectedFile.name}？`)) handleDelete(selectedFile.file_id); }}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-red-500/30 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} /> {t("vein.text43")}
                      </button>
                      <button
                        onClick={() => { if (confirm(`{t("vein.text48")} ${selectedFile.name} {t("vein.text44")}？`)) handlePromote(selectedFile.file_id); }}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-emerald-500/30 px-3 py-2 text-sm text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                      >
                        <BookOpen size={14} /> {t("vein.text44")}
                      </button>
                      <button
                        onClick={() => handleAutoProcess(selectedFile.file_id)}
                        disabled={autoProcessing}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/30 px-3 py-2 text-sm text-amber-500 hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                      >
                        {autoProcessing ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                        {autoProcessing ? t("vein.text49") : t("vein.text50")}
                      </button>
                    </div>
                    {/* Auto-Process Result */}
                    {autoProcessResult && (
                      <div className={cn(
                        "mt-3 rounded-lg border p-3 text-xs",
                        autoProcessResult.status === "ok" ? "border-emerald-500/30 bg-emerald-500/5" :
                        autoProcessResult.status === "no_text_extracted" ? "border-amber-500/30 bg-amber-500/5" :
                        "border-red-500/30 bg-red-500/5"
                      )}>
                        {autoProcessResult.status === "ok" ? (
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 font-medium text-emerald-600">
                              <Zap size={12} /> {t("vein.smartRecognitionDone")}
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                              <span>{t("vein.text51")}: <b className="text-foreground">{autoProcessResult.processing_type}</b></span>
                              <span>{t("vein.text52")}: <b className="text-foreground">{autoProcessResult.engine}</b></span>
                              <span>{t("vein.text53")}: <b className="text-foreground">{autoProcessResult.text_length} {t("vein.text54")}</b></span>
                              <span>{t("vein.text57")}: <b className={autoProcessResult.promoted_to_knowledge ? "text-emerald-500" : "text-muted-foreground"}>{autoProcessResult.promoted_to_knowledge ? t("vein.text55") : t("vein.text56")}</b></span>
                            </div>
                            {autoProcessResult.text_preview && (
                              <div className="mt-2 rounded bg-muted/50 p-2 max-h-24 overflow-y-auto">
                                <p className="text-[11px] text-muted-foreground whitespace-pre-wrap">{autoProcessResult.text_preview}</p>
                              </div>
                            )}
                          </div>
                        ) : autoProcessResult.status === "no_text_extracted" ? (
                          <span className="text-amber-600">⚠️ {t("vein.text58")}</span>
                        ) : (
                          <span className="text-red-500">❌ {autoProcessResult.error || t("vein.text59")}</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === "cache" && stats && (
          <div className="space-y-6">
            {/* Cache Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard
                icon={CacheIcon}
                label={t("vein.text60")}
                value={stats.cache.entries}
                sub={`${formatBytes(stats.cache.current_size_bytes)} / ${formatBytes(stats.cache.max_size_bytes)}`}
                color="text-purple-500"
                bg="bg-purple-500/10"
              />
              <StatCard
                icon={BarChart3}
                label={t("vein.text61")}
                value={`${stats.cache.usage_percent.toFixed(1)}%`}
                sub={`TTL: ${stats.cache.default_ttl_seconds}s`}
                color="text-blue-500"
                bg="bg-blue-500/10"
              />
              <StatCard
                icon={ArrowDownToLine}
                label={t("vein.text62")}
                value={stats.cache.hits}
                sub={`{t("vein.text63")}: ${stats.cache.hit_rate.toFixed(1)}%`}
                color="text-emerald-500"
                bg="bg-emerald-500/10"
              />
              <StatCard
                icon={ArrowUpFromLine}
                label={t("vein.text64")}
                value={stats.cache.misses}
                sub={`{t("vein.total")}: ${stats.cache.hits + stats.cache.misses}`}
                color="text-amber-500"
                bg="bg-amber-500/10"
              />
            </div>

            {/* Cache Usage Bar */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium">{t("vein.text65")}</h3>
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
                  ? `{t("vein.text66")}: ${formatBytes(stats.cache.current_size_bytes / stats.cache.entries)}`
                  : t("vein.text67")
                }
              </p>
            </div>

            {/* Cache Actions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-medium mb-3">{t("vein.text68")}</h3>
              <div className="flex gap-3">
                <button
                  onClick={handleCacheCleanup}
                  className="flex items-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted transition-colors"
                >
                  <RefreshCw size={14} />
                  {t('vein.t9b493')}
                </button>
                <button
                  onClick={handleCacheClear}
                  className="flex items-center gap-1.5 rounded-lg border border-red-500/30 px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 size={14} />
                  {t('vein.t147c8')}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t('vein.ta5f01')}
              </p>
            </div>

            {/* Dedup Info */}
            <div className="rounded-xl border border-border bg-card p-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Database size={14} className="text-amber-500" />
                {t('vein.t24201')}
              </h3>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-2xl font-bold">{stats.store.total_files}</p>
                  <p className="text-xs text-muted-foreground">{t("vein.text69")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.store.unique_blobs}</p>
                  <p className="text-xs text-muted-foreground">{t("vein.text70")}</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-500">{formatBytes(stats.store.dedup_savings_bytes)}</p>
                  <p className="text-xs text-muted-foreground">{t("vein.text71")}</p>
                </div>
              </div>
              {stats.store.total_files > 0 && (
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{t("vein.text72")}</span>
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

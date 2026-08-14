"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Folder, HardDrive, Upload, FolderOpen, Search,
  Image, FileText, Code, Paperclip, RefreshCw,
  Download, Trash2,
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
  };
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
    "msword": "Word",
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

export function VeinClient() {
  const { t } = useTranslation();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [stats, setStats] = useState<VeinStats | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const apiBase = getApiBaseUrl();

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

  useEffect(() => {
    fetchFiles();
    fetchStats();
  }, [fetchFiles, fetchStats]);

  const handleSearch = () => {
    fetchFiles();
  };

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    const file = fileList[0];
    setUploadProgress(`上传中: ${file.name} (${formatBytes(file.size)})`);

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${apiBase}/api/vein/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
      const data = await res.json();
      setUploadProgress(`上传成功: ${data.name} (${formatBytes(data.size)})`);
      fetchFiles();
      fetchStats();
    } catch (e: any) {
      setUploadProgress(`上传失败: ${e.message}`);
    } finally {
      setUploading(false);
      setTimeout(() => setUploadProgress(""), 3000);
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

  const filteredFiles = files;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Folder size={20} className="text-red-500" />
          <h1 className="text-lg font-semibold">{t("vein.title") || "文件管理"}</h1>
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-500">
            Vein
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-1.5 text-sm text-white hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Upload size={14} />
            {uploading ? (t("vein.uploading") || "上传中...") : (t("vein.upload") || "上传文件")}
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => handleUpload(e.target.files)} />
          <button
            onClick={() => { fetchFiles(); fetchStats(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
          >
            <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Upload progress */}
        {uploadProgress && (
          <div className={cn(
            "rounded-lg px-4 py-2.5 text-sm",
            uploadProgress.startsWith("上传成功")
              ? "bg-emerald-500/10 text-emerald-500"
              : uploadProgress.startsWith("上传失败")
                ? "bg-red-500/10 text-red-500"
                : "bg-blue-500/10 text-blue-500"
          )}>
            {uploadProgress}
          </div>
        )}

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-4">
            <StatCard
              icon={Folder}
              label={t("vein.totalFiles") || "文件总数"}
              value={stats.store.total_files}
              sub={formatBytes(stats.store.total_size_bytes)}
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <StatCard
              icon={HardDrive}
              label={t("vein.totalSize") || "总存储大小"}
              value={formatBytes(stats.store.total_size_bytes)}
              sub={`${stats.store.total_files} 个文件`}
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
          </div>
        )}

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
            {dragActive ? (t("vein.dropToUpload") || "释放文件以上传") : (t("vein.dragOrClick") || "拖拽文件到此处，或点击选择文件")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("vein.supportAll") || "支持任意文件类型，自动去重存储"}
          </p>
        </div>

        {/* Search + File List */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("vein.searchPlaceholder") || "搜索文件名..."}
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
              {t("common.search") || "搜索"}
            </button>
            <span className="text-xs text-muted-foreground">
              {loading ? (t("common.loading") || "加载中...") : `${filteredFiles.length} ${(t("vein.files") || "个文件")}`}
            </span>
          </div>

          {filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <FolderOpen size={40} className="opacity-30 mb-3" />
              <p className="text-sm">{t("vein.noFiles") || "暂无文件"}</p>
              <p className="text-xs mt-1">
                {search ? (t("vein.noMatch") || "未找到匹配的文件") : (t("vein.startUpload") || "上传文件开始使用")}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">
                      {t("vein.fileName") || "文件名"}
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">
                      {t("vein.size") || "大小"}
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">
                      {t("vein.type") || "类型"}
                    </th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-40">
                      {t("vein.uploadTime") || "上传时间"}
                    </th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-28">
                      {t("vein.actions") || "操作"}
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
                          selectedFile?.file_id === f.file_id && "bg-muted/30"
                        )}
                        onClick={() => setSelectedFile(selectedFile?.file_id === f.file_id ? null : f)}
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
                              title={t("vein.download") || "下载"}
                              className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-muted transition-colors"
                            >
                              <Download size={12} />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(f.file_id); }}
                              title={t("vein.delete") || "删除"}
                              className="rounded-md border border-red-500/30 p-1.5 text-red-500 hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 size={12} />
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
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getApiBaseUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import {
  FolderOpen,
  FileText,
  ChevronRight,
  RefreshCw,
  ArrowLeft,
  Loader2,
  AlertCircle,
  FolderPlus,
  HardDrive,
  Clock,
} from "lucide-react";

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  modified: string | number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatTime(modified: string | number): string {
  const d = typeof modified === "number" ? new Date(modified * 1000) : new Date(modified);
  if (isNaN(d.getTime())) return "-";
  const diff = Date.now() - d.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return d.toLocaleDateString("zh-CN");
}

export function WorkspaceClient() {
  const { t } = useTranslation();
  const [currentPath, setCurrentPath] = useState("~");
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showMkdir, setShowMkdir] = useState(false);
  const [mkdirName, setMkdirName] = useState("");
  const [mkdirLoading, setMkdirLoading] = useState(false);

  const apiBase = getApiBaseUrl();

  const fetchDir = useCallback(async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiBase}/api/dir?path=${encodeURIComponent(path)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      // API returns {path, entries[]} — map to our interface
      const raw = Array.isArray(json) ? json : (json.entries || []);
      const data: DirEntry[] = raw.map((e: any) => ({
        name: e.name,
        path: e.path,
        is_dir: e.is_dir ?? e.type === "directory",
        size: e.size ?? 0,
        modified: e.modified ?? "",
      }));
      // Sort: directories first, then files, alphabetically
      data.sort((a, b) => {
        if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      setEntries(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchDir(currentPath);
  }, [currentPath, fetchDir]);

  const handleNavigate = (entry: DirEntry) => {
    if (entry.is_dir) {
      setCurrentPath(entry.path);
    }
  };

  const handleBreadcrumbClick = (segmentPath: string) => {
    setCurrentPath(segmentPath);
  };

  const handleBack = () => {
    if (currentPath === "~") return;
    const parts = currentPath.split("/").filter(Boolean);
    if (parts.length <= 1) {
      setCurrentPath("~");
    } else {
      parts.pop();
      setCurrentPath(parts.join("/"));
    }
  };

  const handleMkdir = async () => {
    const name = mkdirName.trim();
    if (!name) return;
    setMkdirLoading(true);
    try {
      const fullPath = currentPath === "~" ? `~/${name}` : `${currentPath}/${name}`;
      const res = await fetch(`${apiBase}/api/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: `mkdir -p ${fullPath}`, cwd: "~" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShowMkdir(false);
      setMkdirName("");
      fetchDir(currentPath);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create directory");
    } finally {
      setMkdirLoading(false);
    }
  };

  // Build breadcrumb segments
  const breadcrumbs = (): { label: string; path: string }[] => {
    if (currentPath === "~") return [{ label: "~", path: "~" }];
    const parts = currentPath.split("/").filter(Boolean);
    const result: { label: string; path: string }[] = [{ label: "~", path: "~" }];
    let built = "~";
    for (let i = 1; i < parts.length; i++) {
      built += `/${parts[i]}`;
      result.push({ label: parts[i], path: built });
    }
    return result;
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {t("workspace.listTitle", "文件浏览器")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("workspace.listDescription", "浏览和管理服务器文件系统")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowMkdir(true)}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors"
            >
              <FolderPlus size={14} />
              {t("workspace.create", "新建目录")}
            </button>
            <button
              onClick={() => fetchDir(currentPath)}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("workspace.refresh", "刷新")}
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="mt-3 flex items-center gap-1 text-sm overflow-x-auto">
          {breadcrumbs().map((crumb, i, arr) => (
            <span key={crumb.path} className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleBreadcrumbClick(crumb.path)}
                className={cn(
                  "px-1.5 py-0.5 rounded text-xs hover:bg-accent transition-colors",
                  i === arr.length - 1
                    ? "text-foreground font-medium"
                    : "text-muted-foreground"
                )}
              >
                {crumb.label}
              </button>
              {i < arr.length - 1 && (
                <ChevronRight size={12} className="text-muted-foreground" />
              )}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Back button */}
        {currentPath !== "~" && (
          <button
            onClick={handleBack}
            className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={14} />
            {t("workspace.back", "返回上级")}
          </button>
        )}

        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-xs text-destructive">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
            <p className="mt-3 text-xs text-muted-foreground">
              {t("workspace.loading", "加载中...")}
            </p>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FolderOpen size={28} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-foreground">
              {t("workspace.empty", "目录为空")}
            </h3>
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_100px_140px] bg-muted/50 px-4 py-2 text-xs font-medium text-muted-foreground border-b border-border">
              <span>{t("workspace.name", "名称")}</span>
              <span className="text-right">{t("workspace.size", "大小")}</span>
              <span className="text-right">{t("workspace.modified", "修改时间")}</span>
            </div>
            {/* Rows */}
            {entries.map((entry) => (
              <button
                key={entry.path}
                onClick={() => handleNavigate(entry)}
                disabled={!entry.is_dir}
                className={cn(
                  "grid grid-cols-[1fr_100px_140px] w-full items-center px-4 py-2.5 text-sm border-b border-border last:border-b-0 transition-colors",
                  entry.is_dir
                    ? "hover:bg-accent cursor-pointer"
                    : "cursor-default"
                )}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  {entry.is_dir ? (
                    <FolderOpen size={16} className="shrink-0 text-primary" />
                  ) : (
                    <FileText size={16} className="shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-left text-foreground">
                    {entry.name}
                  </span>
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {entry.is_dir ? "-" : formatBytes(entry.size)}
                </span>
                <span className="text-right text-xs text-muted-foreground">
                  {formatTime(entry.modified)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mkdir Dialog */}
      <Dialog
        open={showMkdir}
        onClose={() => { setShowMkdir(false); setMkdirName(""); }}
        title={t("workspace.createDir", "新建目录")}
        description={t("workspace.createDirDesc", `在 ${currentPath} 下创建新目录`)}
        footer={
          <>
            <button
              onClick={() => { setShowMkdir(false); setMkdirName(""); }}
              className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
            >
              {t("common.cancel", "取消")}
            </button>
            <button
              onClick={handleMkdir}
              disabled={!mkdirName.trim() || mkdirLoading}
              className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {mkdirLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                t("workspace.createAction", "创建")
              )}
            </button>
          </>
        }
      >
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("workspace.dirName", "目录名称")}
          </label>
          <input
            type="text"
            value={mkdirName}
            onChange={(e) => setMkdirName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleMkdir()}
            placeholder={t("workspace.newFolder", "新建文件夹")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>
      </Dialog>
    </div>
  );
}

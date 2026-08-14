"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Bone, RefreshCw, Download, Upload, Play, Trash2,
  HardDrive, Archive, Clock, CheckCircle, Loader2,
} from "lucide-react";

export function MarrowClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"backup" | "export">("backup");
  const [health, setHealth] = useState<any>(null);
  const [backups, setBackups] = useState<any[]>([]);
  const [exports, setExports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/marrow/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchBackups = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/marrow/backups`);
      const data = await res.json();
      setBackups(data.backups || []);
    } catch {}
  }, [apiBase]);

  const fetchExports = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/marrow/exports`);
      const data = await res.json();
      setExports(data.exports || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    fetchBackups();
    fetchExports();
  }, [fetchHealth, fetchBackups, fetchExports]);

  const handleBackup = async () => {
    setLoading(true);
    try {
      await fetch(`${apiBase}/api/marrow/backup`, { method: "POST" });
      await fetchBackups();
      await fetchHealth();
    } catch {} finally { setLoading(false); }
  };

  const handleRestore = async (backupId: string) => {
    if (!confirm("确定要恢复此备份？当前数据将被覆盖。")) return;
    setLoading(true);
    try {
      await fetch(`${apiBase}/api/marrow/restore/${backupId}`, { method: "POST" });
    } catch {} finally { setLoading(false); }
  };

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm("确定删除此备份？")) return;
    try {
      await fetch(`${apiBase}/api/marrow/backups/${backupId}`, { method: "DELETE" });
      await fetchBackups();
      await fetchHealth();
    } catch {}
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      await fetch(`${apiBase}/api/marrow/export`, { method: "POST" });
      await fetchExports();
    } catch {} finally { setLoading(false); }
  };

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  }

  const tabs = [
    { id: "backup" as const, label: t("marrow.backup") || "备份恢复", icon: Archive },
    { id: "export" as const, label: t("marrow.export") || "数据导出", icon: Download },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Bone size={20} className="text-amber-600" />
          <h1 className="text-lg font-semibold">{t("marrow.title") || "骨髓 · 备份恢复"}</h1>
          <span className="rounded-full bg-amber-600/10 px-2 py-0.5 text-xs font-medium text-amber-600">
            备份 · 恢复 · 迁移
          </span>
        </div>
        <button onClick={() => { fetchHealth(); fetchBackups(); fetchExports(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
          <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">备份总数</span>
                <div className="rounded-lg bg-amber-600/10 p-1.5"><Archive size={14} className="text-amber-600" /></div>
              </div>
              <p className="text-2xl font-bold">{health.backup?.total_backups || 0}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{formatBytes(health.backup?.total_size_bytes || 0)}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">导出文件</span>
                <div className="rounded-lg bg-blue-500/10 p-1.5"><Download size={14} className="text-blue-500" /></div>
              </div>
              <p className="text-2xl font-bold">{exports.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">存储目录</span>
                <div className="rounded-lg bg-emerald-500/10 p-1.5"><HardDrive size={14} className="text-emerald-500" /></div>
              </div>
              <p className="text-xs font-mono truncate">{health.backup?.backup_dir || "~/.opensoul/backups"}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === tabItem.id ? "bg-amber-600/10 text-amber-700 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Backup Tab */}
        {tab === "backup" && (
          <div className="space-y-4">
            <button onClick={handleBackup} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
              {loading ? (t("common.backingUp") || "备份中...") : (t("marrow.createBackup") || "创建新备份")}
            </button>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("marrow.backupId") || "备份ID"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">时间</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">大小</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">类型</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">暂无备份</td></tr>
                  ) : backups.map((b) => (
                    <tr key={b.backup_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{b.backup_id}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(b.created_at * 1000).toLocaleString("zh-CN")}</td>
                      <td className="px-4 py-2.5 text-xs">{formatBytes(b.size_bytes)}</td>
                      <td className="px-4 py-2.5 text-xs">{b.type}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleRestore(b.backup_id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-amber-600 hover:bg-amber-600/10" title={t("marrow.restore") || "恢复"}>
                            <Play size={14} />
                          </button>
                          <button onClick={() => handleDeleteBackup(b.backup_id)}
                            className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10" title={t("marrow.delete") || "删除"}>
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Export Tab */}
        {tab === "export" && (
          <div className="space-y-4">
            <button onClick={handleExport} disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50">
              {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
              {loading ? (t("common.exporting") || "导出中...") : (t("marrow.createExport") || "创建数据导出")}
            </button>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">文件名</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">时间</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">大小</th>
                  </tr>
                </thead>
                <tbody>
                  {exports.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-xs">暂无导出</td></tr>
                  ) : exports.map((e, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-mono text-xs">{e.filename}</td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">{e.created_at ? new Date(e.created_at * 1000).toLocaleString("zh-CN") : "-"}</td>
                      <td className="px-4 py-2.5 text-xs">{formatBytes(e.size_bytes || 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

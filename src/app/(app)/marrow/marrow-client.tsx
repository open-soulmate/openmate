"use client"

import { useEffect, useState, useCallback } from "react"
import { getApiBaseUrl } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  Bone, Plus, Trash2, RefreshCw, Download, Upload, HardDrive,
  CheckCircle, XCircle, Loader2, Archive, RotateCcw, FileText,
  Activity, ArrowUpDown, Clock, Play, Pause, CalendarClock,
} from "lucide-react"
import { useTranslation } from "react-i18next"

interface MarrowHealth {
  status: string
  component: string
  backup: { total_backups: number; total_size_bytes: number; backup_dir: string }
  scheduler: { active_schedules: number; total_schedules: number; running: boolean }
  export_dir: string
}

interface Backup {
  backup_id: string
  name: string
  description: string
  created_at: string
  size_bytes: number
  file_count: number
  checksum: string
  tags: string[]
}

interface ExportJob {
  job_id: string
  format: string
  record_count: number
  size_bytes: number
  file_path: string
  created_at: string
}

interface ScheduledBackup {
  schedule_id: string
  name: string
  source_dirs: string[]
  cron_expr: string
  interval_seconds: number
  description: string
  tags: string[]
  enabled: boolean
  created_at: number
  last_run_at: number
  next_run_at: number
  run_count: number
  last_backup_id: string
}

type ActiveTab = "overview" | "backups" | "schedules" | "migration"

export function MarrowClient() {
  const apiBase = getApiBaseUrl()
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")
  const [health, setHealth] = useState<MarrowHealth | null>(null)
  const [backups, setBackups] = useState<Backup[]>([])
  const [exports, setExports] = useState<ExportJob[]>([])
  const [schedules, setSchedules] = useState<ScheduledBackup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [restoring, setRestoring] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null)

  // Create backup form
  const [showCreateBackup, setShowCreateBackup] = useState(false)
  const [backupForm, setBackupForm] = useState({ name: "", description: "", sourceDirs: "~/.opensoul/data", tags: "" })

  // Create schedule form
  const [showCreateSchedule, setShowCreateSchedule] = useState(false)
  const [scheduleForm, setScheduleForm] = useState({ name: "", sourceDirs: "~/.opensoul/data", interval: "daily", description: "", tags: "" })

  // Import
  const [importing, setImporting] = useState(false)
  const [importFormat, setImportFormat] = useState("json")

  const refresh = useCallback(async () => {
    try {
      const [h, b, e, s] = await Promise.all([
        fetch(`${apiBase}/api/marrow/health`).then(r => r.json()),
        fetch(`${apiBase}/api/marrow/backups`).then(r => r.json()).catch(() => ({ backups: [] })),
        fetch(`${apiBase}/api/marrow/exports`).then(r => r.json()).catch(() => ({ exports: [] })),
        fetch(`${apiBase}/api/marrow/schedules`).then(r => r.json()).catch(() => ({ schedules: [] })),
      ])
      setHealth(h)
      setBackups(b.backups || [])
      setExports(e.exports || [])
      setSchedules(s.schedules || [])
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [apiBase])

  useEffect(() => { refresh() }, [refresh])

  const showMsg = (type: "ok" | "err", text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleCreateBackup = async () => {
    setCreating(true)
    try {
      const sourceDirs = backupForm.sourceDirs.split(",").map(s => s.trim()).filter(Boolean)
      const res = await fetch(`${apiBase}/api/marrow/backup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source_dirs: sourceDirs,
          name: backupForm.name || undefined,
          description: backupForm.description || undefined,
          tags: backupForm.tags ? backupForm.tags.split(",").map(s => s.trim()) : [],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        showMsg("ok", `${t("marrow.backupCreated") || "备份创建成功"}: ${data.backup_id} (${data.file_count} ${t("marrow.files") || "文件"})`)
        setShowCreateBackup(false)
        setBackupForm({ name: "", description: "", sourceDirs: "~/.opensoul/data", tags: "" })
        refresh()
      } else {
        const err = await res.json()
        showMsg("err", err.detail || (t("marrow.backupFailed") || "备份创建失败"))
      }
    } catch (e: any) {
      showMsg("err", e.message || (t("common.networkError") || "网络错误"))
    }
    setCreating(false)
  }

  const handleRestore = async (backupId: string) => {
    if (!confirm(`${t("marrow.confirmRestoreBackup") || "确认恢复备份"} "${backupId}"？${t("marrow.willOverwrite") || "这将覆盖当前数据。"}`)) return
    setRestoring(backupId)
    try {
      const res = await fetch(`${apiBase}/api/marrow/restore/${backupId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ backup_id: backupId, target_dir: "~/.opensoul/restore" }),
      })
      if (res.ok) {
        showMsg("ok", t("marrow.restoreSuccess") || "恢复成功")
      } else {
        const err = await res.json()
        showMsg("err", err.detail || (t("marrow.restoreFailed") || "恢复失败"))
      }
    } catch (e: any) {
      showMsg("err", e.message || (t("common.networkError") || "网络错误"))
    }
    setRestoring(null)
  }

  const handleDeleteBackup = async (backupId: string) => {
    if (!confirm(`${t("marrow.confirmDeleteBackup") || "确认删除备份"} "${backupId}"？`)) return
    setDeleting(backupId)
    try {
      await fetch(`${apiBase}/api/marrow/backups/${backupId}`, { method: "DELETE" })
      showMsg("ok", t("marrow.backupDeleted") || "备份已删除")
      refresh()
    } catch (e: any) {
      showMsg("err", e.message || (t("common.deleteFailed") || "删除失败"))
    }
    setDeleting(null)
  }

  // ── Schedule handlers ──
  const handleCreateSchedule = async () => {
    setCreating(true)
    try {
      const sourceDirs = scheduleForm.sourceDirs.split(",").map(s => s.trim()).filter(Boolean)
      const res = await fetch(`${apiBase}/api/marrow/schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: scheduleForm.name,
          source_dirs: sourceDirs,
          interval: scheduleForm.interval,
          description: scheduleForm.description || undefined,
          tags: scheduleForm.tags ? scheduleForm.tags.split(",").map(s => s.trim()) : [],
        }),
      })
      if (res.ok) {
        const data = await res.json()
        showMsg("ok", `${t("marrow.scheduleCreated") || "定时备份已创建"}: ${data.name}`)
        setShowCreateSchedule(false)
        setScheduleForm({ name: "", sourceDirs: "~/.opensoul/data", interval: "daily", description: "", tags: "" })
        refresh()
      } else {
        const err = await res.json()
        showMsg("err", err.detail || (t("common.createFailed") || "创建失败"))
      }
    } catch (e: any) {
      showMsg("err", e.message || (t("common.networkError") || "网络错误"))
    }
    setCreating(false)
  }

  const handleToggleSchedule = async (scheduleId: string, enabled: boolean) => {
    try {
      await fetch(`${apiBase}/api/marrow/schedules/${scheduleId}/toggle`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      })
      showMsg("ok", enabled ? (t("common.enabled") || "已启用") : (t("common.paused") || "已暂停"))
      refresh()
    } catch (e: any) {
      showMsg("err", e.message || (t("common.actionFailed") || "操作失败"))
    }
  }

  const handleDeleteSchedule = async (scheduleId: string) => {
    if (!confirm(t("marrow.confirmDeleteSchedule") || "确认删除此定时备份？")) return
    try {
      await fetch(`${apiBase}/api/marrow/schedules/${scheduleId}`, { method: "DELETE" })
      showMsg("ok", t("marrow.scheduleDeleted") || "定时备份已删除")
      refresh()
    } catch (e: any) {
      showMsg("err", e.message || (t("common.deleteFailed") || "删除失败"))
    }
  }

  const handleRunDue = async () => {
    try {
      const res = await fetch(`${apiBase}/api/marrow/schedules/run-due`, { method: "POST" })
      const data = await res.json()
      showMsg("ok", `${t("marrow.runComplete") || "执行完成"}: ${data.count} ${t("marrow.tasks") || "个任务"}`)
      refresh()
    } catch (e: any) {
      showMsg("err", e.message || (t("common.executeFailed") || "执行失败"))
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      formData.append("format", importFormat)
      const res = await fetch(`${apiBase}/api/marrow/import`, { method: "POST", body: formData })
      if (res.ok) {
        const data = await res.json()
        showMsg("ok", `${t("marrow.importSuccess") || "导入成功"}: ${data.records} ${t("marrow.records") || "条记录"}`)
      } else {
        const err = await res.json()
        showMsg("err", err.detail || (t("marrow.importFailed") || "导入失败"))
      }
    } catch (ex: any) {
      showMsg("err", ex.message || (t("marrow.importFailed") || "导入失败"))
    }
    setImporting(false)
    e.target.value = ""
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  const formatInterval = (expr: string, secs: number) => {
    const map: Record<string, string> = {
      hourly: t("marrow.hourly") || "每小时",
      daily: t("marrow.daily") || "每天",
      weekly: t("marrow.weekly") || "每周",
    }
    return map[expr] || `${t("marrow.every") || "每"} ${secs} ${t("marrow.seconds") || "秒"}`
  }

  const formatNextRun = (ts: number) => {
    if (!ts) return "—"
    const d = new Date(ts * 1000)
    const now = Date.now()
    const diff = ts * 1000 - now
    if (diff <= 0) return t("marrow.runSoon") || "即将执行"
    if (diff < 3600000) return `${Math.round(diff / 60000)} ${t("marrow.minutesLater") || "分钟后"}`
    if (diff < 86400000) return `${Math.round(diff / 3600000)} ${t("marrow.hoursLater") || "小时后"}`
    return d.toLocaleString()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const tabs: Array<{ key: ActiveTab; label: string; icon: typeof Bone }> = [
    { key: "overview", label: t("marrow.tabOverview") || "概览", icon: Activity },
    { key: "backups", label: t("marrow.tabBackups") || "备份管理", icon: Archive },
    { key: "schedules", label: t("marrow.tabSchedules") || "定时备份", icon: CalendarClock },
    { key: "migration", label: t("marrow.tabMigration") || "数据迁移", icon: ArrowUpDown },
  ]

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
            <Bone className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">{t("marrow.title") || "Marrow — 骨髓系统"}</h1>
            <p className="text-sm text-muted-foreground">{t("marrow.subtitle") || "备份恢复、定时备份、数据迁移、灾备管理"}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-2 mt-4">
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-t-lg transition-colors",
                  activeTab === tab.key
                    ? "bg-card border border-b-0 border-border text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Message Toast */}
      {message && (
        <div className={cn(
          "mx-6 mb-2 flex items-center gap-2 p-3 rounded-lg border text-sm",
          message.type === "ok"
            ? "border-green-500/30 bg-green-500/10 text-green-400"
            : "border-red-500/30 bg-red-500/10 text-red-400"
        )}>
          {message.type === "ok" ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {message.text}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">

        {/* ── Overview Tab ── */}
        {activeTab === "overview" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: t("marrow.totalBackups") || "总备份", value: health?.backup.total_backups ?? 0, icon: Archive, color: "text-blue-400", bg: "from-blue-500/20 to-blue-600/10" },
                { label: t("marrow.totalSize") || "总大小", value: formatSize(health?.backup.total_size_bytes ?? 0), icon: HardDrive, color: "text-amber-400", bg: "from-amber-500/20 to-amber-600/10" },
                { label: t("marrow.scheduledTasks") || "定时任务", value: health?.scheduler.active_schedules ?? 0, icon: CalendarClock, color: "text-cyan-400", bg: "from-cyan-500/20 to-cyan-600/10" },
                { label: t("marrow.status") || "状态", value: health?.status === "ok" ? (t("common.normal") || "正常") : (t("common.abnormal") || "异常"), icon: CheckCircle, color: health?.status === "ok" ? "text-green-400" : "text-red-400", bg: health?.status === "ok" ? "from-green-500/20 to-green-600/10" : "from-red-500/20 to-red-600/10" },
              ].map(s => (
                <div key={s.label} className={cn("rounded-xl border border-border bg-gradient-to-br p-4", s.bg)}>
                  <s.icon className={cn("w-4 h-4 mb-2", s.color)} />
                  <div className={cn("text-2xl font-bold", s.color)}>{s.value}</div>
                  <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Paths */}
            <div className="p-4 rounded-xl border border-border bg-card space-y-2">
              <h3 className="text-sm font-semibold text-foreground mb-2">{t("marrow.storagePaths") || "存储路径"}</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("marrow.backupDir") || "备份目录"}:</span>
                <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{health?.backup.backup_dir || "~/.opensoul/backups"}</code>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("marrow.exportDir") || "导出目录"}:</span>
                <code className="px-2 py-0.5 rounded bg-muted text-xs font-mono">{health?.export_dir || "~/.opensoul/exports"}</code>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">{t("marrow.scheduler") || "调度器"}:</span>
                <span className={cn("text-xs font-medium", health?.scheduler.running ? "text-green-400" : "text-red-400")}>
                  {health?.scheduler.running ? (t("common.running") || "运行中") : (t("common.stopped") || "已停止")}
                </span>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-3 gap-4">
              <button
                onClick={() => { setActiveTab("backups"); setShowCreateBackup(true) }}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left"
              >
                <Plus className="w-5 h-5 text-primary mb-2" />
                <div className="text-sm font-semibold text-foreground">{t("marrow.createBackup") || "创建备份"}</div>
                <div className="text-xs text-muted-foreground">{t("marrow.snapshotCurrent") || "快照当前系统数据"}</div>
              </button>
              <button
                onClick={() => { setActiveTab("schedules"); setShowCreateSchedule(true) }}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left"
              >
                <CalendarClock className="w-5 h-5 text-cyan-400 mb-2" />
                <div className="text-sm font-semibold text-foreground">{t("marrow.scheduledBackup") || "定时备份"}</div>
                <div className="text-xs text-muted-foreground">{t("marrow.setAutoBackup") || "设置自动备份计划"}</div>
              </button>
              <button
                onClick={() => setActiveTab("migration")}
                className="p-4 rounded-xl border border-border bg-card hover:border-primary/40 transition-all text-left"
              >
                <ArrowUpDown className="w-5 h-5 text-purple-400 mb-2" />
                <div className="text-sm font-semibold text-foreground">{t("marrow.dataMigration") || "数据迁移"}</div>
                <div className="text-xs text-muted-foreground">{t("marrow.importExport") || "导入/导出数据"}</div>
              </button>
            </div>
          </div>
        )}

        {/* ── Backups Tab ── */}
        {activeTab === "backups" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("marrow.backups") || "备份列表"}</h3>
              <div className="flex gap-2">
                <button onClick={refresh} className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground">
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreateBackup(!showCreateBackup)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("marrow.createBackup") || "创建备份"}
                </button>
              </div>
            </div>

            {/* Create Backup Form */}
            {showCreateBackup && (
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.backupName") || "备份名称"}</label>
                    <input value={backupForm.name} onChange={e => setBackupForm({ ...backupForm, name: e.target.value })}
                      placeholder={t("marrow.backupNamePlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.tags") || "标签"} ({t("common.commaSeparated") || "逗号分隔"})</label>
                    <input value={backupForm.tags} onChange={e => setBackupForm({ ...backupForm, tags: e.target.value })}
                      placeholder={t("marrow.tagsPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.sourceDirs") || "源目录"} ({t("common.commaSeparated") || "逗号分隔"})</label>
                    <input value={backupForm.sourceDirs} onChange={e => setBackupForm({ ...backupForm, sourceDirs: e.target.value })}
                      placeholder={t("marrow.sourceDirsPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.description") || "描述"}</label>
                    <input value={backupForm.description} onChange={e => setBackupForm({ ...backupForm, description: e.target.value })}
                      placeholder={t("marrow.descriptionPlaceholder") || "备份描述 (可选)"} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreateBackup(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">{t("common.cancel") || "取消"}</button>
                  <button onClick={handleCreateBackup} disabled={creating}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40">
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Archive className="w-3.5 h-3.5" />}
                    {creating ? (t("common.creating") || "创建中...") : (t("common.create") || "创建")}
                  </button>
                </div>
              </div>
            )}

            {/* Backup List */}
            <div className="space-y-2">
              {backups.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">{t("marrow.noBackups") || "暂无备份"}</div>
              )}
              {backups.map(b => (
                <div key={b.backup_id} className="p-4 rounded-xl border border-border bg-card">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <Archive className="w-5 h-5 text-amber-400" />
                      <div>
                        <div className="text-sm font-semibold text-foreground">{b.name || b.backup_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(b.created_at).toLocaleString()} · {b.file_count} {t("marrow.files") || "文件"} · {formatSize(b.size_bytes)}
                        </div>
                        {b.description && <div className="text-xs text-muted-foreground mt-1">{b.description}</div>}
                        {b.tags && b.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {b.tags.map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleRestore(b.backup_id)} disabled={restoring === b.backup_id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40"
                        title={t("marrow.restore") || "恢复"}>
                        {restoring === b.backup_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
                        {t("marrow.restore") || "恢复"}
                      </button>
                      <button onClick={() => handleDeleteBackup(b.backup_id)} disabled={deleting === b.backup_id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors disabled:opacity-40"
                        title={t("common.delete") || "删除"}>
                        {deleting === b.backup_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                        {t("common.delete") || "删除"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Schedules Tab ── */}
        {activeTab === "schedules" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">{t("marrow.scheduledBackups") || "定时备份"}</h3>
              <div className="flex gap-2">
                <button onClick={handleRunDue}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 text-amber-400 text-sm hover:bg-amber-500/20">
                  <Play className="w-3.5 h-3.5" /> {t("marrow.runDue") || "执行到期任务"}
                </button>
                <button
                  onClick={() => setShowCreateSchedule(!showCreateSchedule)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm hover:opacity-90"
                >
                  <Plus className="w-3.5 h-3.5" /> {t("marrow.createSchedule") || "创建定时备份"}
                </button>
              </div>
            </div>

            {/* Create Schedule Form */}
            {showCreateSchedule && (
              <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.scheduleName") || "任务名称"}</label>
                    <input value={scheduleForm.name} onChange={e => setScheduleForm({ ...scheduleForm, name: e.target.value })}
                      placeholder={t("marrow.dailyBackup") || "每日数据备份"} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.interval") || "频率"}</label>
                    <select value={scheduleForm.interval} onChange={e => setScheduleForm({ ...scheduleForm, interval: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="hourly">{t("marrow.hourly") || "每小时"}</option>
                      <option value="daily">{t("marrow.daily") || "每天"}</option>
                      <option value="weekly">{t("marrow.weekly") || "每周"}</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.sourceDirs") || "源目录"}</label>
                    <input value={scheduleForm.sourceDirs} onChange={e => setScheduleForm({ ...scheduleForm, sourceDirs: e.target.value })}
                      placeholder={t("marrow.sourceDirsPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
                  </div>
                  <div className="col-span-2">
                    <label className="text-xs text-muted-foreground mb-1 block">{t("marrow.tags") || "标签"}</label>
                    <input value={scheduleForm.tags} onChange={e => setScheduleForm({ ...scheduleForm, tags: e.target.value })}
                      placeholder={t("marrow.scheduleTagsPlaceholder")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCreateSchedule(false)} className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground">{t("common.cancel") || "取消"}</button>
                  <button onClick={handleCreateSchedule} disabled={creating || !scheduleForm.name}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-40">
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                    {creating ? (t("common.creating") || "创建中...") : (t("common.create") || "创建")}
                  </button>
                </div>
              </div>
            )}

            {/* Schedule List */}
            <div className="space-y-2">
              {schedules.length === 0 && (
                <div className="text-center py-8 text-muted-foreground text-sm">{t("marrow.noSchedules") || "暂无定时备份"}</div>
              )}
              {schedules.map(s => (
                <div key={s.schedule_id} className={cn("p-4 rounded-xl border bg-card", s.enabled ? "border-border" : "border-border/50 opacity-60")}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <CalendarClock className={cn("w-5 h-5", s.enabled ? "text-cyan-400" : "text-muted-foreground")} />
                      <div>
                        <div className="text-sm font-semibold text-foreground">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatInterval(s.cron_expr, s.interval_seconds)} · {t("marrow.runCount") || "已执行"}: {s.run_count} · {t("marrow.nextRun") || "下次"}: {formatNextRun(s.next_run_at)}
                        </div>
                        {s.source_dirs && (
                          <div className="text-xs text-muted-foreground mt-1 font-mono">{s.source_dirs.join(", ")}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleToggleSchedule(s.schedule_id, !s.enabled)}
                        className={cn("flex items-center gap-1 px-2.5 py-1 rounded-md text-xs transition-colors",
                          s.enabled ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20" : "bg-green-500/10 text-green-400 hover:bg-green-500/20")}>
                        {s.enabled ? <><Pause className="w-3 h-3" /> {t("common.pause") || "暂停"}</> : <><Play className="w-3 h-3" /> {t("common.enable") || "启用"}</>}
                      </button>
                      <button onClick={() => handleDeleteSchedule(s.schedule_id)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">
                        <Trash2 className="w-3 h-3" /> {t("common.delete") || "删除"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Migration Tab ── */}
        {activeTab === "migration" && (
          <div className="space-y-6">
            {/* Export */}
            <div className="p-4 rounded-xl border border-border bg-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("marrow.exportData") || "数据导出"}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t("marrow.exportDesc") || "将知识库数据导出为标准格式"}</p>
              <button
                onClick={async () => {
                  try {
                    const res = await fetch(`${apiBase}/api/marrow/export`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ format: "json" }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      showMsg("ok", `${t("marrow.exportSuccess") || "导出完成"}: ${data.records} ${t("marrow.records") || "条记录"}`)
                      refresh()
                    }
                  } catch { showMsg("err", t("marrow.exportFailed") || "导出失败") }
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm hover:bg-purple-500/20"
              >
                <Download className="w-4 h-4" /> {t("marrow.startExport") || "开始导出"}
              </button>
            </div>

            {/* Import */}
            <div className="p-4 rounded-xl border border-border bg-card">
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("marrow.importData") || "数据导入"}</h3>
              <p className="text-xs text-muted-foreground mb-3">{t("marrow.importDesc") || "从备份文件或标准格式导入数据"}</p>
              <div className="flex items-center gap-3">
                <select value={importFormat} onChange={e => setImportFormat(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="json">JSON</option>
                  <option value="csv">CSV</option>
                  <option value="markdown">Markdown</option>
                </select>
                <label className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-400 text-sm hover:bg-green-500/20 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  {importing ? (t("common.importing") || "导入中...") : (t("marrow.selectFile") || "选择文件")}
                  <input type="file" className="hidden" onChange={handleImport} accept=".json,.csv,.md,.txt" disabled={importing} />
                </label>
              </div>
            </div>

            {/* Export History */}
            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">{t("marrow.exportHistory") || "导出历史"}</h3>
              {exports.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">{t("marrow.noExports") || "暂无导出记录"}</div>
              ) : (
                <div className="space-y-2">
                  {exports.map(exp => (
                    <div key={exp.job_id} className="p-3 rounded-lg border border-border bg-card flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="w-4 h-4 text-purple-400" />
                        <div>
                          <div className="text-sm text-foreground">{exp.format.toUpperCase()} · {exp.record_count} {t("marrow.records") || "条"} · {formatSize(exp.size_bytes)}</div>
                          <div className="text-xs text-muted-foreground">{new Date(exp.created_at).toLocaleString()}</div>
                        </div>
                      </div>
                      <a href={`${apiBase}/api/marrow/exports/${exp.job_id}/download`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-blue-500/10 text-blue-400 hover:bg-blue-500/20">
                        <Download className="w-3 h-3" /> {t("common.download") || "下载"}
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

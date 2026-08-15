"use client"

import { useEffect, useState } from "react"

interface MarrowHealth {
  status: string
  component: string
  backup: { total_backups: number; total_size_bytes: number; backup_dir: string }
  export_dir: string
}

interface Backup {
  id: string
  created_at: string
  size_bytes: number
  tables: string[]
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function MarrowClient() {
  const [health, setHealth] = useState<MarrowHealth | null>(null)
  const [backups, setBackups] = useState<Backup[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const apiBase = getApiBaseUrl()

  const refresh = () => {
    Promise.all([
      fetch(`${apiBase}/api/marrow/health`).then(r => r.json()),
      fetch(`${apiBase}/api/marrow/backups`).then(r => r.json()).catch(() => ({ backups: [] })),
    ]).then(([h, b]) => {
      setHealth(h)
      setBackups(b.backups || b || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [apiBase])

  const createBackup = async () => {
    setCreating(true)
    try {
      await fetch(`${apiBase}/api/marrow/backup`, { method: "POST" })
      refresh()
    } catch {}
    setCreating(false)
  }

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 600 }}>🦴 Marrow — 数据管道</h2>
        <button
          onClick={createBackup}
          disabled={creating}
          style={{
            padding: "8px 16px", borderRadius: 6, border: "none",
            background: "hsl(var(--primary))", color: "white", cursor: "pointer", fontSize: 13,
            opacity: creating ? 0.6 : 1,
          }}
        >
          {creating ? "创建中..." : "创建备份"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
        {[
          { label: "总备份", value: health?.backup.total_backups ?? 0 },
          { label: "总大小", value: formatSize(health?.backup.total_size_bytes ?? 0) },
          { label: "状态", value: health?.status === "ok" ? "正常" : "异常" },
        ].map(s => (
          <div key={s.label} style={{ padding: 16, borderRadius: 8, border: "1px solid hsl(var(--border))" }}>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>备份列表</h3>
      {backups.length === 0 ? (
        <p style={{ color: "hsl(var(--muted-foreground))" }}>暂无备份</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {backups.map(b => (
            <div key={b.id} style={{
              padding: 12, borderRadius: 8, border: "1px solid hsl(var(--border))",
              display: "flex", alignItems: "center", gap: 16,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 500, fontSize: 14 }}>{b.id}</div>
                <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
                  {new Date(b.created_at).toLocaleString()}
                </div>
              </div>
              <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{formatSize(b.size_bytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

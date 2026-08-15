"use client"

import { useEffect, useState } from "react"

interface WillHealth {
  status: string
  component: string
  engine: {
    total_workflows: number
    active_workflows: number
    total_executions: number
    successful: number
    failed: number
    running: number
    success_rate: number
  }
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

export function WillClient() {
  const [health, setHealth] = useState<WillHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    fetch(`${apiBase}/api/will/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  const eng = health?.engine

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>⚡ Will — 工作流引擎</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16, marginBottom: 24 }}>
        {[
          { label: "总工作流", value: eng?.total_workflows ?? 0, color: "#3b82f6" },
          { label: "活跃", value: eng?.active_workflows ?? 0, color: "#22c55e" },
          { label: "总执行", value: eng?.total_executions ?? 0, color: "#a855f7" },
          { label: "成功率", value: `${(eng?.success_rate ?? 0).toFixed(0)}%`, color: "#eab308" },
        ].map(s => (
          <div key={s.label} style={{
            padding: 16, borderRadius: 8, border: `1px solid ${s.color}33`, background: `${s.color}11`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>执行统计</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
        {[
          { label: "成功", value: eng?.successful ?? 0, color: "#22c55e" },
          { label: "失败", value: eng?.failed ?? 0, color: "#ef4444" },
          { label: "运行中", value: eng?.running ?? 0, color: "#3b82f6" },
        ].map(s => (
          <div key={s.label} style={{
            padding: 12, borderRadius: 8, border: "1px solid hsl(var(--border))",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 20, fontWeight: 600, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

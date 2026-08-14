"use client"

import { useEffect, useState } from "react"

interface NerveHealth {
  status: string
  component: string
  bus: {
    total_events: number
    total_nodes: number
    online_nodes: number
    total_subscriptions: number
    topics: string[]
  }
}

interface Node {
  id: string
  name: string
  status: string
  last_heartbeat: string
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

export function NerveClient() {
  const [health, setHealth] = useState<NerveHealth | null>(null)
  const [nodes, setNodes] = useState<Node[]>([])
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/api/nerve/health`).then(r => r.json()),
      fetch(`${apiBase}/api/nerve/nodes`).then(r => r.json()).catch(() => ({ nodes: [] })),
    ]).then(([h, n]) => {
      setHealth(h)
      setNodes(n.nodes || n || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  const bus = health?.bus

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>⚡ Nerve — 任务编排</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "总事件", value: bus?.total_events ?? 0, color: "#3b82f6" },
          { label: "总节点", value: bus?.total_nodes ?? 0, color: "#a855f7" },
          { label: "在线节点", value: bus?.online_nodes ?? 0, color: "#22c55e" },
          { label: "订阅数", value: bus?.total_subscriptions ?? 0, color: "#eab308" },
        ].map(s => (
          <div key={s.label} style={{
            padding: 16, borderRadius: 8, border: `1px solid ${s.color}33`, background: `${s.color}11`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>节点</h3>
      {nodes.length === 0 ? (
        <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 14 }}>暂无注册节点</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {nodes.map(n => (
            <div key={n.id} style={{
              padding: 12, borderRadius: 8, border: "1px solid hsl(var(--border))",
              display: "flex", alignItems: "center", gap: 12,
            }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: n.status === "online" ? "#22c55e" : "#6b7280",
              }} />
              <span style={{ fontWeight: 500, fontSize: 14 }}>{n.name || n.id}</span>
              <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))", marginLeft: "auto" }}>
                {n.last_heartbeat ? new Date(n.last_heartbeat).toLocaleString() : "—"}
              </span>
            </div>
          ))}
        </div>
      )}

      {bus?.topics && bus.topics.length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Topics</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {bus.topics.map(t => (
              <span key={t} style={{
                padding: "4px 12px", borderRadius: 16, fontSize: 12,
                background: "hsl(var(--primary) / 0.1)", color: "hsl(var(--primary))",
              }}>{t}</span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

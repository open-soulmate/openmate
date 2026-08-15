"use client"

import { useEffect, useState } from "react"

interface Provider {
  name: string
  base_url: string
  models: Record<string, string>
  enabled: boolean
  priority: number
}

interface GlandHealth {
  status: string
  providers: { total: number; enabled: number; unhealthy: number }
  keys: { total: number }
  token_meter: { total_tokens: number; call_count: number; by_model: Record<string, number> }
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

export function GlandClient() {
  const [health, setHealth] = useState<GlandHealth | null>(null)
  const [providers, setProviders] = useState<Provider[]>([])
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  const refresh = () => {
    Promise.all([
      fetch(`${apiBase}/api/gland/health`).then(r => r.json()),
      fetch(`${apiBase}/api/gland/providers`).then(r => r.json()),
    ]).then(([h, p]) => {
      setHealth(h)
      setProviders(p.providers || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { refresh() }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>🧠 Gland — 模型网关</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "Providers", value: health?.providers.total ?? 0, color: "#3b82f6" },
          { label: "Enabled", value: health?.providers.enabled ?? 0, color: "#22c55e" },
          { label: "API Keys", value: health?.keys.total ?? 0, color: "#a855f7" },
          { label: "Total Calls", value: health?.token_meter.call_count ?? 0, color: "#eab308" },
        ].map(s => (
          <div key={s.label} style={{
            padding: 16, borderRadius: 8, border: `1px solid ${s.color}33`, background: `${s.color}11`,
          }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>模型 Providers</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {providers.map(p => (
          <div key={p.name} style={{
            padding: 16, borderRadius: 8, border: "1px solid hsl(var(--border))",
            display: "flex", alignItems: "center", gap: 16,
          }}>
            <span style={{
              width: 10, height: 10, borderRadius: "50%",
              background: p.enabled ? "#22c55e" : "#6b7280",
            }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{p.name}</div>
              <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>{p.base_url}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {Object.entries(p.models).map(([type, model]) => (
                <span key={type} style={{
                  padding: "2px 8px", borderRadius: 4, fontSize: 11,
                  background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))",
                }}>
                  {type}: {model}
                </span>
              ))}
            </div>
            <span style={{
              padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
              color: p.enabled ? "#22c55e" : "#6b7280",
              border: `1px solid ${p.enabled ? "#22c55e44" : "#6b728044"}`,
            }}>
              {p.enabled ? "启用" : "禁用"}
            </span>
          </div>
        ))}
      </div>

      {health?.token_meter.by_model && Object.keys(health.token_meter.by_model).length > 0 && (
        <>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginTop: 24, marginBottom: 12 }}>Token 使用</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Object.entries(health.token_meter.by_model).map(([model, tokens]) => (
              <div key={model} style={{
                display: "flex", justifyContent: "space-between", padding: 8,
                borderRadius: 4, background: "hsl(var(--muted) / 0.3)",
              }}>
                <span style={{ fontSize: 13 }}>{model}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{tokens} tokens</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

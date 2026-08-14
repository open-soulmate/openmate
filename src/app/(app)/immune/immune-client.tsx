"use client"

import { useEffect, useState } from "react"

interface ImmuneHealth {
  status: string
  component: string
  modules: Record<string, Record<string, unknown>>
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

function formatValue(v: unknown): string {
  if (typeof v === "object" && v !== null) return JSON.stringify(v)
  return String(v)
}

export function ImmuneClient() {
  const [health, setHealth] = useState<ImmuneHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    fetch(`${apiBase}/api/immune/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  const modules = health?.modules || {}

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>🛡️ Immune — 安全防护</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
        {Object.entries(modules).map(([name, mod]) => (
          <div key={name} style={{
            padding: 16, borderRadius: 8,
            border: "1px solid hsl(var(--border))",
            background: "hsl(var(--card))",
          }}>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 12, textTransform: "capitalize" }}>
              {name.replace(/_/g, " ")}
            </div>
            {Object.entries(mod).filter(([k]) => k !== "config").map(([k, v]) => (
              <div key={k} style={{
                display: "flex", justifyContent: "space-between", padding: "4px 0",
                borderBottom: "1px solid hsl(var(--border) / 0.3)",
              }}>
                <span style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", textTransform: "capitalize" }}>
                  {k.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{formatValue(v)}</span>
              </div>
            ))}
            {mod.config && typeof mod.config === "object" && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 4, background: "hsl(var(--muted) / 0.3)" }}>
                <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginBottom: 4 }}>Config</div>
                {Object.entries(mod.config as Record<string, unknown>).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "hsl(var(--muted-foreground))" }}>{k}</span>
                    <span>{formatValue(v)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

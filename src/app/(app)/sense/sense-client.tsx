"use client"

import { useEffect, useState } from "react"

interface SenseHealth {
  status: string
  component: string
  engines: Record<string, { available: boolean; engine: string; [k: string]: unknown }>
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

export function SenseClient() {
  const [health, setHealth] = useState<SenseHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    fetch(`${apiBase}/api/sense/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  const engines = health?.engines || {}

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>👁️ Sense — 感知引擎</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {Object.entries(engines).map(([name, eng]) => (
          <div key={name} style={{
            padding: 16, borderRadius: 8,
            border: `1px solid ${eng.available ? "#22c55e33" : "#6b728033"}`,
            background: eng.available ? "#22c55e08" : "#6b728008",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: eng.available ? "#22c55e" : "#6b7280",
              }} />
              <span style={{ fontWeight: 600, fontSize: 15, textTransform: "uppercase" }}>{name}</span>
            </div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
              Engine: {eng.engine}
            </div>
            {eng.languages && (
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                Languages: {(eng.languages as string[]).join(", ")}
              </div>
            )}
            {eng.model && (
              <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))", marginTop: 4 }}>
                Model: {eng.model as string}
              </div>
            )}
            <div style={{
              marginTop: 8, fontSize: 12, fontWeight: 500,
              color: eng.available ? "#22c55e" : "#6b7280",
            }}>
              {eng.available ? "✓ 可用" : "✗ 不可用"}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

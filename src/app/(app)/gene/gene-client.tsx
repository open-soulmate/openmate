"use client"

import { useEffect, useState } from "react"

interface Template {
  id: string
  name: string
  category: string
  description: string
  builtin: boolean
}

interface GeneHealth {
  status: string
  total_templates: number
  builtin_count: number
  user_count: number
  by_category: Record<string, number>
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

const CATEGORY_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  knowledge_base: "#a855f7",
  workflow: "#22c55e",
  skill: "#eab308",
}

export function GeneClient() {
  const [health, setHealth] = useState<GeneHealth | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    Promise.all([
      fetch(`${apiBase}/api/gene/health`).then(r => r.json()),
      fetch(`${apiBase}/api/gene/templates`).then(r => r.json()).catch(() => ({ templates: [] })),
    ]).then(([h, t]) => {
      setHealth(h)
      setTemplates(t.templates || t || [])
    }).catch(() => {}).finally(() => setLoading(false))
  }, [apiBase])

  if (loading) return <div style={{ padding: 24, color: "hsl(var(--muted-foreground))" }}>Loading...</div>

  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 24 }}>🧬 Gene — 模板库</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {[
          { label: "总模板", value: health?.total_templates ?? 0 },
          { label: "内置", value: health?.builtin_count ?? 0 },
          { label: "用户创建", value: health?.user_count ?? 0 },
          { label: "分类数", value: Object.keys(health?.by_category ?? {}).length },
        ].map(s => (
          <div key={s.label} style={{
            padding: 16, borderRadius: 8, border: "1px solid hsl(var(--border))",
          }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{s.value}</div>
            <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{s.label}</div>
          </div>
        ))}
      </div>

      <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>模板列表</h3>
      {templates.length === 0 ? (
        <p style={{ color: "hsl(var(--muted-foreground))" }}>暂无模板</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {templates.map(t => {
            const color = CATEGORY_COLORS[t.category] || "#6b7280"
            return (
              <div key={t.id} style={{
                padding: 16, borderRadius: 8, border: "1px solid hsl(var(--border))",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 500,
                    background: `${color}22`, color, border: `1px solid ${color}44`,
                  }}>
                    {t.category}
                  </span>
                  {t.builtin && (
                    <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>内置</span>
                  )}
                </div>
                <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>{t.name}</div>
                <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>{t.description}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

"use client"

import { useEffect, useState } from "react"

interface TrajectorySession {
  id: string
  agent_id: string
  task_description: string
  status: string
  total_events: number
  total_tokens: number
  created_at: string
  ended_at: string | null
}

interface TrajectoryEvent {
  id: number
  session_id: string
  agent_id: string
  event_type: string
  content: string
  metadata: string | null
  timestamp: string
}

const EVENT_COLORS: Record<string, string> = {
  input: "#3b82f6",
  thinking: "#eab308",
  tool_call: "#a855f7",
  tool_result: "#06b6d4",
  output: "#22c55e",
  error: "#ef4444",
}

function getApiBaseUrl() {
  if (typeof window !== "undefined") {
    const envUrl = process.env.NEXT_PUBLIC_API_URL
    if (envUrl) return envUrl
    return `${window.location.protocol}//${window.location.hostname}:8090`
  }
  return "http://127.0.0.1:8090"
}

export function TrajectoryClient() {
  const [sessions, setSessions] = useState<TrajectorySession[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [events, setEvents] = useState<TrajectoryEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "detail">("list")
  const apiBase = getApiBaseUrl()

  useEffect(() => {
    fetch(`${apiBase}/api/trajectory/sessions`)
      .then(r => r.json())
      .then(d => setSessions(d.sessions || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiBase])

  useEffect(() => {
    if (!selectedSession) return
    fetch(`${apiBase}/api/trajectory/sessions/${selectedSession}`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})
  }, [selectedSession, apiBase])

  const selectSession = (id: string) => {
    setSelectedSession(id)
    setView("detail")
  }

  return (
    <div style={{ padding: 16 }}>
      {/* Mobile: show back button when in detail view */}
      {view === "detail" && (
        <button
          onClick={() => setView("list")}
          style={{
            display: "none", padding: "6px 12px", marginBottom: 12, borderRadius: 6,
            border: "1px solid hsl(var(--border))", background: "transparent", cursor: "pointer", fontSize: 13,
          }}
          className="mobile-back-btn"
        >
          ← 返回列表
        </button>
      )}

      <style>{`
        @media (max-width: 768px) {
          .trajectory-grid { flex-direction: column !important; }
          .trajectory-sidebar { width: 100% !important; border-right: none !important; }
          .trajectory-main { width: 100% !important; }
          .mobile-back-btn { display: inline-block !important; }
          .trajectory-sidebar { display: ${view === "list" ? "block" : "none"} !important; }
          .trajectory-main { display: ${view === "detail" ? "block" : "none"} !important; }
          .trajectory-cards { grid-template-columns: 1fr !important; }
        }
      `}</style>

      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>📊 Trajectory</h2>

      <div className="trajectory-grid" style={{ display: "flex", gap: 16 }}>
        {/* Left: Session List */}
        <div className="trajectory-sidebar" style={{ width: 320, flexShrink: 0, borderRight: "1px solid hsl(var(--border))", paddingRight: 16 }}>
          {loading ? (
            <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 14 }}>Loading...</p>
          ) : sessions.length === 0 ? (
            <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 14 }}>No trajectory sessions yet</p>
          ) : (
            sessions.map(s => (
              <button
                key={s.id}
                onClick={() => selectSession(s.id)}
                style={{
                  width: "100%", textAlign: "left", padding: 12, borderRadius: 8, marginBottom: 8,
                  border: selectedSession === s.id ? "1px solid hsl(var(--primary))" : "1px solid transparent",
                  background: selectedSession === s.id ? "hsl(var(--primary) / 0.1)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.task_description || s.agent_id}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <span style={{
                    fontSize: 11, padding: "2px 6px", borderRadius: 4,
                    background: s.status === "running" ? "hsl(var(--primary) / 0.2)" : "hsl(var(--muted))",
                    color: s.status === "running" ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  }}>{s.status}</span>
                  <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>{s.total_events} events</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Right: Event Timeline */}
        <div className="trajectory-main" style={{ flex: 1, overflow: "auto" }}>
          {!selectedSession ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "hsl(var(--muted-foreground))" }}>
              Select a session to view trajectory
            </div>
          ) : events.length === 0 ? (
            <p style={{ color: "hsl(var(--muted-foreground))" }}>No events</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {events.map((ev, idx) => {
                const color = EVENT_COLORS[ev.event_type] || EVENT_COLORS.output
                return (
                  <div key={ev.id || idx} style={{
                    padding: 12, borderRadius: 8, borderLeft: `3px solid ${color}`, background: `${color}11`,
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid ${color}`, color }}>
                        {ev.event_type}
                      </span>
                      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", marginLeft: "auto" }}>
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    <pre style={{ fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word", maxHeight: 160, overflow: "auto", margin: 0, fontFamily: "monospace" }}>
                      {ev.content}
                    </pre>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

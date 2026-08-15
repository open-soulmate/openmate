"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { cn } from "@/lib/utils"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  Activity, Search, GitBranch, Play, Pause, SkipForward, SkipBack,
  RefreshCw, Clock, Zap, Hash, Filter, ChevronRight, ChevronDown,
  BarChart3, Layers, AlertCircle, CheckCircle, XCircle, Eye,
  Copy, Terminal, MessageSquare, Bot, Wrench, ArrowLeft,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────

interface TrajectoryStats {
  total_sessions: number
  running_sessions: number
  total_events: number
  total_tokens: number
}

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
  id: string
  session_id: string
  parent_event_id: string | null
  event_type: string
  agent_id: string
  content: string
  metadata_json: string | null
  token_usage: number
  duration_ms: number
  status: string
  created_at: string
}

interface EventType {
  value: string
  name: string
}

// ── Constants ──────────────────────────────────────────────────

const EVENT_ICONS: Record<string, React.ElementType> = {
  session_start: Play,
  session_end: Pause,
  user_input: MessageSquare,
  llm_call: Bot,
  llm_response: Bot,
  tool_call: Wrench,
  tool_result: CheckCircle,
  agent_dispatch: Zap,
  agent_result: CheckCircle,
  error: XCircle,
  checkpoint: Eye,
  branch: GitBranch,
  thinking: Terminal,
  input: MessageSquare,
  output: CheckCircle,
}

const EVENT_COLORS: Record<string, string> = {
  session_start: "#22c55e",
  session_end: "#94a3b8",
  user_input: "#3b82f6",
  llm_call: "#a855f7",
  llm_response: "#a855f7",
  tool_call: "#f59e0b",
  tool_result: "#06b6d4",
  agent_dispatch: "#ec4899",
  agent_result: "#ec4899",
  error: "#ef4444",
  checkpoint: "#10b981",
  branch: "#8b5cf6",
  thinking: "#eab308",
  input: "#3b82f6",
  output: "#22c55e",
}

function getEventColor(type: string): string {
  return EVENT_COLORS[type] || "#6b7280"
}

function getEventIcon(type: string): React.ElementType {
  return EVENT_ICONS[type] || Activity
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1000000).toFixed(1)}M`
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return "just now"
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

// ── Stats Dashboard ────────────────────────────────────────────

function StatsBar({ stats, loading }: { stats: TrajectoryStats | null; loading: boolean }) {
  if (loading || !stats) {
    return (
      <div style={{ display: "flex", gap: 16, marginBottom: 20 }}>
        {[1, 2, 3, 4].map(i => (
          <div key={i} style={{
            flex: 1, padding: "12px 16px", borderRadius: 8,
            background: "hsl(var(--muted) / 0.3)", border: "1px solid hsl(var(--border))",
            height: 64, animation: "pulse 1.5s infinite",
          }} />
        ))}
      </div>
    )
  }

  const cards = [
    { label: "Sessions", value: stats.total_sessions, icon: Layers, color: "#3b82f6" },
    { label: "Running", value: stats.running_sessions, icon: Activity, color: "#22c55e" },
    { label: "Events", value: stats.total_events, icon: Hash, color: "#a855f7" },
    { label: "Tokens", value: formatTokens(stats.total_tokens), icon: Zap, color: "#f59e0b" },
  ]

  return (
    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
      {cards.map(c => (
        <div key={c.label} style={{
          flex: 1, padding: "12px 16px", borderRadius: 8,
          background: `linear-gradient(135deg, ${c.color}11, ${c.color}05)`,
          border: `1px solid ${c.color}33`,
          display: "flex", alignItems: "center", gap: 12,
        }}>
          <c.icon size={20} style={{ color: c.color, opacity: 0.8 }} />
          <div>
            <div style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {c.label}
            </div>
            <div style={{ fontSize: 22, fontWeight: 700, color: c.color, lineHeight: 1.2 }}>
              {c.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Search Bar ─────────────────────────────────────────────────

function SearchBar({
  query, onQueryChange, eventTypes, selectedTypes, onTypeToggle, onSearch,
}: {
  query: string
  onQueryChange: (q: string) => void
  eventTypes: EventType[]
  selectedTypes: Set<string>
  onTypeToggle: (t: string) => void
  onSearch: () => void
}) {
  const [showFilters, setShowFilters] = useState(false)

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", gap: 8 }}>
        <div style={{
          flex: 1, display: "flex", alignItems: "center", gap: 8,
          padding: "8px 12px", borderRadius: 8,
          border: "1px solid hsl(var(--border))",
          background: "hsl(var(--background))",
        }}>
          <Search size={16} style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }} />
          <input
            value={query}
            onChange={e => onQueryChange(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onSearch()}
            placeholder="Search trajectory events..."
            style={{
              flex: 1, border: "none", outline: "none", background: "transparent",
              fontSize: 14, color: "hsl(var(--foreground))",
            }}
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            padding: "8px 12px", borderRadius: 8, border: "1px solid hsl(var(--border))",
            background: selectedTypes.size > 0 ? "hsl(var(--primary) / 0.1)" : "transparent",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13,
            color: selectedTypes.size > 0 ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
          }}
        >
          <Filter size={14} />
          {selectedTypes.size > 0 ? `${selectedTypes.size} filters` : "Filter"}
        </button>
        <button
          onClick={onSearch}
          style={{
            padding: "8px 16px", borderRadius: 8, border: "none",
            background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))",
            cursor: "pointer", fontSize: 13, fontWeight: 500,
          }}
        >
          Search
        </button>
      </div>
      {showFilters && eventTypes.length > 0 && (
        <div style={{
          display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8, padding: "8px 12px",
          borderRadius: 8, background: "hsl(var(--muted) / 0.3)",
          border: "1px solid hsl(var(--border))",
        }}>
          {eventTypes.map(et => {
            const active = selectedTypes.has(et.value)
            const color = getEventColor(et.value)
            return (
              <button
                key={et.value}
                onClick={() => onTypeToggle(et.value)}
                style={{
                  padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 500,
                  border: `1px solid ${active ? color : "hsl(var(--border))"}`,
                  background: active ? `${color}22` : "transparent",
                  color: active ? color : "hsl(var(--muted-foreground))",
                  cursor: "pointer",
                }}
              >
                {et.value}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Session Card ───────────────────────────────────────────────

function SessionCard({
  session, selected, onSelect,
}: {
  session: TrajectorySession
  selected: boolean
  onSelect: () => void
}) {
  const statusColor = session.status === "running" ? "#22c55e" :
    session.status === "completed" ? "#3b82f6" : "#94a3b8"

  return (
    <button
      onClick={onSelect}
      style={{
        width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: 8, marginBottom: 6,
        border: selected ? "1px solid hsl(var(--primary))" : "1px solid hsl(var(--border))",
        background: selected ? "hsl(var(--primary) / 0.08)" : "hsl(var(--background))",
        cursor: "pointer", transition: "all 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", background: statusColor, flexShrink: 0,
        }} />
        <div style={{
          fontSize: 13, fontWeight: 500, overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          color: "hsl(var(--foreground))",
        }}>
          {session.task_description || session.agent_id || session.id.slice(0, 8)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 4, marginLeft: 16 }}>
        <span style={{
          fontSize: 10, padding: "1px 6px", borderRadius: 4,
          background: `${statusColor}22`, color: statusColor,
        }}>
          {session.status}
        </span>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
          {session.total_events} events
        </span>
        {session.total_tokens > 0 && (
          <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
            {formatTokens(session.total_tokens)} tok
          </span>
        )}
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", marginLeft: "auto" }}>
          {timeAgo(session.created_at)}
        </span>
      </div>
    </button>
  )
}

// ── Event Card ─────────────────────────────────────────────────

function EventCard({ event, idx, total }: { event: TrajectoryEvent; idx: number; total: number }) {
  const [expanded, setExpanded] = useState(false)
  const color = getEventColor(event.event_type)
  const Icon = getEventIcon(event.event_type)
  const contentRef = useRef<HTMLPreElement>(null)

  let parsedMeta: Record<string, unknown> | null = null
  if (event.metadata_json) {
    try { parsedMeta = JSON.parse(event.metadata_json) } catch {}
  }

  const isLong = event.content.length > 300

  return (
    <div style={{
      padding: "10px 14px", borderRadius: 8,
      borderLeft: `3px solid ${color}`,
      background: `${color}08`,
      border: `1px solid ${color}22`,
      borderLeftWidth: 3,
      transition: "all 0.15s",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))", fontFamily: "monospace" }}>
          #{idx + 1}/{total}
        </span>
        <Icon size={14} style={{ color, flexShrink: 0 }} />
        <span style={{
          fontSize: 11, padding: "2px 8px", borderRadius: 4,
          background: `${color}22`, color, fontWeight: 600,
        }}>
          {event.event_type}
        </span>
        {event.agent_id && (
          <span style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 4,
            background: "hsl(var(--muted))", color: "hsl(var(--muted-foreground))",
          }}>
            {event.agent_id}
          </span>
        )}
        {event.status && event.status !== "ok" && (
          <span style={{
            fontSize: 10, padding: "2px 6px", borderRadius: 4,
            background: "#ef484422", color: "#ef4444",
          }}>
            {event.status}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {event.token_usage > 0 && (
            <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
              {formatTokens(event.token_usage)} tok
            </span>
          )}
          {event.duration_ms > 0 && (
            <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
              {formatDuration(event.duration_ms)}
            </span>
          )}
          <span style={{ fontSize: 10, color: "hsl(var(--muted-foreground))" }}>
            {new Date(event.created_at).toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Content */}
      <pre
        ref={contentRef}
        style={{
          fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word",
          maxHeight: expanded ? 600 : 120, overflow: "auto",
          margin: 0, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          color: "hsl(var(--foreground))", lineHeight: 1.5,
          padding: "6px 8px", borderRadius: 4,
          background: "hsl(var(--muted) / 0.3)",
        }}
      >
        {event.content}
      </pre>

      {/* Expand / Collapse */}
      {(isLong || parsedMeta) && (
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          {isLong && (
            <button
              onClick={() => setExpanded(!expanded)}
              style={{
                fontSize: 11, color: "hsl(var(--primary))", background: "none",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              {expanded ? "Collapse" : "Expand"}
            </button>
          )}
          {parsedMeta && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(parsedMeta, null, 2))
              }}
              style={{
                fontSize: 11, color: "hsl(var(--muted-foreground))", background: "none",
                border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
              }}
            >
              <Copy size={12} /> Metadata
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Replay Controls ────────────────────────────────────────────

function ReplayControls({
  events, currentIdx, onStep, playing, onTogglePlay, speed, onSpeedChange,
}: {
  events: TrajectoryEvent[]
  currentIdx: number
  onStep: (idx: number) => void
  playing: boolean
  onTogglePlay: () => void
  speed: number
  onSpeedChange: (s: number) => void
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
      borderRadius: 8, background: "hsl(var(--muted) / 0.5)",
      border: "1px solid hsl(var(--border))", marginBottom: 12,
    }}>
      <button
        onClick={() => onStep(Math.max(0, currentIdx - 1))}
        disabled={currentIdx <= 0}
        style={{
          padding: "4px 8px", borderRadius: 4, border: "1px solid hsl(var(--border))",
          background: "transparent", cursor: currentIdx <= 0 ? "default" : "pointer",
          opacity: currentIdx <= 0 ? 0.3 : 1, color: "hsl(var(--foreground))",
        }}
      >
        <SkipBack size={14} />
      </button>
      <button
        onClick={onTogglePlay}
        style={{
          padding: "4px 10px", borderRadius: 4, border: "none",
          background: playing ? "#ef4444" : "hsl(var(--primary))",
          color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
          fontSize: 12,
        }}
      >
        {playing ? <Pause size={14} /> : <Play size={14} />}
        {playing ? "Pause" : "Play"}
      </button>
      <button
        onClick={() => onStep(Math.min(events.length - 1, currentIdx + 1))}
        disabled={currentIdx >= events.length - 1}
        style={{
          padding: "4px 8px", borderRadius: 4, border: "1px solid hsl(var(--border))",
          background: "transparent",
          cursor: currentIdx >= events.length - 1 ? "default" : "pointer",
          opacity: currentIdx >= events.length - 1 ? 0.3 : 1,
          color: "hsl(var(--foreground))",
        }}
      >
        <SkipForward size={14} />
      </button>
      <div style={{
        flex: 1, height: 4, borderRadius: 2, background: "hsl(var(--muted))",
        position: "relative", cursor: "pointer", marginLeft: 8,
      }}
        onClick={e => {
          const rect = e.currentTarget.getBoundingClientRect()
          const pct = (e.clientX - rect.left) / rect.width
          onStep(Math.round(pct * (events.length - 1)))
        }}
      >
        <div style={{
          position: "absolute", top: -2, left: `${(currentIdx / Math.max(1, events.length - 1)) * 100}%`,
          width: 8, height: 8, borderRadius: "50%", background: "hsl(var(--primary))",
          transform: "translateX(-50%)",
        }} />
        <div style={{
          height: "100%", borderRadius: 2,
          width: `${(currentIdx / Math.max(1, events.length - 1)) * 100}%`,
          background: "hsl(var(--primary) / 0.4)",
        }} />
      </div>
      <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))", minWidth: 40, textAlign: "center" }}>
        {currentIdx + 1}/{events.length}
      </span>
      <select
        value={speed}
        onChange={e => onSpeedChange(Number(e.target.value))}
        style={{
          fontSize: 11, padding: "2px 6px", borderRadius: 4,
          border: "1px solid hsl(var(--border))", background: "hsl(var(--background))",
          color: "hsl(var(--foreground))",
        }}
      >
        <option value={2000}>0.5x</option>
        <option value={1000}>1x</option>
        <option value={500}>2x</option>
        <option value={200}>5x</option>
      </select>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────

export function TrajectoryClient() {
  const apiBase = getApiBaseUrl()

  // State
  const [stats, setStats] = useState<TrajectoryStats | null>(null)
  const [sessions, setSessions] = useState<TrajectorySession[]>([])
  const [events, setEvents] = useState<TrajectoryEvent[]>([])
  const [eventTypes, setEventTypes] = useState<EventType[]>([])
  const [selectedSession, setSelectedSession] = useState<string | null>(null)
  const [searchResults, setSearchResults] = useState<TrajectoryEvent[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<"list" | "detail" | "search">("list")

  // Search state
  const [query, setQuery] = useState("")
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set())

  // Replay state
  const [replayIdx, setReplayIdx] = useState(0)
  const [replayPlaying, setReplayPlaying] = useState(false)
  const [replaySpeed, setReplaySpeed] = useState(1000)
  const [replayMode, setReplayMode] = useState(false)

  // Fork state
  const [forking, setForking] = useState(false)

  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Data Fetching ──────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/trajectory/stats`)
      if (r.ok) setStats(await r.json())
    } catch {}
  }, [apiBase])

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true)
      const r = await fetch(`${apiBase}/api/trajectory/sessions`)
      if (r.ok) {
        const d = await r.json()
        setSessions(d.sessions || [])
      }
    } catch {} finally {
      setLoading(false)
    }
  }, [apiBase])

  const fetchEventTypes = useCallback(async () => {
    try {
      const r = await fetch(`${apiBase}/api/trajectory/event-types`)
      if (r.ok) {
        const d = await r.json()
        setEventTypes(d.types || [])
      }
    } catch {}
  }, [apiBase])

  const fetchEvents = useCallback(async (sessionId: string) => {
    try {
      const r = await fetch(`${apiBase}/api/trajectory/sessions/${sessionId}`)
      if (r.ok) {
        const d = await r.json()
        setEvents(d.events || [])
      }
    } catch {}
  }, [apiBase])

  useEffect(() => {
    fetchStats()
    fetchSessions()
    fetchEventTypes()
  }, [fetchStats, fetchSessions, fetchEventTypes])

  // ── Search ─────────────────────────────────────────────────

  const doSearch = useCallback(async () => {
    if (!query.trim() && selectedTypes.size === 0) {
      setSearchResults(null)
      setView("list")
      return
    }
    try {
      const params = new URLSearchParams()
      if (query.trim()) params.set("q", query.trim())
      if (selectedTypes.size === 1) params.set("event_type", Array.from(selectedTypes)[0])
      const r = await fetch(`${apiBase}/api/trajectory/search?${params}`)
      if (r.ok) {
        const d = await r.json()
        setSearchResults(d.events || [])
        setView("search")
      }
    } catch {}
  }, [apiBase, query, selectedTypes])

  const toggleType = useCallback((t: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t)
      else next.add(t)
      return next
    })
  }, [])

  // ── Session Selection ──────────────────────────────────────

  const selectSession = useCallback((id: string) => {
    setSelectedSession(id)
    setView("detail")
    setReplayMode(false)
    setReplayPlaying(false)
    setReplayIdx(0)
    fetchEvents(id)
  }, [fetchEvents])

  // ── Fork ───────────────────────────────────────────────────

  const forkSession = useCallback(async () => {
    if (!selectedSession || events.length === 0) return
    setForking(true)
    try {
      const r = await fetch(`${apiBase}/api/trajectory/sessions/${selectedSession}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fork_point_event_id: events[Math.min(replayIdx, events.length - 1)].id }),
      })
      if (r.ok) {
        const d = await r.json()
        fetchSessions()
        if (d.id) selectSession(d.id)
      }
    } catch {} finally {
      setForking(false)
    }
  }, [apiBase, selectedSession, events, replayIdx, fetchSessions, selectSession])

  // ── Replay ─────────────────────────────────────────────────

  useEffect(() => {
    if (!replayPlaying || !replayMode) {
      if (replayTimer.current) clearInterval(replayTimer.current)
      return
    }
    replayTimer.current = setInterval(() => {
      setReplayIdx(prev => {
        if (prev >= events.length - 1) {
          setReplayPlaying(false)
          return prev
        }
        return prev + 1
      })
    }, replaySpeed)
    return () => { if (replayTimer.current) clearInterval(replayTimer.current) }
  }, [replayPlaying, replayMode, replaySpeed, events.length])

  // ── Display Events ─────────────────────────────────────────

  const displayEvents = view === "search" && searchResults ? searchResults :
    replayMode ? events.slice(0, replayIdx + 1) : events

  // ── Render ─────────────────────────────────────────────────

  return (
    <div style={{ padding: 20, height: "100%", overflow: "auto" }}>
      {/* Title bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        {view !== "list" && (
          <button
            onClick={() => { setView("list"); setSearchResults(null) }}
            style={{
              padding: "6px 8px", borderRadius: 6, border: "1px solid hsl(var(--border))",
              background: "transparent", cursor: "pointer", color: "hsl(var(--foreground))",
              display: "flex", alignItems: "center",
            }}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <BarChart3 size={22} style={{ color: "hsl(var(--primary))" }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, margin: 0, color: "hsl(var(--foreground))" }}>
          Trajectory
        </h2>
        <button
          onClick={() => { fetchStats(); fetchSessions() }}
          style={{
            marginLeft: "auto", padding: "6px 12px", borderRadius: 6,
            border: "1px solid hsl(var(--border))", background: "transparent",
            cursor: "pointer", fontSize: 12, color: "hsl(var(--muted-foreground))",
            display: "flex", alignItems: "center", gap: 4,
          }}
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} loading={loading} />

      {/* Search */}
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        eventTypes={eventTypes}
        selectedTypes={selectedTypes}
        onTypeToggle={toggleType}
        onSearch={doSearch}
      />

      {/* Main content */}
      <div style={{ display: "flex", gap: 16, minHeight: 400 }}>
        {/* Left: Session List */}
        {(view === "list" || view === "detail") && (
          <div style={{
            width: view === "list" ? "100%" : 300, flexShrink: 0,
            borderRight: view === "detail" ? "1px solid hsl(var(--border))" : "none",
            paddingRight: view === "detail" ? 16 : 0,
          }}>
            {view === "list" ? (
              // Full-width session list
              <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                gap: 8,
              }}>
                {loading ? (
                  <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 13 }}>Loading...</p>
                ) : sessions.length === 0 ? (
                  <div style={{
                    gridColumn: "1 / -1", textAlign: "center", padding: 40,
                    color: "hsl(var(--muted-foreground))",
                  }}>
                    <Activity size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                    <p style={{ fontSize: 14 }}>No trajectory sessions yet</p>
                    <p style={{ fontSize: 12, opacity: 0.7 }}>
                      Sessions will appear here as agents execute tasks
                    </p>
                  </div>
                ) : (
                  sessions.map(s => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      selected={selectedSession === s.id}
                      onSelect={() => selectSession(s.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              // Sidebar session list
              <div>
                {sessions.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    selected={selectedSession === s.id}
                    onSelect={() => selectSession(s.id)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Right: Event Timeline */}
        {(view === "detail" || view === "search") && (
          <div style={{ flex: 1, overflow: "auto" }}>
            {/* Toolbar */}
            {view === "detail" && events.length > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                <button
                  onClick={() => { setReplayMode(!replayMode); setReplayIdx(0); setReplayPlaying(false) }}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12,
                    border: `1px solid ${replayMode ? "hsl(var(--primary))" : "hsl(var(--border))"}`,
                    background: replayMode ? "hsl(var(--primary) / 0.1)" : "transparent",
                    color: replayMode ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                  }}
                >
                  <Play size={12} /> Replay
                </button>
                <button
                  onClick={forkSession}
                  disabled={forking}
                  style={{
                    padding: "5px 12px", borderRadius: 6, fontSize: 12,
                    border: "1px solid hsl(var(--border))", background: "transparent",
                    color: "hsl(var(--muted-foreground))", cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4,
                    opacity: forking ? 0.5 : 1,
                  }}
                >
                  <GitBranch size={12} /> {forking ? "Forking..." : "Fork"}
                </button>
                <div style={{
                  marginLeft: "auto", fontSize: 12, color: "hsl(var(--muted-foreground))",
                  display: "flex", alignItems: "center", gap: 8,
                }}>
                  <span>{events.length} events</span>
                  {selectedSession && (
                    <span style={{
                      padding: "2px 8px", borderRadius: 4, fontSize: 10,
                      background: "hsl(var(--muted))", fontFamily: "monospace",
                    }}>
                      {selectedSession.slice(0, 8)}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Replay Controls */}
            {replayMode && (
              <ReplayControls
                events={events}
                currentIdx={replayIdx}
                onStep={setReplayIdx}
                playing={replayPlaying}
                onTogglePlay={() => setReplayPlaying(!replayPlaying)}
                speed={replaySpeed}
                onSpeedChange={setReplaySpeed}
              />
            )}

            {/* Search results header */}
            {view === "search" && (
              <div style={{
                padding: "8px 12px", marginBottom: 12, borderRadius: 8,
                background: "hsl(var(--muted) / 0.3)",
                border: "1px solid hsl(var(--border))",
                fontSize: 13, color: "hsl(var(--muted-foreground))",
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <Search size={14} />
                {searchResults?.length || 0} results for &ldquo;{query}&rdquo;
                {selectedTypes.size > 0 && ` (filtered: ${Array.from(selectedTypes).join(", ")})`}
              </div>
            )}

            {/* Events */}
            {displayEvents.length === 0 ? (
              <div style={{
                textAlign: "center", padding: 40, color: "hsl(var(--muted-foreground))",
              }}>
                <Activity size={32} style={{ opacity: 0.3, marginBottom: 8 }} />
                <p style={{ fontSize: 14 }}>
                  {view === "search" ? "No matching events" : "No events in this session"}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {displayEvents.map((ev, idx) => (
                  <EventCard
                    key={ev.id || idx}
                    event={ev}
                    idx={replayMode ? replayIdx : idx}
                    total={replayMode ? events.length : displayEvents.length}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

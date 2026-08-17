"use client"

import { useEffect, useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { getApiBaseUrl } from "@/lib/api-client"
import {
import { useTranslation } from 'react-i18next';

  Clock, Search, RefreshCw, Filter, Trash2, ChevronDown, ChevronRight,
  Activity, BarChart3, Layers, FolderSync, AlertCircle, CheckCircle, Info,
  XCircle, Zap, Settings, Database,
} from "lucide-react"

// ── Types ──────────────────────────────────────────────────────

interface TimelineEvent {
  event_id: string
  organ: string
  emoji: string
  event_type: string
  summary: string
  detail: Record<string, unknown>
  timestamp: number
  collected_at: number
  time_ago: string
}

interface TimelineStats {
  total_events: number
  recent_24h: number
  by_organ: Record<string, number>
  by_type: Record<string, number>
  time_range: { earliest: number | null; latest: number | null }
  hourly_distribution: Array<{ hours_ago: number; count: number }>
}

interface OrganInfo {
  organ: string
  emoji: string
  count: number
  last_event: number
  last_event_ago: string
}

interface TypeInfo {
  event_type: string
  count: number
  last_seen: number
}

// ── Helpers ────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  info: "#3b82f6",
  warning: "#f59e0b",
  error: "#ef4444",
  success: "#22c55e",
  health: "#06b6d4",
  system: "#8b5cf6",
  user: "#ec4899",
  agent: "#a855f7",
  task: "#f97316",
  event: "#6366f1",
}

const TYPE_ICONS: Record<string, React.ElementType> = {
  info: Info,
  warning: AlertCircle,
  error: XCircle,
  success: CheckCircle,
  health: Activity,
  system: Settings,
  agent: Zap,
  task: CheckCircle,
}

function getTypeColor(type: string): string {
  for (const [key, color] of Object.entries(TYPE_COLORS)) {
    if (type.toLowerCase().includes(key)) return color
  }
  return "#6b7280"
}

function getTypeIcon(type: string): React.ElementType {
  for (const [key, icon] of Object.entries(TYPE_ICONS)) {
    if (type.toLowerCase().includes(key)) return icon
  }
  return Activity
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000)
  return d.toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

// ── Main Component ─────────────────────────────────────────────

export function TimelineClient() {
  const { t } = useTranslation();
  const api = getApiBaseUrl()

  // Data
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [stats, setStats] = useState<TimelineStats | null>(null)
  const [organs, setOrgans] = useState<OrganInfo[]>([])
  const [types, setTypes] = useState<TypeInfo[]>([])

  // UI state
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterOrgan, setFilterOrgan] = useState<string>("")
  const [filterType, setFilterType] = useState<string>("")
  const [activeTab, setActiveTab] = useState<"events" | "stats" | "organs">("events")
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [syncing, setSyncing] = useState(false)

  // ── Fetch Data ─────────────────────────────────────────────

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (filterOrgan) params.set("organ", filterOrgan)
      if (filterType) params.set("event_type", filterType)
      if (searchQuery) params.set("search", searchQuery)
      params.set("limit", "200")

      const res = await fetch(`${api}/api/timeline/events?${params}`)
      if (!res.ok) throw new Error(`${res.status}`)
      const data = await res.json()
      setEvents(data.events || [])
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to fetch events")
    }
  }, [api, filterOrgan, filterType, searchQuery])

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/timeline/stats`)
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [api])

  const fetchOrgans = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/timeline/organs`)
      if (res.ok) {
        const data = await res.json()
        setOrgans(data.organs || [])
      }
    } catch {}
  }, [api])

  const fetchTypes = useCallback(async () => {
    try {
      const res = await fetch(`${api}/api/timeline/types`)
      if (res.ok) {
        const data = await res.json()
        setTypes(data.types || [])
      }
    } catch {}
  }, [api])

  const loadAll = useCallback(async () => {
    setLoading(true)
    await Promise.all([fetchEvents(), fetchStats(), fetchOrgans(), fetchTypes()])
    setLoading(false)
  }, [fetchEvents, fetchStats, fetchOrgans, fetchTypes])

  useEffect(() => { loadAll() }, [loadAll])

  // ── Actions ────────────────────────────────────────────────

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch(`${api}/api/timeline/sync`, { method: "POST" })
      await loadAll()
    } catch {}
    setSyncing(false)
  }

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await fetch(`${api}/api/timeline/events/${eventId}`, { method: "DELETE" })
      setEvents(prev => prev.filter(e => e.event_id !== eventId))
    } catch {}
  }

  const handleClearOld = async (days: number) => {
    if (!confirm(t('timeline.t17923', { days: days }))) return
    try {
      await fetch(`${api}/api/timeline/cleart('timeline.t30076')${(h.count / maxHourly) * 80}px`, minHeight: h.count > 0 ? "4px" : "0" }}
              />
              {h.hours_ago % 6 === 0 && (
                <span className="text-[9px] text-muted-foreground">{h.hours_ago}h</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* By type */}
      {types.length > 0 && (
        <div className="rounded-lg border border-border p-4">
          <h3 className="text-sm font-medium mb-3">{t('timeline.t47508')}<h3>
          <div className="space-y-2">
            {types.slice(0, 15).map(t => {
              const maxCount = types[0]?.count || 1
              return (
                <div key={t.event_type} className="flex items-center gap-2">
                  <span className="text-xs w-24 truncate text-muted-foreground">{t.event_type}</span>
                  <div className="flex-1 h-4 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full rounded"
                      style={{
                        width: `${(t.count / maxCount) * 100}%`,
                        backgroundColor: getTypeColor(t.event_type),
                        opacity: 0.6,
                      }}
                    />
                  </div>
                  <span className="text-xs font-mono w-10 text-right">{t.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Organs Panel ───────────────────────────────────────────────

function OrgansPanel({ organs, onSelectOrgan }: { organs: OrganInfo[]; onSelectOrgan: (organ: string) => void }) {
  if (organs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Layers className="w-10 h-10 mb-3 opacity-30" />
        <p className="text-sm">{t('timeline.t69997')}<p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {organs.map(o => (
        <button
          key={o.organ}
          onClick={() => onSelectOrgan(o.organ)}
          className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary/30 hover:bg-primary/5 transition-colors text-left"
        >
          <span className="text-2xl">{o.emoji || "🔧"}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{o.organ}</p>
            <p className="text-xs text-muted-foreground">{o.count} {t('timeline.t75541')}{o.last_event_ago}</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        </button>
      ))}
    </div>
  )
}

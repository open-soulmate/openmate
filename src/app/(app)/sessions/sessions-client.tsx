"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  History, Loader2, Search, RefreshCw, Trash2,
  MessageSquare, Clock, ChevronDown, ChevronRight,
  XCircle, Bot, Terminal, Smartphone, Timer,
  Link, Monitor, Wrench, Users, Star, Filter, X,
  Download, FileJson, FileText, Tag, Plus,
} from "lucide-react"
import { Sheet, SheetContent } from "@/components/ui/sheet"
import { useIsMobile } from "@/hooks/use-mobile"

interface Session {
  session_id: string
  title?: string
  user_id?: string
  created_at?: string
  updated_at?: string
  message_count?: number
  status?: string
  source?: string
  tags?: string[]
}

interface Message {
  id: number
  role: string
  content: string
  timestamp?: string
}

interface SessionDetail {
  session_id: string
  title?: string
  messages: Message[]
}

// Source → icon + color (labels come from i18n)
const SOURCE_META: Record<string, { icon: typeof Terminal; color: string; bg: string }> = {
  cli:    { icon: Terminal,    color: "text-green-400",  bg: "bg-green-900/20" },
  weixin: { icon: Smartphone,  color: "text-emerald-400", bg: "bg-emerald-900/20" },
  cron:   { icon: Timer,       color: "text-amber-400",  bg: "bg-amber-900/20" },
  acp:    { icon: Link,        color: "text-blue-400",   bg: "bg-blue-900/20" },
  tui:    { icon: Monitor,     color: "text-purple-400", bg: "bg-purple-900/20" },
  tool:   { icon: Wrench,      color: "text-orange-400", bg: "bg-orange-900/20" },
  subagent: { icon: Users,     color: "text-cyan-400",   bg: "bg-cyan-900/20" },
}

const SOURCE_LABELS: Record<string, string> = {
  cli: "sessions.sourceCli",
  weixin: "sessions.sourceWeixin",
  cron: "sessions.sourceCron",
  acp: "sessions.sourceAcp",
  tui: "sessions.sourceTui",
  tool: "sessions.sourceTool",
  subagent: "sessions.sourceSubagent",
}

const ALL_SOURCES = ["cli", "weixin", "cron", "acp", "tui", "tool", "subagent"]

// localStorage helpers for favorites
function loadFavorites(): Set<string> {
  try {
    const saved = localStorage.getItem("sessions-favorites")
    if (saved) return new Set(JSON.parse(saved))
  } catch {}
  return new Set()
}

function saveFavorites(favs: Set<string>) {
  try { localStorage.setItem("sessions-favorites", JSON.stringify([...favs])) } catch {}
}

function groupBySource(sessions: Session[]) {
  const groups: Record<string, Session[]> = {}
  for (const s of sessions) {
    const src = s.source || "unknown"
    if (!groups[src]) groups[src] = []
    groups[src].push(s)
  }
  return groups
}

export function SessionsClient() {
  const { t } = useTranslation()
  const router = useRouter()
  const apiBase = getApiBaseUrl()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Favorites state
  const [favorites, setFavorites] = useState<Set<string>>(new Set())
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  // Source filter state
  const [activeSourceFilter, setActiveSourceFilter] = useState<string | null>(null)

  // Tag filter state
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null)
  // Mobile: track if we're showing detail view
  const isMobile = useIsMobile()
  const [allTags, setAllTags] = useState<{name: string; count: number}[]>([])

  // Tag input state (for adding tags to sessions)
  const [taggingSession, setTaggingSession] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState("")

  // Expand state: source-level (persisted to localStorage)
  const [agentExpanded, setAgentExpanded] = useState(true)
  const [sourceExpanded, setSourceExpanded] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("sessions-sourceExpanded")
        if (saved) return JSON.parse(saved)
      } catch {}
    }
    return { cli: false, weixin: false, cron: false, acp: false, tui: false, tool: false, subagent: false }
  })

  // Load favorites from localStorage on mount
  useEffect(() => {
    setFavorites(loadFavorites())
  }, [])

  // Persist sourceExpanded to localStorage on change
  useEffect(() => {
    try { localStorage.setItem("sessions-sourceExpanded", JSON.stringify(sourceExpanded)) } catch {}
  }, [sourceExpanded])

  const toggleFavorite = useCallback((sessionId: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      saveFavorites(next)
      return next
    })
  }, [])

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.set("q", searchQuery.trim())
      if (activeTagFilter) params.set("tag", activeTagFilter)
      const qs = params.toString()
      const url = searchQuery.trim()
        ? `${apiBase}/api/sessions/search?${qs}`
        : `${apiBase}/api/sessions${qs ? `?${qs}` : ""}`
      const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
      if (res.ok) {
        const data = await res.json()
        setSessions(Array.isArray(data) ? data : data.sessions || [])
      } else {
        setError(`Failed to load sessions: ${res.status}`)
      }
    } catch (e: unknown) {
      setError(`Sessions error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setLoading(false)
    }
  }, [apiBase, searchQuery, activeTagFilter])

  const fetchSessionDetail = async (sessionId: string) => {
    const session = sessions.find(s => s.session_id === sessionId)
    if (session?.source) {
      setSourceExpanded(prev => {
        if (prev[session.source!]) return prev
        const next: Record<string, boolean> = {}
        for (const key of ALL_SOURCES) next[key] = false
        next[session.source!] = true
        return next
      })
    }
    setDetailLoading(true)
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("openmate-token") : null
      const headers: Record<string, string> = {}
      if (token) headers["Authorization"] = `Bearer ${token}`
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/messages`, { signal: AbortSignal.timeout(10000), headers })
      if (res.ok) {
        const data = await res.json()
        setSelectedSession({
          session_id: sessionId,
          title: sessions.find(s => s.session_id === sessionId)?.title,
          messages: Array.isArray(data) ? data : data.messages || [],
        })
      }
    } catch (e: unknown) {
      console.error("Session detail error:", e)
    } finally {
      setDetailLoading(false)
    }
  }

  const deleteSession = async (sessionId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        setSessions(prev => prev.filter(s => s.session_id !== sessionId))
        // Also remove from favorites if present
        setFavorites(prev => {
          const next = new Set(prev)
          next.delete(sessionId)
          saveFavorites(next)
          return next
        })
        if (selectedSession?.session_id === sessionId) setSelectedSession(null)
        setDeleteConfirm(null)
      } else {
        setError(`Delete failed: ${res.status}`)
      }
    } catch (e: unknown) {
      setError(`Delete error: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  useEffect(() => {
    fetchSessions()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch all available tags
  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/sessions/tags/all`, { signal: AbortSignal.timeout(5000) })
      if (res.ok) {
        const data = await res.json()
        setAllTags(data.tags || [])
      }
    } catch {}
  }, [apiBase])

  useEffect(() => { fetchTags() }, [fetchTags])

  // Add a tag to a session
  const addTag = useCallback(async (sessionId: string, tagName: string) => {
    const name = tagName.trim().toLowerCase()
    if (!name) return
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/tags`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tag_name: name }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        setSessions(prev => prev.map(s =>
          s.session_id === sessionId
            ? { ...s, tags: [...new Set([...(s.tags || []), name])].sort() }
            : s
        ))
        setTagInput("")
        setTaggingSession(null)
        fetchTags()
      }
    } catch {}
  }, [apiBase, fetchTags])

  // Remove a tag from a session
  const removeTag = useCallback(async (sessionId: string, tagName: string) => {
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/tags/${encodeURIComponent(tagName)}`, {
        method: "DELETE",
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) {
        setSessions(prev => prev.map(s =>
          s.session_id === sessionId
            ? { ...s, tags: (s.tags || []).filter(t => t !== tagName) }
            : s
        ))
        fetchTags()
      }
    } catch {}
  }, [apiBase, fetchTags])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchSessions()
  }

  const roleColor = (role: string) => {
    switch (role) {
      case "user": return "text-blue-400"
      case "assistant": return "text-green-400"
      case "system": return "text-yellow-400"
      default: return "text-zinc-400"
    }
  }

  // ── Export helpers ──────────────────────────────────────────
  const exportSession = useCallback((format: "json" | "markdown") => {
    if (!selectedSession) return
    const title = selectedSession.title || selectedSession.session_id
    let content: string
    let ext: string
    let mime: string

    if (format === "json") {
      content = JSON.stringify({
        session_id: selectedSession.session_id,
        title,
        exported_at: new Date().toISOString(),
        message_count: selectedSession.messages.length,
        messages: selectedSession.messages,
      }, null, 2)
      ext = "json"
      mime = "application/json"
    } else {
      const lines = [`# ${title}`, "", `Session: \`${selectedSession.session_id}\``, `Exported: ${new Date().toLocaleString()}`, "", "---", ""]
      for (const msg of selectedSession.messages) {
        const roleLabel = msg.role === "user" ? "**You**" : msg.role === "assistant" ? "**AI**" : `**${msg.role}**`
        const ts = msg.timestamp ? ` _(${new Date(msg.timestamp).toLocaleString()})_` : ""
        lines.push(`### ${roleLabel}${ts}`, "", msg.content, "")
      }
      content = lines.join("\n")
      ext = "md"
      mime = "text/markdown"
    }

    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `session-${selectedSession.session_id}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [selectedSession])

  // Apply filters: favorites + source
  const filteredSessions = useMemo(() => {
    let result = sessions
    if (showFavoritesOnly) {
      result = result.filter(s => favorites.has(s.session_id))
    }
    if (activeSourceFilter) {
      result = result.filter(s => s.source === activeSourceFilter)
    }
    return result
  }, [sessions, showFavoritesOnly, favorites, activeSourceFilter])

  const groups = groupBySource(filteredSessions)
  const totalMessages = filteredSessions.reduce((sum, s) => sum + (s.message_count || 0), 0)
  const favCount = sessions.filter(s => favorites.has(s.session_id)).length

  // Count sessions per source (from unfiltered list)
  const sourceCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      const src = s.source || "unknown"
      counts[src] = (counts[src] || 0) + 1
    }
    return counts
  }, [sessions])

  const activeFilterCount = (showFavoritesOnly ? 1 : 0) + (activeSourceFilter ? 1 : 0) + (activeTagFilter ? 1 : 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-2 lg:px-4 md:px-3 lg:px-6 h-12 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{t("sessions.title", "Sessions")}</h1>
            <p className="text-xs lg:text-sm text-zinc-500">{t("sessions.subtitle", "Browse and manage conversation sessions")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilterCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-900/30 text-cyan-400">
              {activeFilterCount} {t("sessions.filtersActive", "filters")}
            </span>
          )}
          <span className="text-xs lg:text-sm text-zinc-500">{filteredSessions.length} {t("sessions.count", "sessions")}</span>
          <button onClick={fetchSessions} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session List */}
        <div className={`${isMobile ? "flex w-full" : selectedSession ? "flex w-1/3 border-r border-zinc-800" : "flex w-full"} flex-col overflow-hidden transition-all`}>
          {/* Search */}
          <form onSubmit={handleSearch} className="px-3 md:px-2 lg:px-4 h-12 flex items-center border-b border-zinc-800 gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("sessions.searchPlaceholder", "Search sessions...")}
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-xs lg:text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
            </div>
          </form>

          {/* Filter Bar */}
          <div className="px-3 md:px-2 lg:px-4 py-2 border-b border-zinc-800 space-y-2">
            {/* Favorites + clear row */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFavoritesOnly(v => !v)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                  showFavoritesOnly
                    ? "bg-yellow-900/30 text-yellow-400 border border-yellow-700/50"
                    : "bg-zinc-800 text-zinc-500 border border-zinc-700 hover:text-zinc-300 hover:border-zinc-600"
                }`}
              >
                <Star className={`w-3.5 h-3.5 ${showFavoritesOnly ? "fill-yellow-400" : ""}`} />
                {t("sessions.favorites", "Favorites")}
                {favCount > 0 && <span className="text-[10px] opacity-70">({favCount})</span>}
              </button>

              <div className="flex items-center gap-1 ml-1">
                <Filter className="w-3 h-3 text-zinc-600" />
                <span className="text-[10px] text-zinc-600">{t("sessions.source", "Source")}:</span>
              </div>

              {activeFilterCount > 0 && (
                <button
                  onClick={() => { setShowFavoritesOnly(false); setActiveSourceFilter(null); setActiveTagFilter(null) }}
                  className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                  {t("sessions.clearFilters", "Clear")}
                </button>
              )}
            </div>

            {/* Source filter chips */}
            <div className="flex flex-nowrap md:flex-wrap gap-1.5 overflow-x-auto">
              {ALL_SOURCES.map(src => {
                const count = sourceCounts[src] || 0
                if (count === 0) return null
                const meta = SOURCE_META[src]
                const Icon = meta.icon
                const active = activeSourceFilter === src
                return (
                  <button
                    key={src}
                    onClick={() => setActiveSourceFilter(prev => prev === src ? null : src)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                      active
                        ? `${meta.bg} ${meta.color} border border-current/30 font-medium`
                        : "bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {t(SOURCE_LABELS[src] || src)}
                    <span className="opacity-60">{count}</span>
                  </button>
                )
              })}
            </div>

            {/* Tag filter chips */}
            {allTags.length > 0 && (
              <div className="flex flex-nowrap md:flex-wrap gap-1.5 overflow-x-auto">
                <div className="flex items-center gap-1 mr-1">
                  <Tag className="w-3 h-3 text-zinc-600" />
                  <span className="text-[10px] text-zinc-600">{t("sessions.tags", "Tags")}:</span>
                </div>
                {allTags.map(tag => {
                  const active = activeTagFilter === tag.name
                  return (
                    <button
                      key={tag.name}
                      onClick={() => setActiveTagFilter(prev => prev === tag.name ? null : tag.name)}
                      className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors ${
                        active
                          ? "bg-indigo-900/30 text-indigo-400 border border-indigo-700/30 font-medium"
                          : "bg-zinc-800/60 text-zinc-500 border border-zinc-800 hover:text-zinc-300"
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      {tag.name}
                      <span className="opacity-60">{tag.count}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Tree List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
            ) : error ? (
              <div className="p-4 text-center text-red-400 text-xs lg:text-sm">{error}</div>
            ) : filteredSessions.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-zinc-500 text-xs lg:text-sm">
                  {showFavoritesOnly
                    ? t("sessions.noFavorites", "No favorite sessions yet")
                    : t("sessions.noSessions", "No sessions found")}
                </p>
                {showFavoritesOnly && (
                  <button
                    onClick={() => setShowFavoritesOnly(false)}
                    className="text-xs text-cyan-500 hover:text-cyan-400 transition-colors"
                  >
                    {t("sessions.showAll", "Show all sessions")}
                  </button>
                )}
              </div>
            ) : (
              <div className="py-2">
                {/* ── Hermes Agent ── */}
                <button
                  className="w-full flex items-center gap-2 px-2 lg:px-4 py-2.5 hover:bg-zinc-800/40 transition-colors"
                  onClick={() => setAgentExpanded(v => !v)}
                >
                  {agentExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                  <Bot className="w-5 h-5 text-cyan-400" />
                  <span className="text-xs lg:text-sm font-semibold text-zinc-100">Hermes Agent</span>
                  <span className="ml-auto text-xs text-zinc-500">{t("sessions.sessionSummary", { count: filteredSessions.length, messages: totalMessages })}</span>
                </button>

                {agentExpanded && (
                  <div className="ml-2 border-l border-zinc-800">
                    {ALL_SOURCES.map(src => {
                      const items = groups[src]
                      if (!items || items.length === 0) return null
                      const meta = SOURCE_META[src] || { icon: MessageSquare, label: src, color: "text-zinc-400", bg: "bg-zinc-900/20" }
                      const Icon = meta.icon
                      const expanded = sourceExpanded[src] ?? false

                      return (
                        <div key={src}>
                          {/* Source group header */}
                          <button
                            className="w-full flex items-center gap-2 px-2 lg:px-4 py-2 hover:bg-zinc-800/30 transition-colors"
                            onClick={() => setSourceExpanded(prev => {
                              const willExpand = !prev[src]
                              const next: Record<string, boolean> = {}
                              if (willExpand) {
                                for (const key of ALL_SOURCES) next[key] = false
                                next[src] = true
                              }
                              return next
                            })}
                          >
                            {expanded ? <ChevronDown className="w-3.5 h-3.5 text-zinc-600" /> : <ChevronRight className="w-3.5 h-3.5 text-zinc-600" />}
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                            <span className="text-xs font-medium text-zinc-300">{t(SOURCE_LABELS[src] || src)}</span>
                            <span className="ml-auto text-[11px] text-zinc-600">{items.length}</span>
                          </button>

                          {/* Sessions under this source */}
                          {expanded && items.map(session => {
                            const isFav = favorites.has(session.session_id)
                            return (
                              <div
                                key={session.session_id}
                                className={`group flex items-center gap-2 pl-14 pr-4 py-2 cursor-pointer transition-colors ${
                                  selectedSession?.session_id === session.session_id
                                    ? "bg-[rgba(124,58,237,0.12)] text-[#7c3aed] border-l-2 border-[#7c3aed] hover:bg-[rgba(124,58,237,0.18)]"
                                    : "hover:bg-zinc-800/20 border-l-2 border-transparent"
                                }`}
                                onClick={() => fetchSessionDetail(session.session_id)}
                              >
                                {/* Favorite star */}
                                <button
                                  onClick={(e) => { e.stopPropagation(); toggleFavorite(session.session_id) }}
                                  className={`p-0.5 rounded transition-colors flex-shrink-0 ${
                                    isFav
                                      ? "text-yellow-400 hover:text-yellow-300"
                                      : "text-zinc-700 opacity-0 group-hover:opacity-100 hover:text-yellow-400"
                                  }`}
                                  title={isFav ? t("sessions.removeFavorite", "Remove from favorites") : t("sessions.addFavorite", "Add to favorites")}
                                >
                                  <Star className={`w-3.5 h-3.5 ${isFav ? "fill-yellow-400" : ""}`} />
                                </button>

                                <div className="flex-1 min-w-0">
                                  <div className={`text-xs truncate ${
                                    selectedSession?.session_id === session.session_id ? "text-[#7c3aed]" : "text-zinc-300"
                                  }`}>
                                    {session.title || session.session_id.replace(/^20\d{6}_\d{6}_/, "")}
                                  </div>
                                  <div className={`flex items-center gap-2 mt-0.5 text-[10px] ${
                                    selectedSession?.session_id === session.session_id ? "text-purple-400/60" : "text-zinc-600"
                                  }`}>
                                    {session.message_count !== undefined && (
                                      <span className="flex items-center gap-0.5">
                                        <MessageSquare className="w-2.5 h-2.5" /> {session.message_count}
                                      </span>
                                    )}
                                    {session.created_at && (
                                      <span className="flex items-center gap-0.5">
                                        <Clock className="w-2.5 h-2.5" /> {new Date(session.created_at).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                  {/* Tag chips */}
                                  {(session.tags && session.tags.length > 0) && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {session.tags.map(tag => (
                                        <span
                                          key={tag}
                                          onClick={(e) => { e.stopPropagation(); setActiveTagFilter(prev => prev === tag ? null : tag) }}
                                          className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded text-[9px] bg-indigo-900/20 text-indigo-400 border border-indigo-800/30 cursor-pointer hover:bg-indigo-900/40 transition-colors"
                                        >
                                          <Tag className="w-2 h-2" />
                                          {tag}
                                          <button
                                            onClick={(e) => { e.stopPropagation(); removeTag(session.session_id, tag) }}
                                            className="ml-0.5 hover:text-red-400 transition-colors"
                                            title={t("sessions.removeTag", "Remove tag")}
                                          >
                                            <X className="w-2 h-2" />
                                          </button>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {/* Tag input */}
                                  {taggingSession === session.session_id && (
                                    <div className="mt-1" onClick={e => e.stopPropagation()}>
                                      <form
                                        onSubmit={e => { e.preventDefault(); addTag(session.session_id, tagInput) }}
                                        className="flex items-center gap-1"
                                      >
                                        <input
                                          autoFocus
                                          value={tagInput}
                                          onChange={e => setTagInput(e.target.value)}
                                          onKeyDown={e => { if (e.key === "Escape") { setTaggingSession(null); setTagInput("") } }}
                                          placeholder={t("sessions.tagPlaceholder", "tag name...")}
                                          className="w-20 px-1.5 py-0.5 text-[10px] bg-zinc-800 border border-zinc-700 rounded text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                                        />
                                        <button type="submit" className="p-0.5 text-indigo-400 hover:text-indigo-300">
                                          <Plus className="w-3 h-3" />
                                        </button>
                                      </form>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {/* Add tag button */}
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setTaggingSession(prev => prev === session.session_id ? null : session.session_id); setTagInput("") }}
                                    className={`p-1 rounded transition-colors opacity-0 group-hover:opacity-100 ${
                                      taggingSession === session.session_id
                                        ? "bg-indigo-800/30 text-indigo-400"
                                        : "hover:bg-zinc-700 text-zinc-600 hover:text-indigo-400"
                                    }`}
                                    title={t("sessions.addTag", "Add tag")}
                                  >
                                    <Tag className="w-3 h-3" />
                                  </button>
                                  {deleteConfirm === session.session_id ? (
                                    <div className="flex items-center gap-1">
                                      <button onClick={(e) => { e.stopPropagation(); deleteSession(session.session_id) }}
                                        className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 rounded text-[10px] text-white">
                                        {t("sessions.confirmDelete", "OK")}
                                      </button>
                                      <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(null) }}
                                        className="px-1.5 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-[10px] text-zinc-300">
                                        {t("sessions.cancel", "Cancel")}
                                      </button>
                                    </div>
                                  ) : (
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(session.session_id) }}
                                      className="p-1 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Session Detail — Sheet on mobile, inline on desktop */}
        {selectedSession && (
          isMobile ? (
            <Sheet open={!!selectedSession} onOpenChange={(open) => { if (!open) setSelectedSession(null) }}>
              <SheetContent side="right" size="full" className="p-0 flex flex-col sm:w-96">
                <div className="flex items-center justify-between px-2 lg:px-4 h-12 border-b border-zinc-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <MessageSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                    <span className="text-xs lg:text-sm font-medium text-zinc-200 truncate">
                      {selectedSession.title || selectedSession.session_id}
                    </span>
                    <span className="text-xs text-zinc-500 flex-shrink-0">({selectedSession.messages.length} {t("sessions.messages", "messages")})</span>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => router.push(`/chat?session=${selectedSession.session_id}`)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 text-xs transition-colors"
                      title={t("sessions.openChat", "Open in Chat")}>
                      <MessageSquare className="w-3 h-3" />
                    </button>
                    <button onClick={() => exportSession("json")}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Export as JSON">
                      <FileJson className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => exportSession("markdown")}
                      className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                      title="Export as Markdown">
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-2 lg:px-4 py-3 space-y-3">
                  {detailLoading ? (
                    <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                  ) : selectedSession.messages.length === 0 ? (
                    <div className="text-center py-12 text-zinc-500 text-xs lg:text-sm">{t("sessions.noMessages", "No messages in this session")}</div>
                  ) : (
                    selectedSession.messages.map((msg, i) => (
                      <div key={msg.id || i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                        {msg.role !== "user" && (
                          <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                            <span className={`text-xs font-medium ${roleColor(msg.role)}`}>
                              {msg.role === "assistant" ? "AI" : msg.role[0].toUpperCase()}
                            </span>
                          </div>
                        )}
                        <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs lg:text-sm ${
                          msg.role === "user"
                            ? "bg-blue-600/20 text-blue-100"
                            : msg.role === "system"
                            ? "bg-yellow-900/20 text-yellow-200 border border-yellow-800/30"
                            : "bg-zinc-800/50 text-zinc-300"
                        }`}>
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          {msg.timestamp && (
                            <div className="text-[10px] text-zinc-600 mt-1">{new Date(msg.timestamp).toLocaleString()}</div>
                          )}
                        </div>
                        {msg.role === "user" && (
                          <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-medium text-blue-400">U</span>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </SheetContent>
            </Sheet>
          ) : (
            <div className="flex flex-1 flex-col overflow-hidden">
              <div className="flex items-center justify-between px-2 lg:px-4 h-12 border-b border-zinc-800">
                <div className="flex items-center gap-2 min-w-0">
                  <MessageSquare className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                  <span className="text-xs lg:text-sm font-medium text-zinc-200 truncate">
                    {selectedSession.title || selectedSession.session_id}
                  </span>
                  <span className="text-xs text-zinc-500 flex-shrink-0">({selectedSession.messages.length} {t("sessions.messages", "messages")})</span>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => router.push(`/chat?session=${selectedSession.session_id}`)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30 text-xs transition-colors"
                    title={t("sessions.openChat", "Open in Chat")}>
                    <MessageSquare className="w-3 h-3" />
                    {t("sessions.openChat", "Chat")}
                  </button>
                  <button onClick={() => exportSession("json")}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Export as JSON">
                    <FileJson className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => exportSession("markdown")}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Export as Markdown">
                    <FileText className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => setSelectedSession(null)}
                    className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
                    <XCircle className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto px-2 lg:px-4 py-3 space-y-3">
                {detailLoading ? (
                  <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
                ) : selectedSession.messages.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500 text-xs lg:text-sm">{t("sessions.noMessages", "No messages in this session")}</div>
                ) : (
                  selectedSession.messages.map((msg, i) => (
                    <div key={msg.id || i} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}>
                      {msg.role !== "user" && (
                        <div className="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0">
                          <span className={`text-xs font-medium ${roleColor(msg.role)}`}>
                            {msg.role === "assistant" ? "AI" : msg.role[0].toUpperCase()}
                          </span>
                        </div>
                      )}
                      <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-xs lg:text-sm ${
                        msg.role === "user"
                          ? "bg-blue-600/20 text-blue-100"
                          : msg.role === "system"
                          ? "bg-yellow-900/20 text-yellow-200 border border-yellow-800/30"
                          : "bg-zinc-800/50 text-zinc-300"
                      }`}>
                        <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                        {msg.timestamp && (
                          <div className="text-[10px] text-zinc-600 mt-1">{new Date(msg.timestamp).toLocaleString()}</div>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center flex-shrink-0">
                          <span className="text-xs font-medium text-blue-400">U</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  History, Loader2, Search, RefreshCw, Trash2,
  MessageSquare, Clock, ChevronDown, ChevronRight,
  XCircle, Bot, Terminal, Smartphone, Timer,
  Link, Monitor, Wrench, Users,
} from "lucide-react"

interface Session {
  session_id: string
  title?: string
  user_id?: string
  created_at?: string
  updated_at?: string
  message_count?: number
  status?: string
  source?: string
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

function groupByAgent(sessions: Session[]) {
  // All non-cron sessions are from the same agent (Hermes)
  // Group by source
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
  const apiBase = getApiBaseUrl()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  // Expand state: agent-level and source-level (persisted to localStorage)
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

  // Persist sourceExpanded to localStorage on change
  useEffect(() => {
    try { localStorage.setItem("sessions-sourceExpanded", JSON.stringify(sourceExpanded)) } catch {}
  }, [sourceExpanded])

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const url = searchQuery.trim()
        ? `${apiBase}/api/sessions/search?q=${encodeURIComponent(searchQuery.trim())}`
        : `${apiBase}/api/sessions`
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
  }, [apiBase, searchQuery])

  const fetchSessionDetail = async (sessionId: string) => {
    // Auto-expand the source group that contains this session
    const session = sessions.find(s => s.session_id === sessionId)
    if (session?.source) {
      setSourceExpanded(prev => {
        if (prev[session.source!]) return prev // already expanded, no change
        const next: Record<string, boolean> = {}
        for (const key of ALL_SOURCES) next[key] = false
        next[session.source!] = true
        return next
      })
    }
    setDetailLoading(true)
    try {
      const res = await fetch(`${apiBase}/api/sessions/${sessionId}/messages`, { signal: AbortSignal.timeout(10000) })
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

  const groups = groupByAgent(sessions)
  const totalMessages = sessions.reduce((sum, s) => sum + (s.message_count || 0), 0)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 h-12 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-cyan-400" />
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">{t("sessions.title", "Sessions")}</h1>
            <p className="text-sm text-zinc-500">{t("sessions.subtitle", "Browse and manage conversation sessions")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">{sessions.length} {t("sessions.count", "sessions")}</span>
          <button onClick={fetchSessions} className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Session List */}
        <div className={`${selectedSession ? "w-1/3 border-r border-zinc-800" : "w-full"} flex flex-col overflow-hidden transition-all`}>
          {/* Search */}
          <form onSubmit={handleSearch} className="px-4 h-12 flex items-center border-b border-zinc-800">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
              <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder={t("sessions.searchPlaceholder", "Search sessions...")}
                className="w-full pl-10 pr-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-blue-500" />
            </div>
          </form>

          {/* Tree List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
            ) : error ? (
              <div className="p-4 text-center text-red-400 text-sm">{error}</div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-12 text-zinc-500 text-sm">{t("sessions.noSessions", "No sessions found")}</div>
            ) : (
              <div className="py-2">
                {/* ── Hermes Agent ── */}
                <button
                  className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-800/40 transition-colors"
                  onClick={() => setAgentExpanded(v => !v)}
                >
                  {agentExpanded ? <ChevronDown className="w-4 h-4 text-zinc-500" /> : <ChevronRight className="w-4 h-4 text-zinc-500" />}
                  <Bot className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm font-semibold text-zinc-100">Hermes Agent</span>
                  <span className="ml-auto text-xs text-zinc-500">{t("sessions.sessionSummary", { count: sessions.length, messages: totalMessages })}</span>
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
                            className="w-full flex items-center gap-2 px-4 py-2 hover:bg-zinc-800/30 transition-colors"
                            onClick={() => setSourceExpanded(prev => {
                              const willExpand = !prev[src]
                              const next: Record<string, boolean> = {}
                              // Accordion: collapse all, then expand clicked one
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
                          {expanded && items.map(session => (
                            <div
                              key={session.session_id}
                              className={`flex items-center gap-2 pl-14 pr-4 py-2 cursor-pointer transition-colors ${
                                selectedSession?.session_id === session.session_id
                                  ? `${meta.bg} border-l-2 border-cyan-500`
                                  : "hover:bg-zinc-800/20 border-l-2 border-transparent"
                              }`}
                              onClick={() => fetchSessionDetail(session.session_id)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="text-xs text-zinc-300 truncate">
                                  {session.title || session.session_id.replace(/^20\d{6}_\d{6}_/, "")}
                                </div>
                                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-600">
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
                              </div>
                              <div className="flex items-center gap-1">
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
                                    className="p-1 rounded hover:bg-zinc-700 text-zinc-600 hover:text-red-400 transition-colors">
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Session Detail */}
        {selectedSession && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-4 h-12 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-cyan-400" />
                <span className="text-sm font-medium text-zinc-200 truncate">
                  {selectedSession.title || selectedSession.session_id}
                </span>
                <span className="text-xs text-zinc-500">({selectedSession.messages.length} {t("sessions.messages", "messages")})</span>
              </div>
              <button onClick={() => setSelectedSession(null)}
                className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {detailLoading ? (
                <div className="flex items-center justify-center h-40"><Loader2 className="w-5 h-5 animate-spin text-zinc-500" /></div>
              ) : selectedSession.messages.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">{t("sessions.noMessages", "No messages in this session")}</div>
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
                    <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 text-sm ${
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
        )}
      </div>
    </div>
  )
}

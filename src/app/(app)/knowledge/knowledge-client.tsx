"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  BookOpen, Loader2, Trash2, Search, Tag, RefreshCw,
  Pin, PinOff, Star, StarOff, X, Package, Calendar, Tag as TagIcon,
} from "lucide-react"

interface KnowledgeItem {
  id: string
  title: string
  description?: string
  content?: string
  tags?: string[]
  created_at?: string
  pinned?: boolean
  starred?: boolean
  [key: string]: unknown
}

interface KnowledgeStats {
  total?: number
  pinned?: number
  starred?: number
  categories?: number
  [key: string]: unknown
}

export function KnowledgeClient() {
  const { t } = useTranslation()
  const apiBase = getApiBaseUrl()
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [refreshing, setRefreshing] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [itemsRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/api/knowledge/`).then(r => r.json()).catch(() => []),
        fetch(`${apiBase}/api/knowledge/stats`).then(r => r.json()).catch(() => null),
      ])
      setItems(Array.isArray(itemsRes) ? itemsRes : itemsRes.items || [])
      setStats(statsRes)
    } catch {} finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { fetchAll() }, [fetchAll])

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchAll()
    setRefreshing(false)
  }, [fetchAll])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await fetch(`${apiBase}/api/knowledge/${id}`, { method: "DELETE" })
      await fetchAll()
    } catch {}
  }, [apiBase, fetchAll])

  const handlePin = useCallback(async (id: string) => {
    try {
      await fetch(`${apiBase}/api/knowledge/${id}/pin`, { method: "POST" })
      await fetchAll()
    } catch {}
  }, [apiBase, fetchAll])

  const handleStar = useCallback(async (id: string) => {
    try {
      await fetch(`${apiBase}/api/knowledge/${id}/star`, { method: "POST" })
      await fetchAll()
    } catch {}
  }, [apiBase, fetchAll])

  const filtered = items.filter(item => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      item.title.toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q) ||
      (item.content || "").toLowerCase().includes(q) ||
      (item.tags || []).some(tag => tag.toLowerCase().includes(q))
    )
  })

  const pinnedCount = items.filter(i => i.pinned).length
  const starredCount = items.filter(i => i.starred).length

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 max-w-6xl mx-auto space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <div className="p-1.5 lg:p-2 rounded-lg bg-gradient-to-br from-violet-500/20 to-purple-500/20 shrink-0">
            <BookOpen className="w-5 h-5 lg:w-6 lg:h-6 text-violet-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg lg:text-2xl font-bold truncate">{t("knowledge.title") || "Knowledge Base"}</h1>
            <p className="text-xs lg:text-sm text-muted-foreground hidden sm:block">{t("knowledge.subtitle") || "Manage your knowledge items"}</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 lg:gap-2 px-2.5 lg:px-3 py-1.5 lg:py-2 rounded-lg bg-card border border-border text-xs lg:text-sm hover:bg-muted/50 transition-colors disabled:opacity-50 shrink-0 touch-manipulation"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 lg:w-4 lg:h-4", refreshing && "animate-spin")} />
          <span className="hidden sm:inline">{t("common.refresh") || "Refresh"}</span>
        </button>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-3 gap-2 lg:gap-4">
        {[
          { label: t("knowledge.totalItems") || "Total Items", value: stats?.total ?? items.length, icon: Package },
          { label: t("knowledge.pinned") || "Pinned", value: stats?.pinned ?? pinnedCount, icon: Pin },
          { label: t("knowledge.starred") || "Starred", value: stats?.starred ?? starredCount, icon: Star },
        ].map(s => {
          const Icon = s.icon
          return (
            <div key={s.label} className="bg-card border border-border rounded-xl p-2.5 lg:p-4 flex items-center gap-2 lg:gap-3">
              <div className="p-1.5 lg:p-2 rounded-lg bg-muted/30 shrink-0">
                <Icon className="w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <div className="text-lg lg:text-2xl font-bold">{s.value}</div>
                <div className="text-[10px] lg:text-xs text-muted-foreground truncate">{s.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t("knowledge.searchPlaceholder") || "Search knowledge items..."}
          className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 lg:py-2.5 text-xs lg:text-sm outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Knowledge Items Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground/50">
          <Package className="w-12 h-12 mx-auto mb-2" />
          <p className="text-sm">
            {searchQuery
              ? (t("knowledge.noResults") || "No matching knowledge items found")
              : (t("knowledge.empty") || "No knowledge items yet")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
          {filtered.map(item => (
            <div
              key={item.id}
              className="bg-card border border-border rounded-xl p-4 hover:border-border/80 transition-all group"
            >
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-semibold text-xs lg:text-sm truncate">{item.title}</h4>
                    {item.pinned && (
                      <Pin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    )}
                    {item.starred && (
                      <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0" />
                    )}
                  </div>
                  {(item.description || item.content) && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {item.description || item.content}
                    </p>
                  )}
                  {/* Tags */}
                  {item.tags && item.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {item.tags.map(tag => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded text-xs flex items-center gap-1"
                        >
                          <TagIcon className="w-2.5 h-2.5" /> {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Created Date */}
                  {item.created_at && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Calendar className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                {/* Action Buttons — always visible on mobile, hover on desktop */}
                <div className="flex gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handlePin(item.id)}
                    className={cn(
                      "p-1.5 lg:p-1.5 rounded-lg text-xs transition-colors touch-manipulation",
                      item.pinned
                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                    title={item.pinned ? (t("knowledge.unpin") || "Unpin") : (t("knowledge.pin") || "Pin")}
                  >
                    {item.pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleStar(item.id)}
                    className={cn(
                      "p-1.5 lg:p-1.5 rounded-lg text-xs transition-colors touch-manipulation",
                      item.starred
                        ? "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 hover:bg-yellow-500/20"
                        : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
                    )}
                    title={item.starred ? (t("knowledge.unstar") || "Unstar") : (t("knowledge.star") || "Star")}
                  >
                    {item.starred
                      ? <StarOff className="w-3.5 h-3.5" />
                      : <Star className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 lg:p-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors touch-manipulation"
                    title={t("common.delete") || "Delete"}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

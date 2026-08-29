"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import {
  BookOpen, Loader2, Trash2, Search, Tag, RefreshCw,
  Pin, PinOff, Star, StarOff, X, Package, Calendar, Tag as TagIcon,
} from "lucide-react"
import { PageLayout } from '@/components/page-layout';
import { DetailPanel } from '@/components/detail-panel';
import { useAppStore } from '@/stores/app-store';

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
  const [refreshing, setRefreshing] = useState(false)
  const [selectedItem, setSelectedItem] = useState<KnowledgeItem | null>(null)
  const [sidebarSearch, setSidebarSearch] = useState<string>("")
  const setPageSidebar = useAppStore((s) => s.setPageSidebar)
  const setPageWorkspace = useAppStore((s) => s.setPageWorkspace)

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

  // Filtered items for sidebar search
  const sidebarFiltered = items.filter(item => {
    if (!sidebarSearch) return true
    const q = sidebarSearch.toLowerCase()
    return (
      item.title.toLowerCase().includes(q) ||
      (item.description || "").toLowerCase().includes(q) ||
      (item.tags || []).some(tag => tag.toLowerCase().includes(q))
    )
  })

  // Register sidebar content: knowledge items list
  useEffect(() => {
    setPageSidebar(
      <div className="flex flex-col h-full">
        {/* Search */}
        <div className="px-2 pb-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
              placeholder={t("knowledge.searchPlaceholder") || "Search..."}
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-muted/50 rounded-md border border-border/50 focus:outline-none focus:border-violet-500/50 transition-colors"
            />
            {sidebarSearch && (
              <button
                onClick={() => setSidebarSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {/* Items list */}
        <div className="flex-1 overflow-y-auto px-1 space-y-0.5">
          {sidebarFiltered.length === 0 ? (
            <div className="px-2 py-8 text-center text-muted-foreground/50">
              <Package className="w-8 h-8 mx-auto mb-1.5" />
              <p className="text-xs">
                {sidebarSearch
                  ? (t("knowledge.noResults") || "No matches")
                  : (t("knowledge.empty") || "No items yet")}
              </p>
            </div>
          ) : (
            sidebarFiltered.map(item => (
              <button
                key={item.id}
                onClick={() => setSelectedItem(item)}
                className={cn(
                  "w-full text-left px-2 py-2 rounded-lg transition-colors group/item",
                  selectedItem?.id === item.id
                    ? "bg-violet-500/15 border border-violet-500/30"
                    : "hover:bg-muted/50 border border-transparent"
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-medium truncate flex-1">{item.title}</span>
                  {item.pinned && <Pin className="w-3 h-3 text-amber-400 shrink-0" />}
                  {item.starred && <Star className="w-3 h-3 text-yellow-400 fill-yellow-400 shrink-0" />}
                </div>
                {item.tags && item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {item.tags.slice(0, 3).map(tag => (
                      <span
                        key={tag}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20"
                      >
                        {tag}
                      </span>
                    ))}
                    {item.tags.length > 3 && (
                      <span className="text-[10px] text-muted-foreground">+{item.tags.length - 3}</span>
                    )}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    )
    return () => setPageSidebar(null)
  }, [sidebarFiltered, sidebarSearch, selectedItem, t, setPageSidebar])

  // Register workspace content: detail panel for selected item
  useEffect(() => {
    if (!selectedItem) {
      setPageWorkspace(null)
      return
    }
    setPageWorkspace(
      <DetailPanel
        title={selectedItem.title}
        subtitle={selectedItem.description || (selectedItem.content ? selectedItem.content.slice(0, 120) + "..." : undefined)}
        icon={<BookOpen className="w-5 h-5 text-violet-400" />}
        badge={selectedItem.pinned ? (t("knowledge.pinned") || "Pinned") : selectedItem.starred ? (t("knowledge.starred") || "Starred") : undefined}
        onClose={() => setSelectedItem(null)}
        sections={[
          {
            title: t("knowledge.details") || "Details",
            items: [
              { label: "ID", value: selectedItem.id },
              ...(selectedItem.description ? [{ label: t("knowledge.description") || "Description", value: selectedItem.description }] : []),
              ...(selectedItem.created_at ? [{ label: t("knowledge.createdAt") || "Created", value: new Date(selectedItem.created_at).toLocaleString(), icon: <Calendar className="w-3.5 h-3.5" /> }] : []),
            ],
          },
          ...(selectedItem.content ? [{
            title: t("knowledge.content") || "Content",
            items: [{ label: "", value: <div className="text-xs whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{selectedItem.content}</div> }],
          }] : []),
          ...(selectedItem.tags && selectedItem.tags.length > 0 ? [{
            title: t("knowledge.tags") || "Tags",
            items: [{
              label: "",
              value: (
                <div className="flex flex-wrap gap-1">
                  {selectedItem.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded text-xs flex items-center gap-1">
                      <TagIcon className="w-2.5 h-2.5" /> {tag}
                    </span>
                  ))}
                </div>
              ),
            }],
          }] : []),
          {
            title: t("knowledge.status") || "Status",
            items: [
              { label: t("knowledge.pinned") || "Pinned", value: selectedItem.pinned ? "✓" : "—", icon: selectedItem.pinned ? <Pin className="w-3.5 h-3.5 text-amber-400" /> : <PinOff className="w-3.5 h-3.5 text-muted-foreground" /> },
              { label: t("knowledge.starred") || "Starred", value: selectedItem.starred ? "✓" : "—", icon: selectedItem.starred ? <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" /> : <StarOff className="w-3.5 h-3.5 text-muted-foreground" /> },
            ],
          },
        ]}
      />
    )
    return () => setPageWorkspace(null)
  }, [selectedItem, t, setPageWorkspace])

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
      <PageLayout title="Knowledge">
        
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 lg:gap-4">
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

      {/* Selected item preview in main area */}
      {selectedItem && (
        <div className="bg-card border border-border rounded-xl p-3 lg:p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold">{selectedItem.title}</h3>
            {selectedItem.pinned && <Pin className="w-3.5 h-3.5 text-amber-400" />}
            {selectedItem.starred && <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" />}
          </div>
          {(selectedItem.description || selectedItem.content) && (
            <p className="text-xs text-muted-foreground line-clamp-3">{selectedItem.description || selectedItem.content}</p>
          )}
          {selectedItem.tags && selectedItem.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {selectedItem.tags.map(tag => (
                <span key={tag} className="px-2 py-0.5 bg-violet-500/10 text-violet-400 border border-violet-500/20 rounded text-xs">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!selectedItem && (
        <div className="text-center py-12 text-muted-foreground/50">
          <BookOpen className="w-10 h-10 mx-auto mb-2" />
          <p className="text-sm">{t("knowledge.selectFromSidebar") || "Select an item from the sidebar to view details"}</p>
        </div>
      )}
    </div>
  
      </PageLayout>
    )
}

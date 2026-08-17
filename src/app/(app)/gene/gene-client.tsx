"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  Dna, Loader2, Plus, Trash2, Play, Search, Tag, Package,
  ChevronDown, ChevronRight, Copy, CheckCircle, X, Settings,
  Download, Upload, CopyPlus,
} from "lucide-react"

interface Template {
  template_id: string
  name: string
  category: string
  description: string
  version: string
  author: string
  tags: string[]
  config: Record<string, unknown>
  variables: Array<{ name: string; type: string; default?: string; description?: string }>
  usage_count: number
  builtin: boolean
}

interface GeneHealth {
  status: string
  total_templates: number
  builtin_count: number
  user_count: number
  by_category: Record<string, number>
}

type ActiveTab = "browse" | "create" | "instantiate" | "import"

const CATEGORY_COLORS: Record<string, string> = {
  agent: "#3b82f6",
  knowledge_base: "#a855f7",
  workflow: "#22c55e",
  skill: "#eab308",
}

const CATEGORY_LABELS: Record<string, string> = {
  agent: "Agent",
  knowledge_base: t('gene.knowledgeBase'),
  workflow: t('gene.workflow'),
  skill: t('gene.skill'),
}

export function GeneClient() {
  const { t } = useTranslation()
  const apiBase = getApiBaseUrl()

  const [health, setHealth] = useState<GeneHealth | null>(null)
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>("browse")
  const [selectedCategory, setSelectedCategory] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null)

  // Create state
  const [newName, setNewName] = useState("")
  const [newCategory, setNewCategory] = useState("agent")
  const [newDescription, setNewDescription] = useState("")
  const [newTags, setNewTags] = useState("")
  const [newConfig, setNewConfig] = useState("{\n  \n}")
  const [createLoading, setCreateLoading] = useState(false)
  const [createResult, setCreateResult] = useState<{ template_id: string } | null>(null)

  // Instantiate state
  const [instTemplateId, setInstTemplateId] = useState("")
  const [instVariables, setInstVariables] = useState("{}")
  const [instLoading, setInstLoading] = useState(false)
  const [instResult, setInstResult] = useState<Record<string, unknown> | null>(null)

  // Import state
  const [importJson, setImportJson] = useState("")
  const [importLoading, setImportLoading] = useState(false)
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null)
  const [importOverwrite, setImportOverwrite] = useState(false)

  const fetchAll = useCallback(async () => {
    try {
      const [h, t] = await Promise.all([
        fetch(`${apiBase}/api/gene/health`).then(r => r.json()),
        fetch(`${apiBase}/api/gene/templates`).then(r => r.json()).catch(() => ({ templates: [] })),
      ])
      setHealth(h)
      setTemplates(t.templates || t || [])
    } catch {} finally {
      setLoading(false)
    }
  }, [apiBase])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleCreate = useCallback(async () => {
    setCreateLoading(true)
    setCreateResult(null)
    try {
      let config = {}
      try { config = JSON.parse(newConfig) } catch {}
      const tags = newTags.split(",").map(s => s.trim()).filter(Boolean)
      const res = await fetch(`${apiBase}/api/gene/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          category: newCategory,
          description: newDescription,
          tags,
          config,
        }),
      })
      const data = await res.json()
      setCreateResult(data)
      await fetchAll()
    } catch {} finally {
      setCreateLoading(false)
    }
  }, [newName, newCategory, newDescription, newTags, newConfig, apiBase, fetchAll])

  const handleDelete = useCallback(async (templateId: string) => {
    try {
      await fetch(`${apiBase}/api/gene/templates/${templateId}`, { method: "DELETE" })
      await fetchAll()
    } catch {}
  }, [apiBase, fetchAll])

  const handleInstantiate = useCallback(async () => {
    if (!instTemplateId) return
    setInstLoading(true)
    setInstResult(null)
    try {
      let variables = {}
      try { variables = JSON.parse(instVariables) } catch {}
      const res = await fetch(`${apiBase}/api/gene/templates/${instTemplateId}/instantiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variables }),
      })
      setInstResult(await res.json())
    } catch {} finally {
      setInstLoading(false)
    }
  }, [instTemplateId, instVariables, apiBase])

  const handleExport = useCallback(async (templateId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/gene/templates/${templateId}/export`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data.template, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${templateId}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }, [apiBase])

  const handleExportAll = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gene/export?include_builtin=true`)
      const data = await res.json()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `gene-templates-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch {}
  }, [apiBase])

  const handleClone = useCallback(async (templateId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/gene/templates/${templateId}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      if (res.ok) await fetchAll()
    } catch {}
  }, [apiBase, fetchAll])

  const handleImport = useCallback(async () => {
    setImportLoading(true)
    setImportResult(null)
    try {
      let templates: Record<string, unknown>[] = []
      try {
        const parsed = JSON.parse(importJson)
        // Support both single template and bundle format
        if (Array.isArray(parsed)) {
          templates = parsed
        } else if (parsed.templates && Array.isArray(parsed.templates)) {
          templates = parsed.templates
        } else if (parsed.template_id || parsed.name) {
          templates = [parsed]
        }
      } catch {
        setImportResult({ error: t('gene.t06837') })
        return
      }
      const res = await fetch(`${apiBase}/api/gene/importt('gene.t28998')flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-card border border-b-0 border-border text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Browse Tab */}
      {activeTab === "browse" && (
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder=t('gene.t76922')
              className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500/50 transition-all"
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

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedCategory("")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                !selectedCategory
                  ? "bg-foreground text-background"
                  : "bg-muted/30 text-muted-foreground hover:bg-muted/50"
              }`}
            >
              {t('gene.allCategories')}
            <button>
            {categories.map(cat => {
              const color = CATEGORY_COLORS[cat] || "#6b7280"
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(selectedCategory === cat ? "" : cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    selectedCategory === cat
                      ? "text-white"
                      : "text-muted-foreground hover:opacity-80"
                  }`}
                  style={{
                    backgroundColor: selectedCategory === cat ? color : `${color}15`,
                    border: `1px solid ${selectedCategory === cat ? color : `${color}30`}`,
                    color: selectedCategory === cat ? "#fff" : color,
                  }}
                >
                  {CATEGORY_LABELS[cat] || cat} ({health?.by_category?.[cat] ?? 0})
                </button>
              )
            })}
          </div>

          {/* Template Grid */}
          {filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground/50">
              <Package className="w-12 h-12 mx-auto mb-2" />
              <p className="text-sm">{t('gene.noTemplates')}<p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filtered.map(tmpl => {
                const color = CATEGORY_COLORS[tmpl.category] || "#6b7280"
                const expanded = expandedTemplate === tmpl.template_id
                return (
                  <div
                    key={tmpl.template_id}
                    className="bg-card border border-border rounded-xl overflow-hidden hover:border-border/80 transition-all"
                  >
                    <button
                      onClick={() => setExpandedTemplate(expanded ? null : tmpl.template_id)}
                      className="w-full text-left p-4"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{ background: `${color}20`, color, border: `1px solid ${color}40t('gene.t33630')rounded-lg p-3 text-sm ${importResult.error ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`}>
                {importResult.error ? (
                  <span>{String(importResult.error)}</span>
                ) : (
                  <div className="space-y-1">
                    <span>{t('gene.t68220')}{String(importResult.imported)}/{String(importResult.total)} {t('gene.t06679')}</span>
                    {Array.isArray(importResult.results) && (importResult.results as Array<Record<string, string>>).map((r, i) => (
                      <div key={i} className="text-xs opacity-75">
                        {r.success ? "✅" : "❌"} {r.template_id}: {r.message}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export Section */}
          <div className="space-y-4">
            <h3 className="font-semibold flex items-center gap-2">
              <Download className="w-4 h-4" />  {t('gene.t71940')}
            <h3>
            <p className="text-xs text-muted-foreground">
              {t('gene.t48505')}
            <p>
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-muted/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{health?.total_templates ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t('gene.t44357')}<div>
                </div>
                <div className="bg-muted/20 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold">{health?.user_count ?? 0}</div>
                  <div className="text-xs text-muted-foreground">{t('gene.userCreated')}<div>
                </div>
              </div>
              <button
                onClick={handleExportAll}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 text-white rounded-lg font-medium text-sm hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />  {t('gene.t95265')}
              <button>
              <p className="text-xs text-center text-muted-foreground">
                {t('gene.t14472')}
              <p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

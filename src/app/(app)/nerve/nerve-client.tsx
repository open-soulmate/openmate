"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  Zap, Loader2, Activity, Radio, Server, Send, Plus, Trash2,
  RefreshCw, MessageSquare, Clock, Filter, Globe, Wifi, WifiOff,
  ChevronDown, ChevronRight, Copy,
} from "lucide-react"

interface BusStats {
  total_events: number
  total_nodes: number
  online_nodes: number
  total_subscriptions: number
  topics: string[]
}

interface NerveHealth {
  status: string
  component: string
  bus: BusStats
}

interface NerveEvent {
  id: string
  topic: string
  data: Record<string, unknown>
  source: string
  timestamp: string
  delivered_to: string[]
}

interface Subscription {
  id: string
  topic_pattern: string
  callback_url: string
  created_at: string
  delivery_count: number
  last_delivery: string | null
}

interface Node {
  node_id: string
  node_type: string
  status: string
  metadata: Record<string, unknown>
  registered_at: string
  last_heartbeat: string
  event_count: number
}

type ActiveTab = "overview" | "events" | "subscriptions" | "nodes" | "publish"

export function NerveClient() {
  const { t } = useTranslation()
  const apiBase = getApiBaseUrl()

  const [health, setHealth] = useState<NerveHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>("overview")

  // Events state
  const [events, setEvents] = useState<NerveEvent[]>([])
  const [eventTopicFilter, setEventTopicFilter] = useState("")
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null)

  // Subscriptions state
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([])
  const [newSubId, setNewSubId] = useState("")
  const [newSubPattern, setNewSubPattern] = useState("")
  const [newSubCallback, setNewSubCallback] = useState("")

  // Nodes state
  const [nodes, setNodes] = useState<Node[]>([])
  const [newNodeId, setNewNodeId] = useState("")
  const [newNodeType, setNewNodeType] = useState("soma")

  // Publish state
  const [pubTopic, setPubTopic] = useState("")
  const [pubData, setPubData] = useState('{\n  \n}')
  const [pubSource, setPubSource] = useState("")
  const [pubResult, setPubResult] = useState<NerveEvent | null>(null)
  const [pubLoading, setPubLoading] = useState(false)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nerve/health`)
      setHealth(await res.json())
    } catch {}
  }, [apiBase])

  const fetchEvents = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "100" })
      if (eventTopicFilter) params.set("topic", eventTopicFilter)
      const res = await fetch(`${apiBase}/api/nerve/events?${params}`)
      const data = await res.json()
      setEvents(data.events || [])
    } catch {}
  }, [apiBase, eventTopicFilter])

  const fetchSubscriptions = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nerve/subscriptions`)
      const data = await res.json()
      setSubscriptions(data.subscriptions || [])
    } catch {}
  }, [apiBase])

  const fetchNodes = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nerve/nodes`)
      const data = await res.json()
      setNodes(data.nodes || [])
    } catch {}
  }, [apiBase])

  useEffect(() => {
    Promise.all([fetchHealth(), fetchEvents(), fetchSubscriptions(), fetchNodes()])
      .finally(() => setLoading(false))
  }, [fetchHealth, fetchEvents, fetchSubscriptions, fetchNodes])

  // Auto-refresh events
  useEffect(() => {
    if (activeTab !== "events") return
    const interval = setInterval(fetchEvents, 5000)
    return () => clearInterval(interval)
  }, [activeTab, fetchEvents])

  const handlePublish = useCallback(async () => {
    setPubLoading(true)
    setPubResult(null)
    try {
      let data = {}
      try { data = JSON.parse(pubData) } catch {}
      const res = await fetch(`${apiBase}/api/nerve/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: pubTopic, data, source: pubSource }),
      })
      setPubResult(await res.json())
      await fetchEvents()
      await fetchHealth()
    } catch {} finally {
      setPubLoading(false)
    }
  }, [pubTopic, pubData, pubSource, apiBase, fetchEvents, fetchHealth])

  const handleSubscribe = useCallback(async () => {
    if (!newSubId || !newSubPattern) return
    try {
      await fetch(`${apiBase}/api/nerve/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriber_id: newSubId,
          topic_pattern: newSubPattern,
          callback_url: newSubCallback,
        }),
      })
      setNewSubId("")
      setNewSubPattern("")
      setNewSubCallback("")
      await fetchSubscriptions()
    } catch {}
  }, [newSubId, newSubPattern, newSubCallback, apiBase, fetchSubscriptions])

  const handleUnsubscribe = useCallback(async (id: string) => {
    try {
      await fetch(`${apiBase}/api/nerve/subscribe/${id}`, { method: "DELETE" })
      await fetchSubscriptions()
    } catch {}
  }, [apiBase, fetchSubscriptions])

  const handleRegisterNode = useCallback(async () => {
    if (!newNodeId) return
    try {
      await fetch(`${apiBase}/api/nerve/nodes/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: newNodeId, node_type: newNodeType }),
      })
      setNewNodeId("")
      await fetchNodes()
    } catch {}
  }, [newNodeId, newNodeType, apiBase, fetchNodes])

  const handleRemoveNode = useCallback(async (nodeId: string) => {
    try {
      await fetch(`${apiBase}/api/nerve/nodes/${nodeId}`, { method: "DELETE" })
      await fetchNodes()
    } catch {}
  }, [apiBase, fetchNodes])

  const handleHeartbeat = useCallback(async (nodeId: string) => {
    try {
      await fetch(`${apiBase}/api/nerve/nodes/heartbeatt('nerve.t90525')bg-card border border-${s.color}-500/20 rounded-xl p-4`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 text-${s.color}-400`} />
                <span className="text-xs text-muted-foreground">{s.label}</span>
              </div>
              <div className="text-2xl font-bold">{s.value}</div>
            </div>
          )
        })}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-card border border-b-0 border-border text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }t('nerve.t12630') · ${sub.callback_url}t('nerve.t63003')w-2.5 h-2.5 rounded-full ${node.status === "online" ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                    <Server className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{node.node_id}</span>
                        <span className="px-2 py-0.5 bg-muted/50 rounded text-xs">{node.node_type}</span>
                        <span className={`text-xs ${node.status === "online" ? "text-green-400" : "text-muted-foreground"}`}>
                          {node.status}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {t('nerve.t94994')}: {formatTime(node.registered_at)}
                        {node.last_heartbeat && t('nerve.t73134', { lastheartbeat: formatTime(node.last_heartbeat) })}
                      </div>
                    </div>
                    <button
                      onClick={() => handleHeartbeat(node.node_id)}
                      className="px-2 py-1 text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded hover:bg-blue-500/20 transition-colors"
                    >
                      {t('nerve.t18067')}
                    <button>
                    <button
                      onClick={() => handleRemoveNode(node.node_id)}
                      className="text-red-400 hover:text-red-300 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Publish Tab */}
      {activeTab === "publish" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <h3 className="font-semibold">{t('nerve.publishEvent')}<h3>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Topic *</label>
              <input
                type="text"
                value={pubTopic}
                onChange={(e) => setPubTopic(e.target.value)}
                placeholder=t('nerve.t23417')
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('search.source')}<label>
              <input
                type="text"
                value={pubSource}
                onChange={(e) => setPubSource(e.target.value)}
                placeholder=t('nerve.t04967')
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('nerve.t06701')}<label>
              <textarea
                value={pubData}
                onChange={(e) => setPubData(e.target.value)}
                rows={8}
                className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm font-mono resize-none"
              />
            </div>
            <button
              onClick={handlePublish}
              disabled={!pubTopic || pubLoading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-blue-600 hover:to-purple-600 transition-all flex items-center justify-center gap-2"
            >
              {pubLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {pubLoading ? t('nerve.t04818') : t('nerve.publishEvent')}
            </button>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">{t('nerve.t16342')}<h3>
            <div className="min-h-[300px] bg-card border border-border rounded-xl p-4">
              {pubResult ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-green-400">
                    <Activity className="w-4 h-4" />
                    <span className="text-sm font-medium">{t('nerve.t10017')}<span>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID</span>
                      <span className="font-mono">{pubResult.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Topic</span>
                      <span className="font-mono text-blue-400">{pubResult.topic}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('nerve.t59123')}<span>
                      <span>{pubResult.delivered_to.length} subscribers</span>
                    </div>
                  </div>
                  <pre className="text-xs font-mono bg-background/50 rounded p-2 overflow-x-auto">
                    {JSON.stringify(pubResult, null, 2)}
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                  <Send className="w-12 h-12 mb-2" />
                  <p className="text-sm">{t('nerve.t86634')}<p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Zap, Send, Server, Radio, RefreshCw, Plus, Trash2,
  Activity, Globe, Clock, Wifi, WifiOff, MessageSquare,
} from "lucide-react";

interface NerveEvent {
  id: string;
  topic: string;
  data: Record<string, unknown>;
  source: string;
  timestamp: string;
  delivered_to: string[];
}

interface NerveNode {
  node_id: string;
  node_type: string;
  status: string;
  metadata: Record<string, unknown>;
  registered_at: string;
  last_heartbeat: string;
  event_count: number;
}

interface NerveStats {
  total_events: number;
  total_nodes: number;
  online_nodes: number;
  total_subscriptions: number;
  topics: string[];
}

export function NerveClient() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<NerveStats | null>(null);
  const [events, setEvents] = useState<NerveEvent[]>([]);
  const [nodes, setNodes] = useState<NerveNode[]>([]);
  const [publishTopic, setPublishTopic] = useState("");
  const [publishData, setPublishData] = useState("{\n  \n}");
  const [publishSource, setPublishSource] = useState("openmate");
  const [regNodeId, setRegNodeId] = useState("");
  const [regNodeType, setRegNodeType] = useState("soma");
  const [publishing, setPublishing] = useState(false);
  const apiBase = getApiBaseUrl();

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, eventsRes, nodesRes] = await Promise.all([
        fetch(`${apiBase}/api/nerve/stats`),
        fetch(`${apiBase}/api/nerve/events?limit=50`),
        fetch(`${apiBase}/api/nerve/nodes`),
      ]);
      const [statsData, eventsData, nodesData] = await Promise.all([
        statsRes.json(), eventsRes.json(), nodesRes.json(),
      ]);
      setStats(statsData);
      setEvents(eventsData.events || []);
      setNodes(nodesData.nodes || []);
    } catch (e) {
      console.error("Failed to fetch nerve data", e);
    }
  }, [apiBase]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handlePublish = async () => {
    if (!publishTopic.trim()) return;
    setPublishing(true);
    try {
      let data = {};
      try { data = JSON.parse(publishData); } catch {}
      await fetch(`${apiBase}/api/nerve/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: publishTopic, data, source: publishSource }),
      });
      setPublishTopic("");
      await fetchAll();
    } catch (e) {
      console.error("Publish failed", e);
    } finally {
      setPublishing(false);
    }
  };

  const handleRegisterNode = async () => {
    if (!regNodeId.trim()) return;
    try {
      await fetch(`${apiBase}/api/nerve/nodes/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: regNodeId, node_type: regNodeType }),
      });
      setRegNodeId("");
      await fetchAll();
    } catch (e) {
      console.error("Register failed", e);
    }
  };

  const handleHeartbeat = async (nodeId: string) => {
    try {
      await fetch(`${apiBase}/api/nerve/nodes/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: nodeId }),
      });
      await fetchAll();
    } catch (e) {
      console.error("Heartbeat failed", e);
    }
  };

  const handleRemoveNode = async (nodeId: string) => {
    try {
      await fetch(`${apiBase}/api/nerve/nodes/${nodeId}`, { method: "DELETE" });
      await fetchAll();
    } catch (e) {
      console.error("Remove node failed", e);
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("zh-CN", {
        month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-yellow-500" />
          <h1 className="text-lg font-semibold">{t("nerve.title") || "神经 · 事件总线"}</h1>
          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-xs font-medium text-yellow-500">
            {t("nerve.subtitle") || "Pub/Sub · 节点 · 消息"}
          </span>
        </div>
        <button
          onClick={fetchAll}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
        >
          <RefreshCw size={14} />
          {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={MessageSquare} label="总事件" value={String(stats.total_events)} sub="已发布事件" color="text-blue-500" bg="bg-blue-500/10" />
            <StatCard icon={Server} label="节点数" value={String(stats.total_nodes)} sub={`${stats.online_nodes} 在线`} color="text-emerald-500" bg="bg-emerald-500/10" />
            <StatCard icon={Radio} label="订阅数" value={String(stats.total_subscriptions)} sub="活跃订阅" color="text-amber-500" bg="bg-amber-500/10" />
            <StatCard icon={Globe} label="主题数" value={String(stats.topics.length)} sub={stats.topics.slice(0, 3).join(", ") || "无"} color="text-violet-500" bg="bg-violet-500/10" />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Publish Panel */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Send size={14} className="text-primary" />
              发布事件
            </h3>
            <input
              value={publishTopic}
              onChange={(e) => setPublishTopic(e.target.value)}
              placeholder="Topic (e.g. soma.data.update)"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <input
              value={publishSource}
              onChange={(e) => setPublishSource(e.target.value)}
              placeholder="Source"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <textarea
              value={publishData}
              onChange={(e) => setPublishData(e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm font-mono outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
            <button
              onClick={handlePublish}
              disabled={publishing || !publishTopic.trim()}
              className="w-full rounded-lg bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {publishing ? "发送中..." : "发布事件"}
            </button>
          </div>

          {/* Node Registration */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Server size={14} className="text-emerald-500" />
              注册节点
            </h3>
            <input
              value={regNodeId}
              onChange={(e) => setRegNodeId(e.target.value)}
              placeholder="Node ID (e.g. soma-001)"
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            />
            <select
              value={regNodeType}
              onChange={(e) => setRegNodeType(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="soma">Soma (躯体)</option>
              <option value="sense">Sense (感官)</option>
              <option value="vein">Vein (血管)</option>
              <option value="nerve">Nerve (神经)</option>
              <option value="custom">Custom</option>
            </select>
            <button
              onClick={handleRegisterNode}
              disabled={!regNodeId.trim()}
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              <Plus size={14} className="inline mr-1" />
              注册节点
            </button>

            {/* Node List */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {nodes.map((node) => (
                <div key={node.node_id} className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    {node.status === "online" ? (
                      <Wifi size={14} className="text-emerald-500" />
                    ) : (
                      <WifiOff size={14} className="text-red-500" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{node.node_id}</p>
                      <p className="text-xs text-muted-foreground">{node.node_type} · {node.status}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleHeartbeat(node.node_id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                      title="发送心跳"
                    >
                      <Activity size={14} />
                    </button>
                    <button
                      onClick={() => handleRemoveNode(node.node_id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
                      title="移除节点"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {nodes.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">暂无注册节点</p>
              )}
            </div>
          </div>
        </div>

        {/* Event Stream */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <Activity size={14} className="text-yellow-500" />
            事件流
            <span className="text-xs text-muted-foreground font-normal">最近 {events.length} 条</span>
          </h3>
          {events.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">暂无事件，发布一个试试</p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {events.map((evt) => (
                <div key={evt.id} className="flex items-start gap-3 rounded-lg border border-border p-3 text-sm">
                  <div className="shrink-0 mt-0.5">
                    <div className={cn(
                      "h-2 w-2 rounded-full",
                      evt.delivered_to.length > 0 ? "bg-emerald-500" : "bg-muted-foreground"
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">{evt.topic}</span>
                      {evt.source && <span className="text-xs text-muted-foreground">from {evt.source}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate font-mono">
                      {JSON.stringify(evt.data)}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                      <span className="flex items-center gap-1"><Clock size={10} />{formatTime(evt.timestamp)}</span>
                      <span>→ {evt.delivered_to.length} subscribers</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color, bg }: {
  icon: React.ElementType; label: string; value: string; sub: string; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bg)}>
          <Icon size={14} className={color} />
        </div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}

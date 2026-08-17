"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Bot, RefreshCw, Plus, Trash2, Activity, Settings,
  CheckCircle, XCircle, Clock, Wifi, WifiOff, Zap,
  Server, Plug, ArrowRight, AlertTriangle, Info,
} from "lucide-react";

interface SomaComponent {
  component_id: string;
  name: string;
  component_type: string;
  version: string;
  capabilities: string[];
  status: string;
  registered_at: string;
  last_heartbeat: string;
  data_push_count: number;
  error_count: number;
  last_error: string | null;
  metadata: Record<string, unknown>;
}

interface PlatformCapabilities {
  platform: string;
  version: string;
  capabilities: Record<string, unknown>;
  api_version: string;
  endpoints: Record<string, string>;
}

const TYPE_COLORS: Record<string, string> = {
  collector: "text-blue-500 bg-blue-500/10",
  processor: "text-violet-500 bg-violet-500/10",
  connector: "text-emerald-500 bg-emerald-500/10",
  agent: "text-amber-500 bg-amber-500/10",
  custom: "text-gray-500 bg-gray-500/10",
};

const STATUS_COLORS: Record<string, string> = {
  online: "text-emerald-500",
  offline: "text-red-500",
  busy: "text-amber-500",
  error: "text-red-500",
  maintenance: "text-gray-500",
};

function formatTime(iso: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return d.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SomaConnectorClient() {
  const { t } = useTranslation();
  const [components, setComponents] = useState<SomaComponent[]>([]);
  const [health, setHealth] = useState<any>(null);
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(null);
  const [selected, setSelected] = useState<SomaComponent | null>(null);
  const [showRegister, setShowRegister] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const apiBase = getApiBaseUrl();

  // Register form state
  const [regId, setRegId] = useState("");
  const [regName, setRegName] = useState("");
  const [regType, setRegType] = useState("collector");
  const [regVersion, setRegVersion] = useState("0.1.0");
  const [regCaps, setRegCaps] = useState("");
  const [nerveNodes, setNerveNodes] = useState<any[]>([]);

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/soma/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchComponents = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/soma/components`);
      const data = await res.json();
      setComponents(data.components || []);
    } catch {}
  }, [apiBase]);

  const fetchNerveNodes = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nerve/nodes`);
      const data = await res.json();
      setNerveNodes(data.nodes || []);
    } catch {}
  }, [apiBase]);

  const fetchCapabilities = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/soma/capabilities`);
      setCapabilities(await res.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    fetchComponents();
    fetchNerveNodes();
    fetchCapabilities();
  }, [fetchHealth, fetchComponents, fetchNerveNodes, fetchCapabilities]);

  const handleRegister = async () => {
    if (!regId.trim() || !regName.trim()) return;
    setLoading(true);
    try {
      const caps = regCaps.split(",").map(c => c.trim()).filter(Boolean);
      const res = await fetch(`${apiBase}/api/soma/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          component_id: regId,
          name: regName,
          component_type: regType,
          version: regVersion,
          capabilities: caps,
        }),
      });
      if (res.ok) {
        setShowRegister(false);
        setRegId(""); setRegName(""); setRegCaps("");
        fetchComponents();
        fetchHealth();
      }
    } catch {} finally { setLoading(false); }
  };

  const handleUnregister = async (id: string) => {
    if (!confirm("确定注销此组件？")) return;
    try {
      await fetch(`${apiBase}/api/soma/components/${id}`, { method: "DELETE" });
      setSelected(null);
      fetchComponents();
      fetchHealth();
    } catch {}
  };

  const handleHeartbeat = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/soma/heartbeat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ component_id: id, status: "ok" }),
      });
      fetchComponents();
    } catch {}
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Bot size={20} className="text-cyan-500" />
          <h1 className="text-lg font-semibold">躯体 · 外部组件连接</h1>
          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-500">
            即插即用
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowCapabilities(!showCapabilities)}
            className={cn("flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors",
              showCapabilities ? "bg-cyan-500 text-white" : "border border-border hover:bg-muted")}>
            <Info size={14} /> 平台能力
          </button>
          <button onClick={() => setShowRegister(true)}
            className="flex items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-sm text-white hover:bg-cyan-600">
            <Plus size={14} /> 注册组件
          </button>
          <button onClick={() => { fetchHealth(); fetchComponents(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">已注册组件</span>
              <p className="text-2xl font-bold">{health.registry?.total || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">在线</span>
              <p className="text-2xl font-bold text-emerald-500">{health.registry?.online || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">离线</span>
              <p className="text-2xl font-bold text-red-500">{health.registry?.offline || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">类型分布</span>
              <p className="text-xs font-mono mt-1">
                {Object.entries(health.registry?.by_type || {}).map(([k, v]) => `${k}:${v}`).join(" · ") || "无"}
              </p>
            </div>
          </div>
        )}

        {/* Platform Capabilities */}
        {showCapabilities && capabilities && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Info size={14} className="text-cyan-500" />
              平台能力发现 — {capabilities.platform} v{capabilities.version}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(capabilities.capabilities).map(([key, value]) => (
                <div key={key} className="flex items-center gap-2 text-xs">
                  {value === true ? (
                    <CheckCircle size={12} className="text-emerald-500" />
                  ) : (
                    <span className="font-mono text-muted-foreground">{String(value)}</span>
                  )}
                  <span>{key}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-3">
              <h4 className="text-xs text-muted-foreground mb-2">API 端点</h4>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(capabilities.endpoints).map(([name, path]) => (
                  <div key={name} className="flex items-center gap-2 text-xs">
                    <span className="text-cyan-500 font-medium">{name}</span>
                    <span className="font-mono text-muted-foreground">{path}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Start Guide */}
        <div className="rounded-xl border border-dashed border-cyan-500/30 bg-cyan-500/5 p-5">
          <h3 className="text-sm font-semibold text-cyan-600 mb-2">🚀 快速接入指南</h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>外部组件只需实现3个API即可接入OpenSoul生态系统：</p>
            <div className="font-mono bg-background rounded p-3 text-[11px] space-y-1">
              <p><span className="text-cyan-500">1.</span> POST /api/soma/register — 启动时注册自己</p>
              <p><span className="text-cyan-500">2.</span> POST /api/soma/heartbeat — 每30秒发送心跳</p>
              <p><span className="text-cyan-500">3.</span> POST /api/soma/push — 推送采集数据</p>
              <p className="pt-1 text-muted-foreground"><span className="text-cyan-500">发现:</span> GET /api/soma/capabilities — 自动发现平台能力</p>
            </div>
          </div>
        </div>

        {/* Component List */}
        <div className="flex gap-6">
          <div className="w-80 space-y-3">
            {components.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Plug size={40} className="mb-3 opacity-30" />
                <p className="text-sm">暂无已注册组件</p>
                <p className="text-xs mt-1">点击"注册组件"或让外部组件自行注册</p>
              </div>
            ) : components.map((c) => (
              <div key={c.component_id}
                onClick={() => setSelected(c)}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 cursor-pointer transition-all hover:shadow-md",
                  selected?.component_id === c.component_id && "ring-2 ring-cyan-500"
                )}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={cn("rounded-lg p-1.5", TYPE_COLORS[c.component_type] || TYPE_COLORS.custom)}>
                      <Bot size={14} />
                    </div>
                    <span className="font-medium text-sm">{c.name}</span>
                  </div>
                  <span className={cn("text-xs font-medium", STATUS_COLORS[c.status] || "text-muted-foreground")}>
                    {c.status === "online" ? "● 在线" : c.status === "offline" ? "○ 离线" : c.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground font-mono">{c.component_id}</div>
                <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                  <span>v{c.version}</span>
                  <span>推送: {c.data_push_count}</span>
                  {c.error_count > 0 && <span className="text-red-500">错误: {c.error_count}</span>}
                </div>
              </div>
            ))}

            {/* Nerve Bus Nodes */}
            {nerveNodes.length > 0 && (
              <>
                <div className="pt-3 border-t border-border">
                  <p className="text-xs font-medium text-muted-foreground mb-2">⚡ Nerve Bus Nodes</p>
                </div>
                {nerveNodes.map((n: any) => (
                  <div key={n.node_id}
                    className="rounded-xl border border-border bg-card p-4 transition-all hover:shadow-md">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <div className="rounded-lg p-1.5 text-emerald-500 bg-emerald-500/10">
                          <Server size={14} />
                        </div>
                        <span className="font-medium text-sm">{n.node_id}</span>
                      </div>
                      <span className={cn("text-xs font-medium", n.status === "online" ? "text-emerald-500" : "text-red-500")}>
                        {n.status === "online" ? "● 在线" : "○ 离线"}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-mono">{n.node_type}</div>
                    <div className="flex gap-3 mt-2 text-xs text-muted-foreground">
                      {n.metadata?.runtime && <span>🔧 {n.metadata.runtime}</span>}
                      {n.metadata?.version && <span>v{n.metadata.version}</span>}
                      <span>事件: {n.event_count || 0}</span>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Detail Panel */}
          {selected && (
            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold">{selected.name}</h3>
                  <span className="text-xs text-muted-foreground font-mono">{selected.component_id}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleHeartbeat(selected.component_id)}
                    className="flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
                    <Zap size={12} /> 发送心跳
                  </button>
                  <button onClick={() => handleUnregister(selected.component_id)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10">
                    <Trash2 size={12} /> 注销
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">类型:</span> {selected.component_type}</div>
                <div><span className="text-muted-foreground">版本:</span> v{selected.version}</div>
                <div><span className="text-muted-foreground">注册时间:</span> {formatTime(selected.registered_at)}</div>
                <div><span className="text-muted-foreground">最后心跳:</span> {formatTime(selected.last_heartbeat)}</div>
                <div><span className="text-muted-foreground">数据推送:</span> {selected.data_push_count} 次</div>
                <div><span className="text-muted-foreground">错误次数:</span> {selected.error_count}</div>
              </div>

              {/* Capabilities */}
              {selected.capabilities.length > 0 && (
                <div>
                  <h4 className="text-xs text-muted-foreground mb-2">能力标签</h4>
                  <div className="flex flex-wrap gap-2">
                    {selected.capabilities.map((cap) => (
                      <span key={cap} className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-600">
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Error Info */}
              {selected.last_error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                  <div className="flex items-center gap-2 text-xs text-red-500">
                    <AlertTriangle size={12} />
                    <span className="font-medium">最近错误</span>
                  </div>
                  <p className="text-xs text-red-400 mt-1">{selected.last_error}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Register Modal */}
        {showRegister && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold">注册外部组件</h3>
              <input value={regId} onChange={(e) => setRegId(e.target.value)}
                placeholder="组件ID (如 opensoma-001)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={regName} onChange={(e) => setRegName(e.target.value)}
                placeholder="组件名称" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select value={regType} onChange={(e) => setRegType(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="collector">采集器 (Collector)</option>
                <option value="processor">处理器 (Processor)</option>
                <option value="connector">连接器 (Connector)</option>
                <option value="agent">Agent</option>
                <option value="custom">自定义</option>
              </select>
              <input value={regVersion} onChange={(e) => setRegVersion(e.target.value)}
                placeholder="版本号" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={regCaps} onChange={(e) => setRegCaps(e.target.value)}
                placeholder="能力标签 (逗号分隔，如 file_watch,rss,feishu)" className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowRegister(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
                <button onClick={handleRegister} disabled={loading || !regId.trim() || !regName.trim()}
                  className="rounded-lg bg-cyan-500 px-4 py-2 text-sm text-white hover:bg-cyan-600 disabled:opacity-50">
                  {loading ? "注册中..." : "注册"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

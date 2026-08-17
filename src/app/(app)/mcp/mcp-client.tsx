"use client";
import { useState, useEffect, useCallback } from "react";
import {
  Plug,
  PlugZap,
  Search,
  Wrench,
  Check,
  X,
  RefreshCw,
  Plus,
  Trash2,
  Edit3,
  Power,
  PowerOff,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  ChevronRight,
  Server,
  Settings,
} from "lucide-react";
import { getApiBaseUrl, getToken } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

interface McpTool {
  name: string;
  description: string;
  inputSchema?: Record<string, unknown>;
}

interface McpServer {
  id: string;
  name: string;
  description: string;
  url: string;
  transport: string;
  connected: boolean;
  enabled: boolean;
  tools: McpTool[];
  config: Record<string, unknown>;
  created_at: number;
  last_connected: number | null;
  error: string | null;
}

export function McpClient() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAdd, setShowAdd] = useState(false);
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [stats, setStats] = useState({ total_servers: 0, connected: 0, disconnected: 0, total_tools: 0 });

  // New server form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTransport, setNewTransport] = useState("stdio");

  const apiBase = getApiBaseUrl();
  const headers = { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" };

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/mcp/servers`, { headers });
      if (res.ok) {
        const data = await res.json();
        setServers(data.servers || []);
      }
    } catch (e) {
      console.error("Failed to fetch MCP servers:", e);
    }
    setLoading(false);
  }, [apiBase]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/mcp/stats`, { headers });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchServers();
    fetchStats();
  }, [fetchServers, fetchStats]);

  const filtered = servers.filter((s) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.tools.some((t) => t.name.toLowerCase().includes(q))
    );
  });

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Actions ────────────────────────────────────────────

  const handleConnect = async (server: McpServer) => {
    setActionLoading((prev) => ({ ...prev, [server.id]: server.connected ? "disconnect" : "connect" }));
    try {
      const endpoint = server.connected ? "disconnect" : "connect";
      const res = await fetch(`${apiBase}/api/mcp/servers/${server.id}/${endpoint}`, {
        method: "POST",
        headers,
      });
      if (res.ok) {
        showToast(`${server.name} ${server.connected ? "已断开" : "已连接"}`, "success");
        fetchServers();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.detail || "操作失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
    setActionLoading((prev) => ({ ...prev, [server.id]: "" }));
  };

  const handleDelete = async (server: McpServer) => {
    if (!confirm(`确定删除 MCP 服务器 "${server.name}"？`)) return;
    try {
      const res = await fetch(`${apiBase}/api/mcp/servers/${server.id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        showToast(`${server.name} 已删除`, "success");
        fetchServers();
        fetchStats();
      }
    } catch {
      showToast("删除失败", "error");
    }
  };

  const handleAdd = async () => {
    if (!newName || !newUrl) {
      showToast("名称和URL必填", "error");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/mcp/servers`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newName,
          url: newUrl,
          description: newDesc,
          transport: newTransport,
        }),
      });
      if (res.ok) {
        showToast(`${newName} 已添加`, "success");
        setShowAdd(false);
        setNewName("");
        setNewUrl("");
        setNewDesc("");
        setNewTransport("stdio");
        fetchServers();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.detail || "添加失败", "error");
      }
    } catch {
      showToast("网络错误", "error");
    }
  };

  const handleToggleEnabled = async (server: McpServer) => {
    try {
      const res = await fetch(`${apiBase}/api/mcp/servers/${server.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ enabled: !server.enabled }),
      });
      if (res.ok) {
        showToast(`${server.name} 已${server.enabled ? "禁用" : "启用"}`, "success");
        fetchServers();
      }
    } catch {
      showToast("操作失败", "error");
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.type === "success" ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Plug size={18} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">MCP Servers</h1>
            <p className="text-xs text-muted-foreground">Model Context Protocol 服务管理</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Stats badges */}
          <div className="hidden md:flex items-center gap-2 mr-4">
            <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs text-green-400">
              <span className="h-1.5 w-1.5 rounded-full bg-green-400" />{stats.connected} 已连接
            </span>
            <span className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              <Wrench size={10} />{stats.total_tools} 工具
            </span>
          </div>
          <button onClick={() => { fetchServers(); fetchStats(); }}
            className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-accent transition-colors">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus size={14} /> 添加服务器
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索服务器或工具..."
            className="w-full rounded-lg border border-border bg-muted/50 pl-9 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
          />
        </div>

        {/* Add Server Form */}
        {showAdd && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5 space-y-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Plus size={14} /> 注册新 MCP 服务器
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder="服务器名称 *" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={newUrl} onChange={(e) => setNewUrl(e.target.value)}
                placeholder="URL (e.g. stdio://server-name) *" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder="描述" className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30" />
              <select value={newTransport} onChange={(e) => setNewTransport(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
                <option value="stdio">stdio</option>
                <option value="sse">SSE</option>
                <option value="http">HTTP</option>
              </select>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowAdd(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">取消</button>
              <button onClick={handleAdd} className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90">添加</button>
            </div>
          </div>
        )}

        {/* Server List */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 size={20} className="animate-spin mr-2" /> 加载中...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Plug size={32} className="mb-3 opacity-30" />
            <p className="text-sm">{query ? "没有匹配的服务器" : "暂无 MCP 服务器"}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((server) => {
              const isExpanded = expanded.has(server.id);
              const busy = actionLoading[server.id];

              return (
                <div key={server.id} className="group rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-border/80">
                  {/* Server header */}
                  <div className="flex items-center gap-3 px-5 py-4">
                    <button onClick={() => toggleExpand(server.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                      server.connected ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                    }`}>
                      <Server size={16} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{server.name}</span>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{server.transport}</span>
                        {server.connected ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-green-400" /> 已连接
                          </span>
                        ) : (
                          <span className="text-[10px] text-muted-foreground">未连接</span>
                        )}
                        {!server.enabled && (
                          <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] text-yellow-400">已禁用</span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{server.description || server.url}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground mr-2">{server.tools.length} 工具</span>
                      <button onClick={() => handleToggleEnabled(server)}
                        className={`rounded-lg p-2 transition-colors ${server.enabled ? "text-yellow-400 hover:bg-yellow-500/10" : "text-green-400 hover:bg-green-500/10"}`}
                        title={server.enabled ? "禁用" : "启用"}>
                        {server.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                      </button>
                      <button onClick={() => handleConnect(server)}
                        disabled={!!busy}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          server.connected
                            ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        } ${busy ? "opacity-50" : ""}`}>
                        {busy ? <Loader2 size={12} className="animate-spin" /> : server.connected ? "断开" : "连接"}
                      </button>
                      <button onClick={() => handleDelete(server)}
                        className="rounded-lg p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded: tools + config */}
                  {isExpanded && (
                    <div className="border-t border-border bg-muted/30 px-5 py-4 space-y-4">
                      {/* Server info */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">URL:</span> <span className="font-mono">{server.url}</span></div>
                        <div><span className="text-muted-foreground">Transport:</span> {server.transport}</div>
                        <div><span className="text-muted-foreground">ID:</span> <span className="font-mono">{server.id}</span></div>
                        <div><span className="text-muted-foreground">注册时间:</span> {new Date(server.created_at * 1000).toLocaleDateString()}</div>
                      </div>

                      {/* Error */}
                      {server.error && (
                        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">
                          <AlertCircle size={12} /> {server.error}
                        </div>
                      )}

                      {/* Tools */}
                      <div>
                        <h4 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
                          <Wrench size={12} /> 可用工具 ({server.tools.length})
                        </h4>
                        {server.tools.length === 0 ? (
                          <p className="text-xs text-muted-foreground">暂无已注册工具。连接服务器后将自动发现工具。</p>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {server.tools.map((tool) => (
                              <div key={tool.name} className="flex items-start gap-2 rounded-lg border border-border bg-background px-3 py-2">
                                <Wrench size={12} className="text-primary mt-0.5 shrink-0" />
                                <div>
                                  <span className="text-xs font-medium">{tool.name}</span>
                                  {tool.description && (
                                    <p className="text-[10px] text-muted-foreground mt-0.5">{tool.description}</p>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

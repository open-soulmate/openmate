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
        showToast(t('mcp.t32847', { name: server.name, connected: server.connected ? t('mcp.t73394') : t('mcp.t09116') }), "success");
        fetchServers();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.detail || t('common.actionFailed'), "error");
      }
    } catch {
      showToast(t('common.networkError'), "error");
    }
    setActionLoading((prev) => ({ ...prev, [server.id]: "" }));
  };

  const handleDelete = async (server: McpServer) => {
    if (!confirm(t('mcp.t80285', { name: server.name }))) return;
    try {
      const res = await fetch(`${apiBase}/api/mcp/servers/${server.id}`, {
        method: "DELETE",
        headers,
      });
      if (res.ok) {
        showToast(t('mcp.t76266', { name: server.name }), "success");
        fetchServers();
        fetchStats();
      }
    } catch {
      showToast(t('common.deleteFailed'), "error");
    }
  };

  const handleAdd = async () => {
    if (!newName || !newUrl) {
      showToast(t('mcp.t68586'), "error");
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
        showToast(t('mcp.t37602', { newName: newName }), "success");
        setShowAdd(false);
        setNewName("");
        setNewUrl("");
        setNewDesc("");
        setNewTransport("stdio");
        fetchServers();
        fetchStats();
      } else {
        const data = await res.json();
        showToast(data.detail || t('mcp.t94595'), "error");
      }
    } catch {
      showToast(t('common.networkError'), "error");
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
        showToast(t('mcp.t04581', { name: server.name, enabled: server.enabled ? t('echo.disable') : t('common.enable') }), "success");
        fetchServers();
      }
    } catch {
      showToast(t('common.actionFailed'), "error");
    }
  };

  // ── Render ─────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm shadow-lg animate-in slide-in-from-top-2 ${
          toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
        }t('mcp.t28851')flex h-9 w-9 items-center justify-center rounded-lg ${
                      server.connected ? "bg-green-500/10 text-green-400" : "bg-muted text-muted-foreground"
                    }t('mcp.t42479')rounded-lg p-2 transition-colors ${server.enabled ? "text-yellow-400 hover:bg-yellow-500/10" : "text-green-400 hover:bg-green-500/10"}`}
                        title={server.enabled ? t('echo.disable') : t('common.enable')}>
                        {server.enabled ? <Power size={14} /> : <PowerOff size={14} />}
                      </button>
                      <button onClick={() => handleConnect(server)}
                        disabled={!!busy}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                          server.connected
                            ? "border border-red-500/30 text-red-400 hover:bg-red-500/10"
                            : "bg-primary text-primary-foreground hover:bg-primary/90"
                        } ${busy ? "opacity-50" : ""}`}>
                        {busy ? <Loader2 size={12} className="animate-spin" /> : server.connected ? t('mcp.t15239') : t('nerve.connections')}
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
                        <div><span className="text-muted-foreground">{t('mcp.t53308')}<span> {new Date(server.created_at * 1000).toLocaleDateString()}</div>
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
                          <Wrench size={12} />  {t('mcp.t14251')}
                        <h4>
                        {server.tools.length === 0 ? (
                          <p className="text-xs text-muted-foreground">{t('mcp.t81527')}<p>
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

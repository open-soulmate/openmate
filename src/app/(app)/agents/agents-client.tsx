"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useAppStore, type AgentNode, type AgentType } from "@/stores/app-store";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAgentRegistry, type RegisteredAgent } from "@/lib/agent-registry";
import { getAgentDetector } from "@/lib/agent-detector";
import {
  type DetectedAgent,
  type AgentRuntimeStatus,
  AGENT_ICON_MAP,
} from "@/lib/agent-types";
import {
  Server,
  Trash2,
  RefreshCw,
  Wifi,
  WifiOff,
  Cpu,
  HardDrive,
  MemoryStick,
  Clock,
  Plus,
  Bot,
  Plug,
  Settings,
  Zap,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Search,
  Filter,
  Activity,
  Wrench,
  MessageSquare,
  Send,
  X,
  Edit3,
  Eye,
  EyeOff,
  Download,
  Radar,
  Terminal,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GlandProvider {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  enabled: boolean;
}

interface GlandModel {
  id: string;
  provider: string;
  name: string;
  displayName: string;
  enabled: boolean;
}

interface AgentFormData {
  type: AgentType;
  name: string;
  // Soma
  nodeId: string;
  endpoint: string;
  // AI
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  // MCP
  serverUrl: string;
  tools: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_TYPE_CONFIG: Record<AgentType, { label: string; icon: React.ElementType; color: string; description: string }> = {
  soma: { label: "Soma 节点", icon: Server, color: "text-emerald-400", description: "自家采集分身节点" },
  ai: { label: "AI Agent", icon: Bot, color: "text-violet-400", description: "外部 AI 服务商" },
  mcp: { label: "MCP Agent", icon: Plug, color: "text-amber-400", description: "MCP 协议接入" },
};

const PROVIDER_OPTIONS = [
  { value: "OpenAI", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"] },
  { value: "Claude", label: "Claude (Anthropic)", models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514", "claude-opus-4-20250514"] },
  { value: "MiMo", label: "MiMo (小米)", models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-auto"] },
  { value: "Ollama", label: "Ollama (本地)", models: ["llama3.1", "qwen2.5", "deepseek-r1", "mistral"] },
  { value: "Custom", label: "自定义", models: [] },
];

const MOCK_METRICS: Record<string, { cpu: number; mem: number; disk: number }> = {
  "soma-1": { cpu: 23, mem: 45, disk: 62 },
  "soma-2": { cpu: 0, mem: 0, disk: 55 },
  "ai-1": { cpu: 0, mem: 0, disk: 0 },
  "ai-2": { cpu: 0, mem: 0, disk: 0 },
  "mcp-1": { cpu: 12, mem: 38, disk: 41 },
  "mcp-2": { cpu: 8, mem: 29, disk: 33 },
};

const MOCK_HISTORY = [
  { id: "1", time: "2 min ago", action: "chat_completion", status: "success" as const, latency: "1.2s" },
  { id: "2", time: "5 min ago", action: "tool_call", status: "success" as const, latency: "0.8s" },
  { id: "3", time: "12 min ago", action: "chat_completion", status: "error" as const, latency: "3.1s" },
  { id: "4", time: "1 hour ago", action: "health_check", status: "success" as const, latency: "0.1s" },
];

// ─── Helper Components ───────────────────────────────────────────────────────

function StatusBadge({ status }: { status: AgentNode["status"] }) {
  const map = {
    online: { variant: "success" as const, label: "在线", icon: CheckCircle2 },
    offline: { variant: "default" as const, label: "离线", icon: XCircle },
    error: { variant: "destructive" as const, label: "错误", icon: AlertTriangle },
  };
  const { variant, label, icon: Icon } = map[status];
  return (
    <Badge variant={variant}>
      <Icon size={10} className="mr-1" />
      {label}
    </Badge>
  );
}

function TypeBadge({ type }: { type: AgentType }) {
  const config = AGENT_TYPE_CONFIG[type];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium border", {
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-400": type === "soma",
      "border-violet-500/30 bg-violet-500/10 text-violet-400": type === "ai",
      "border-amber-500/30 bg-amber-500/10 text-amber-400": type === "mcp",
    })}>
      {config.label}
    </span>
  );
}

function MetricBar({ label, icon: Icon, value }: { label: string; icon: React.ElementType; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={12} className="shrink-0 text-muted-foreground" />
      <span className="w-8 text-[10px] text-muted-foreground">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            value > 80 ? "bg-destructive" : value > 60 ? "bg-amber-400" : "bg-primary",
          )}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-8 text-right text-[10px] text-muted-foreground">{value}%</span>
    </div>
  );
}

function EmptyState({ type }: { type?: AgentType }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center py-16">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
        {type ? React.createElement(AGENT_TYPE_CONFIG[type].icon, { className: "h-7 w-7 text-muted-foreground" }) : <Server className="h-7 w-7 text-muted-foreground" />}
      </div>
      <h3 className="mb-2 text-sm font-medium">
        {type ? `暂无${AGENT_TYPE_CONFIG[type].label}` : "暂无 Agent"}
      </h3>
      <p className="text-xs text-muted-foreground">
        {type ? `点击上方「添加」按钮创建${AGENT_TYPE_CONFIG[type].label}` : "点击「添加 Agent」按钮创建你的第一个 Agent"}
      </p>
    </div>
  );
}

// ─── Runtime Status Badge (for auto-detected agents) ────────────────────────

function RuntimeStatusBadge({ status }: { status: AgentRuntimeStatus }) {
  const map: Record<AgentRuntimeStatus, { variant: "success" | "default" | "warning" | "destructive"; label: string; icon: React.ElementType }> = {
    online: { variant: "success", label: "在线", icon: CheckCircle2 },
    offline: { variant: "default", label: "离线", icon: XCircle },
    missing: { variant: "warning", label: "未安装", icon: AlertTriangle },
    unchecked: { variant: "default", label: "未检测", icon: Clock },
  };
  const { variant, label, icon: Icon } = map[status];
  return (
    <Badge variant={variant}>
      <Icon size={10} className="mr-1" />
      {label}
    </Badge>
  );
}

// ─── Detected Agent Card ────────────────────────────────────────────────────

function DetectedAgentCard({ agent, onInstall }: {
  agent: DetectedAgent;
  onInstall: (agent: DetectedAgent) => void;
}) {
  const IconComp = agent.icon;
  return (
    <div className="group rounded-lg border border-border bg-card p-3 transition-all hover:border-primary/40">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-muted", agent.color)}>
          <IconComp size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-medium truncate">{agent.name}</h4>
            <span className="shrink-0 inline-flex items-center rounded-full border border-slate-500/30 bg-slate-500/10 px-1.5 py-0.5 text-[9px] font-medium text-slate-400">
              {agent.category === "local" ? "本地" : agent.category === "remote" ? "远程" : "工具"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground truncate">{agent.description}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <RuntimeStatusBadge status={agent.status} />
          {agent.status === "missing" && (
            <button
              onClick={() => onInstall(agent)}
              className="rounded-md bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              安装
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Agent Card ──────────────────────────────────────────────────────────────

function AgentCard({ agent, onDetail, onDelete }: {
  agent: AgentNode;
  onDetail: (agent: AgentNode) => void;
  onDelete: (agent: AgentNode) => void;
}) {
  const config = AGENT_TYPE_CONFIG[agent.type];
  const metrics = MOCK_METRICS[agent.id] ?? { cpu: 0, mem: 0, disk: 0 };
  const isFromMarketplace = agent.id.startsWith("market-");

  return (
    <div
      className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg cursor-pointer"
      onClick={() => onDetail(agent)}
    >
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-muted", config.color)}>
            <config.icon size={18} />
          </div>
          <div>
            <h3 className="text-sm font-medium">{agent.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <TypeBadge type={agent.type} />
              {isFromMarketplace && <MarketplaceBadge />}
              {agent.type === "ai" && agent.provider && (
                <span className="text-[10px] text-muted-foreground">{agent.provider}</span>
              )}
            </div>
          </div>
        </div>
        <StatusBadge status={agent.status} />
      </div>

      {/* Type-specific info */}
      <div className="mb-3 space-y-1 text-xs text-muted-foreground">
        {agent.type === "soma" && (
          <>
            <div className="flex items-center gap-1.5">
              <Server size={11} />
              <span>节点: {agent.nodeId ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink size={11} />
              <span className="truncate">{agent.endpoint ?? "—"}</span>
            </div>
          </>
        )}
        {agent.type === "ai" && (
          <>
            <div className="flex items-center gap-1.5">
              <Bot size={11} />
              <span>模型: {agent.model ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ExternalLink size={11} />
              <span className="truncate">{agent.baseUrl ?? "—"}</span>
            </div>
          </>
        )}
        {agent.type === "mcp" && (
          <>
            <div className="flex items-center gap-1.5">
              <Plug size={11} />
              <span className="truncate">{agent.serverUrl ?? "—"}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wrench size={11} />
              <span>{agent.tools?.length ?? 0} 个工具</span>
            </div>
          </>
        )}
      </div>

      {/* Metrics (only for soma) */}
      {agent.type === "soma" && agent.status === "online" && (
        <div className="mb-3 space-y-1.5">
          <MetricBar label="CPU" icon={Cpu} value={metrics.cpu} />
          <MetricBar label="MEM" icon={MemoryStick} value={metrics.mem} />
          <MetricBar label="Disk" icon={HardDrive} value={metrics.disk} />
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock size={11} />
          <span>{agent.lastSeen}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <button
            onClick={(e) => { e.stopPropagation(); onDetail(agent); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="查看详情"
          >
            <Eye size={13} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(agent); }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="删除"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Agent Dialog ────────────────────────────────────────────────────────

function AddAgentDialog({ open, onClose, onAdd, providers }: {
  open: boolean;
  onClose: () => void;
  onAdd: (data: AgentFormData) => void;
  providers: GlandProvider[];
}) {
  const [step, setStep] = useState<"type" | "form">("type");
  const [form, setForm] = useState<AgentFormData>({
    type: "soma",
    name: "",
    nodeId: "",
    endpoint: "",
    provider: "OpenAI",
    apiKey: "",
    baseUrl: "",
    model: "",
    serverUrl: "",
    tools: "",
  });
  const [showApiKey, setShowApiKey] = useState(false);

  const selectedProvider = PROVIDER_OPTIONS.find((p) => p.value === form.provider);

  function reset() {
    setStep("type");
    setForm({
      type: "soma", name: "", nodeId: "", endpoint: "",
      provider: "OpenAI", apiKey: "", baseUrl: "", model: "",
      serverUrl: "", tools: "",
    });
    setShowApiKey(false);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    onAdd(form);
    handleClose();
  }

  function updateForm(patch: Partial<AgentFormData>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  const isValid = form.name.trim() && (
    (form.type === "soma" && form.nodeId.trim() && form.endpoint.trim()) ||
    (form.type === "ai" && form.provider && form.model) ||
    (form.type === "mcp" && form.serverUrl.trim())
  );

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={step === "type" ? "添加 Agent" : `添加 ${AGENT_TYPE_CONFIG[form.type].label}`}
      description={step === "type" ? "选择要添加的 Agent 类型" : `配置 ${AGENT_TYPE_CONFIG[form.type].label} 参数`}
      className="max-w-xl"
      footer={
        step === "type" ? (
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            取消
          </button>
        ) : (
          <>
            <button
              onClick={() => setStep("type")}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              返回
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid}
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              添加
            </button>
          </>
        )
      }
    >
      {step === "type" ? (
        <div className="grid gap-3">
          {(Object.entries(AGENT_TYPE_CONFIG) as [AgentType, typeof AGENT_TYPE_CONFIG[AgentType]][]).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => { updateForm({ type: key }); setStep("form"); }}
              className="flex items-center gap-4 rounded-lg border border-border p-4 text-left transition-all hover:border-primary/40 hover:bg-accent/50"
            >
              <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-muted", cfg.color)}>
                <cfg.icon size={20} />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium">{cfg.label}</div>
                <div className="text-xs text-muted-foreground">{cfg.description}</div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">名称</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder={form.type === "soma" ? "采集分身-北京" : form.type === "ai" ? "GPT-4o" : "文件系统 MCP"}
              className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
            />
          </div>

          {/* Soma fields */}
          {form.type === "soma" && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">节点 ID</label>
                <input
                  type="text"
                  value={form.nodeId}
                  onChange={(e) => updateForm({ nodeId: e.target.value })}
                  placeholder="soma-bj-01"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">连接地址</label>
                <input
                  type="text"
                  value={form.endpoint}
                  onChange={(e) => updateForm({ endpoint: e.target.value })}
                  placeholder="ws://10.0.1.12:8900"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
            </>
          )}

          {/* AI fields */}
          {form.type === "ai" && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => {
                    const p = PROVIDER_OPTIONS.find((o) => o.value === e.target.value);
                    updateForm({
                      provider: e.target.value,
                      model: p?.models[0] ?? "",
                      baseUrl: e.target.value === "OpenAI" ? "https://api.openai.com/v1"
                        : e.target.value === "Claude" ? "https://api.anthropic.com/v1"
                        : e.target.value === "Ollama" ? "http://localhost:11434/v1"
                        : "",
                    });
                  }}
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                >
                  {PROVIDER_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">模型</label>
                {selectedProvider && selectedProvider.models.length > 0 ? (
                  <select
                    value={form.model}
                    onChange={(e) => updateForm({ model: e.target.value })}
                    className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  >
                    {selectedProvider.models.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={form.model}
                    onChange={(e) => updateForm({ model: e.target.value })}
                    placeholder="model-name"
                    className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                  />
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">API Key</label>
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={form.apiKey}
                    onChange={(e) => updateForm({ apiKey: e.target.value })}
                    placeholder="sk-..."
                    className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 pr-9 text-sm outline-none focus:border-primary transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Base URL</label>
                <input
                  type="text"
                  value={form.baseUrl}
                  onChange={(e) => updateForm({ baseUrl: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              {providers.length > 0 && (
                <div className="rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground mb-2">从 Gland 获取的已配置 Provider：</p>
                  <div className="flex flex-wrap gap-1.5">
                    {providers.filter((p) => p.enabled).map((p) => (
                      <span key={p.id} className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* MCP fields */}
          {form.type === "mcp" && (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">MCP Server 地址</label>
                <input
                  type="text"
                  value={form.serverUrl}
                  onChange={(e) => updateForm({ serverUrl: e.target.value })}
                  placeholder="http://localhost:3001"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
                  工具列表 <span className="text-muted-foreground/60">(可选，逗号分隔)</span>
                </label>
                <input
                  type="text"
                  value={form.tools}
                  onChange={(e) => updateForm({ tools: e.target.value })}
                  placeholder="read_file, write_file, list_dir"
                  className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
              </div>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

// ─── Agent Detail Dialog ─────────────────────────────────────────────────────

function AgentDetailDialog({ agent, open, onClose, onTest, onDelete }: {
  agent: AgentNode | null;
  open: boolean;
  onClose: () => void;
  onTest: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const [tab, setTab] = useState<"info" | "tools" | "history" | "chat">("info");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  useEffect(() => {
    if (open) {
      setTab("info");
      setTestStatus("idle");
      setChatMessages([]);
      setChatInput("");
    }
  }, [open, agent]);

  if (!agent) return null;

  const currentAgent = agent;
  const config = AGENT_TYPE_CONFIG[currentAgent.type];
  const metrics = MOCK_METRICS[currentAgent.id] ?? { cpu: 0, mem: 0, disk: 0 };

  function handleTest() {
    setTestStatus("testing");
    setTimeout(() => {
      setTestStatus(currentAgent.status === "error" ? "error" : "success");
    }, 1500);
  }

  function handleSend() {
    if (!chatInput.trim()) return;
    const userMsg = { role: "user" as const, content: chatInput };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");
    setTimeout(() => {
      setChatMessages((prev) => [...prev, { role: "assistant" as const, content: `来自 ${currentAgent.name} 的响应：收到您的消息 "${userMsg.content}"` }]);
    }, 1000);
  }

  const tabs = [
    { id: "info" as const, label: "连接信息", icon: Settings },
    ...(agent.type === "mcp" ? [{ id: "tools" as const, label: "工具列表", icon: Wrench }] : []),
    { id: "history" as const, label: "调用历史", icon: Activity },
    { id: "chat" as const, label: "测试对话", icon: MessageSquare },
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={agent.name}
      description={`${config.label} · ${agent.status === "online" ? "在线" : agent.status === "offline" ? "离线" : "错误"}`}
      className="max-w-2xl"
      footer={
        <>
          <button
            onClick={() => onDelete(agent.id)}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
          >
            删除
          </button>
          <button
            onClick={handleTest}
            disabled={testStatus === "testing"}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            {testStatus === "testing" ? "测试中..." : "测试连接"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Status & Metrics */}
        <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/30 p-4">
          <div className={cn("flex h-12 w-12 items-center justify-center rounded-xl", config.color, "bg-muted")}>
            <config.icon size={24} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <StatusBadge status={agent.status} />
              <TypeBadge type={agent.type} />
              {testStatus === "success" && (
                <Badge variant="success"><CheckCircle2 size={10} className="mr-1" />连接正常</Badge>
              )}
              {testStatus === "error" && (
                <Badge variant="destructive"><XCircle size={10} className="mr-1" />连接失败</Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">最后活跃: {agent.lastSeen}</p>
          </div>
          {agent.type === "soma" && agent.status === "online" && (
            <div className="w-48 space-y-1">
              <MetricBar label="CPU" icon={Cpu} value={metrics.cpu} />
              <MetricBar label="MEM" icon={MemoryStick} value={metrics.mem} />
              <MetricBar label="Disk" icon={HardDrive} value={metrics.disk} />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <t.icon size={12} />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="min-h-[200px]">
          {tab === "info" && (
            <div className="space-y-3">
              {agent.type === "soma" && (
                <>
                  <InfoRow label="节点 ID" value={agent.nodeId ?? "—"} />
                  <InfoRow label="连接地址" value={agent.endpoint ?? "—"} copyable />
                </>
              )}
              {agent.type === "ai" && (
                <>
                  <InfoRow label="Provider" value={agent.provider ?? "—"} />
                  <InfoRow label="模型" value={agent.model ?? "—"} />
                  <InfoRow label="Base URL" value={agent.baseUrl ?? "—"} copyable />
                  <InfoRow label="API Key" value={agent.apiKey ? "••••••••" : "未配置"} />
                </>
              )}
              {agent.type === "mcp" && (
                <>
                  <InfoRow label="Server 地址" value={agent.serverUrl ?? "—"} copyable />
                  <InfoRow label="工具数量" value={`${agent.tools?.length ?? 0} 个`} />
                </>
              )}
              <InfoRow label="Agent ID" value={agent.id} copyable />
              <InfoRow label="创建时间" value="— (mock)" />
            </div>
          )}

          {tab === "tools" && agent.type === "mcp" && (
            <div className="space-y-2">
              {agent.tools && agent.tools.length > 0 ? (
                agent.tools.map((tool, i) => (
                  <div key={i} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    <Wrench size={14} className="text-amber-400" />
                    <span className="text-sm font-mono">{tool}</span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-8">暂无工具信息</p>
              )}
            </div>
          )}

          {tab === "history" && (
            <div className="space-y-2">
              {MOCK_HISTORY.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                  {h.status === "success" ? (
                    <CheckCircle2 size={14} className="text-emerald-400" />
                  ) : (
                    <XCircle size={14} className="text-destructive" />
                  )}
                  <div className="flex-1">
                    <span className="text-sm font-medium">{h.action}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{h.time}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{h.latency}</span>
                </div>
              ))}
            </div>
          )}

          {tab === "chat" && (
            <div className="flex flex-col h-[250px]">
              <div className="flex-1 overflow-y-auto space-y-3 mb-3">
                {chatMessages.length === 0 && (
                  <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                    发送消息测试 Agent 响应
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted border border-border",
                    )}>
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSend()}
                  placeholder="输入测试消息..."
                  className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
                />
                <button
                  onClick={handleSend}
                  disabled={!chatInput.trim()}
                  className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function InfoRow({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-mono">{value}</span>
        {copyable && (
          <button
            onClick={() => navigator.clipboard.writeText(value)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="复制"
          >
            <Copy size={12} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Marketplace Agent → AgentNode converter ─────────────────────────────────

function registryToAgentNode(reg: RegisteredAgent): AgentNode {
  // Map marketplace types to agent management types
  const typeMap: Record<string, AgentType> = {
    local: "ai",
    remote: "ai",
    tool: "mcp",
  };

  const base: AgentNode = {
    id: `market-${reg.id}`,
    name: reg.name,
    type: typeMap[reg.type] ?? "ai",
    status: reg.status === "running" ? "online" : "offline",
    lastSeen: new Date(reg.installed_at).toLocaleString(),
  };

  if (reg.type === "remote") {
    base.provider = reg.name;
    base.model = reg.id;
  }
  if (reg.type === "tool" && reg.port) {
    base.serverUrl = `http://localhost:${reg.port}`;
  }

  return base;
}

// ─── Marketplace Badge ───────────────────────────────────────────────────────

function MarketplaceBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/30 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-400">
      <Download size={10} />
      市场
    </span>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function AgentsClient() {
  const agentNodes = useAppStore((s) => s.agentNodes);
  const setAgentNodes = useAppStore((s) => s.setAgentNodes);

  const [filter, setFilter] = useState<AgentType | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentNode | null>(null);
  const [detailTarget, setDetailTarget] = useState<AgentNode | null>(null);

  // Gland API state
  const [providers, setProviders] = useState<GlandProvider[]>([]);
  const [models, setModels] = useState<GlandModel[]>([]);

  // Registry integration — installed marketplace agents
  const [registryAgents, setRegistryAgents] = useState<RegisteredAgent[]>([]);
  const registry = getAgentRegistry();

  useEffect(() => {
    setRegistryAgents(registry.getAvailableAgents());
    const unsub = registry.subscribe(() => {
      setRegistryAgents(registry.getAvailableAgents());
    });
    return unsub;
  }, [registry]);

  // Agent auto-detection
  const [detectedAgents, setDetectedAgents] = useState<DetectedAgent[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [showDetected, setShowDetected] = useState(true);
  const detector = getAgentDetector();

  const runDetection = useCallback(async () => {
    setIsDetecting(true);
    try {
      const agents = await detector.detectAll();
      setDetectedAgents(agents);
    } finally {
      setIsDetecting(false);
    }
  }, [detector]);

  useEffect(() => {
    // Load cached results first
    setDetectedAgents(detector.getAll());
    // Then run fresh detection
    runDetection();
    const unsub = detector.subscribe(() => {
      setDetectedAgents(detector.getAll());
    });
    return unsub;
  }, [detector, runDetection]);

  const onlineDetected = detectedAgents.filter((a) => a.status === "online");
  const offlineDetected = detectedAgents.filter((a) => a.status !== "online");

  // Convert registry agents to AgentNode format and merge
  const marketplaceNodes = registryAgents
    .filter((r) => !agentNodes.some((n) => n.id === `market-${r.id}`))
    .map(registryToAgentNode);

  const allNodes = [...agentNodes, ...marketplaceNodes];

  // Fetch Gland providers/models
  const fetchGlandData = useCallback(async () => {
    try {
      const [provRes, modelRes] = await Promise.all([
        fetch("/api/gland/providers").catch(() => null),
        fetch("/api/gland/models").catch(() => null),
      ]);
      if (provRes?.ok) {
        const data = await provRes.json();
        setProviders(Array.isArray(data) ? data : []);
      }
      if (modelRes?.ok) {
        const data = await modelRes.json();
        setModels(Array.isArray(data) ? data : []);
      }
    } catch {
      // Silently ignore - API may not exist yet
    }
  }, []);

  useEffect(() => {
    fetchGlandData();
  }, [fetchGlandData]);

  const filteredNodes = allNodes.filter((n) => {
    if (filter !== "all" && n.type !== filter) return false;
    if (searchQuery && !n.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const counts = {
    all: allNodes.length,
    soma: allNodes.filter((n) => n.type === "soma").length,
    ai: allNodes.filter((n) => n.type === "ai").length,
    mcp: allNodes.filter((n) => n.type === "mcp").length,
  };

  const onlineCount = allNodes.filter((n) => n.status === "online").length;

  function handleAdd(data: AgentFormData) {
    const id = `${data.type}-${Date.now()}`;
    const newAgent: AgentNode = {
      id,
      name: data.name,
      type: data.type,
      status: "offline",
      lastSeen: "Never",
      ...(data.type === "soma" && { nodeId: data.nodeId, endpoint: data.endpoint }),
      ...(data.type === "ai" && { provider: data.provider, apiKey: data.apiKey, baseUrl: data.baseUrl, model: data.model }),
      ...(data.type === "mcp" && { serverUrl: data.serverUrl, tools: data.tools.split(",").map((t) => t.trim()).filter(Boolean) }),
    };
    setAgentNodes([...agentNodes, newAgent]);
  }

  function handleDelete(id: string) {
    // If it's a marketplace agent, uninstall from registry
    if (id.startsWith("market-")) {
      const regId = id.replace("market-", "");
      registry.uninstall(regId);
    } else {
      setAgentNodes(agentNodes.filter((n) => n.id !== id));
    }
    setDeleteTarget(null);
    setDetailTarget(null);
  }

  function handleTestConnection(id: string) {
    // Simulate test
    setAgentNodes(agentNodes.map((n) =>
      n.id === id ? { ...n, status: n.status === "error" ? "online" : n.status } : n,
    ));
  }

  function handleInstallDetected(agent: DetectedAgent) {
    // Open skills marketplace with the agent name as search
    window.open(`/skills?q=${encodeURIComponent(agent.name)}`, "_self");
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">Agent 管理</h2>
            <p className="text-xs text-muted-foreground">
              {onlineCount} / {allNodes.length} 在线
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchGlandData()}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            添加 Agent
          </button>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索 Agent..."
            className="w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-primary transition-colors"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-0.5">
          {([["all", "全部", Filter], ...Object.entries(AGENT_TYPE_CONFIG).map(([k, v]) => [k, v.label, v.icon])] as [string, string, React.ElementType][]).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setFilter(key as AgentType | "all")}
              className={cn(
                "flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                filter === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon size={11} />
              {label}
              <span className={cn(
                "ml-0.5 rounded-full px-1.5 py-0 text-[9px]",
                filter === key ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground",
              )}>
                {counts[key as AgentType | "all"]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Auto-detected Agents */}
      {detectedAgents.length > 0 && (
        <div className="border-b border-border">
          <button
            onClick={() => setShowDetected(!showDetected)}
            className="flex w-full items-center justify-between px-6 py-3 text-xs font-medium text-muted-foreground hover:bg-accent/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Radar size={14} className={cn(isDetecting && "animate-pulse")} />
              <span>自动检测</span>
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                {onlineDetected.length} 可用
              </span>
              {offlineDetected.length > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                  {offlineDetected.length} 未安装
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); runDetection(); }}
                disabled={isDetecting}
                className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {isDetecting ? "检测中..." : "重新检测"}
              </button>
              <ChevronDown size={14} className={cn("transition-transform", showDetected && "rotate-180")} />
            </div>
          </button>
          {showDetected && (
            <div className="px-6 pb-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {detectedAgents.map((agent) => (
                  <DetectedAgentCard
                    key={agent.id}
                    agent={agent}
                    onInstall={handleInstallDetected}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filteredNodes.length === 0 ? (
          <EmptyState type={filter !== "all" ? filter : undefined} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredNodes.map((node) => (
              <AgentCard
                key={node.id}
                agent={node}
                onDetail={setDetailTarget}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Agent Dialog */}
      <AddAgentDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={handleAdd}
        providers={providers}
      />

      {/* Agent Detail Dialog */}
      <AgentDetailDialog
        agent={detailTarget}
        open={!!detailTarget}
        onClose={() => setDetailTarget(null)}
        onTest={handleTestConnection}
        onDelete={handleDelete}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="删除 Agent"
        description={`确定要删除 "${deleteTarget?.name}" 吗？此操作不可撤销。`}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              取消
            </button>
            <button
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              删除
            </button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            {deleteTarget && React.createElement(AGENT_TYPE_CONFIG[deleteTarget.type].icon, { size: 14, className: "text-muted-foreground" })}
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            类型: {deleteTarget && AGENT_TYPE_CONFIG[deleteTarget.type].label} · 最后活跃: {deleteTarget?.lastSeen}
          </p>
        </div>
      </Dialog>
    </div>
  );
}

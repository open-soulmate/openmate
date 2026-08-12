"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Download,
  Check,
  Copy,
  Plug,
  Trash2,
  Play,
  Square,
  Bot,
  Globe,
  Wrench,
  Server,
  Cpu,
  Database,
  MessageSquare,
  Workflow,
  BrainCircuit,
  HardDrive,
  Radio,
  Loader2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import {
  getAgentInstaller,
  type InstallProgress,
} from "@/lib/agent-installer";
import {
  getAgentRegistry,
  type RegisteredAgent,
} from "@/lib/agent-registry";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AgentType = "local" | "remote" | "tool";

type AgentStatus = "available" | "installed" | "running";

interface Agent {
  id: string;
  name: string;
  description: string;
  type: AgentType;
  icon: React.ReactNode;
  size: string;
  installCommand: string;
  needsApiKey: boolean;
  status: AgentStatus;
}

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const initialAgents: Agent[] = [
  {
    id: "open-interpreter",
    name: "Open Interpreter",
    description: "本地代码执行引擎，支持自然语言控制计算机。",
    type: "local",
    icon: <Cpu size={22} />,
    size: "5 MB",
    installCommand: "pip install open-interpreter",
    needsApiKey: false,
    status: "available",
  },
  {
    id: "ollama",
    name: "Ollama",
    description: "本地大模型推理框架，一键运行 Llama、Qwen 等模型。",
    type: "local",
    icon: <BrainCircuit size={22} />,
    size: "200 MB",
    installCommand: "curl -fsSL https://ollama.com/install.sh | sh",
    needsApiKey: false,
    status: "available",
  },
  {
    id: "aider",
    name: "Aider",
    description: "AI 结对编程助手，直接在终端中编辑代码。",
    type: "local",
    icon: <Bot size={22} />,
    size: "10 MB",
    installCommand: "pip install aider-chat",
    needsApiKey: false,
    status: "available",
  },
  {
    id: "n8n",
    name: "n8n",
    description: "开源工作流自动化平台，连接 400+ 应用与服务。",
    type: "tool",
    icon: <Workflow size={22} />,
    size: "500 MB",
    installCommand: "docker run -it --rm -p 5678:5678 n8nio/n8n",
    needsApiKey: false,
    status: "available",
  },
  {
    id: "claude",
    name: "Claude",
    description: "Anthropic 出品的远程 AI 助手，擅长长文本与推理。",
    type: "remote",
    icon: <MessageSquare size={22} />,
    size: "—",
    installCommand: "",
    needsApiKey: true,
    status: "available",
  },
  {
    id: "gpt",
    name: "GPT",
    description: "OpenAI 出品的远程 AI 模型，支持 GPT-4o 及更早版本。",
    type: "remote",
    icon: <Globe size={22} />,
    size: "—",
    installCommand: "",
    needsApiKey: true,
    status: "available",
  },
  {
    id: "mimo",
    name: "MiMo",
    description: "小米自研大模型，中文理解与代码能力出色。",
    type: "remote",
    icon: <BrainCircuit size={22} />,
    size: "—",
    installCommand: "",
    needsApiKey: true,
    status: "available",
  },
  {
    id: "minio",
    name: "MinIO",
    description: "高性能对象存储，兼容 S3 API，适合 AI 数据湖。",
    type: "tool",
    icon: <HardDrive size={22} />,
    size: "150 MB",
    installCommand:
      "docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address :9001",
    needsApiKey: false,
    status: "available",
  },
  {
    id: "nats",
    name: "NATS",
    description: "轻量级消息队列，为微服务与 Agent 通信而生。",
    type: "tool",
    icon: <Radio size={22} />,
    size: "20 MB",
    installCommand: "docker run -p 4222:4222 nats",
    needsApiKey: false,
    status: "available",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const typeLabels: Record<AgentType, string> = {
  local: "本地 Agent",
  remote: "远程 Agent",
  tool: "工具",
};

const typeColors: Record<AgentType, string> = {
  local: "bg-emerald-500/15 text-emerald-400",
  remote: "bg-blue-500/15 text-blue-400",
  tool: "bg-amber-500/15 text-amber-400",
};

const typeIcons: Record<AgentType, React.ReactNode> = {
  local: <Server size={12} />,
  remote: <Globe size={12} />,
  tool: <Wrench size={12} />,
};

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({
  message,
  type,
  onClose,
}: {
  message: string;
  type: "success" | "error" | "info";
  onClose: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [onClose]);

  const colors = {
    success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    info: "border-blue-500/40 bg-blue-500/10 text-blue-300",
  };

  const icons = {
    success: <CheckCircle2 size={14} />,
    error: <XCircle size={14} />,
    info: <Loader2 size={14} className="animate-spin" />,
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-medium shadow-lg ${colors[type]}`}
    >
      {icons[type]}
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Install Progress Overlay
// ---------------------------------------------------------------------------

function InstallOverlay({
  progress,
  agentName,
}: {
  progress: InstallProgress | null;
  agentName: string;
}) {
  if (!progress) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-80 rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex flex-col items-center text-center">
          {progress.stage === "done" ? (
            <CheckCircle2 size={36} className="mb-3 text-emerald-400" />
          ) : progress.stage === "error" ? (
            <XCircle size={36} className="mb-3 text-destructive" />
          ) : (
            <Loader2
              size={36}
              className="mb-3 animate-spin text-primary"
            />
          )}
          <h3 className="text-sm font-medium">
            {progress.stage === "done"
              ? "安装完成"
              : progress.stage === "error"
                ? "安装失败"
                : `正在安装 ${agentName}`}
          </h3>
          <p className="mt-2 text-xs text-muted-foreground">
            {progress.message}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type TabKey = "market" | "installed" | "my";

const tabs: { key: TabKey; label: string }[] = [
  { key: "market", label: "Agent 市场" },
  { key: "installed", label: "已安装" },
  { key: "my", label: "我的技能" },
];

export function SkillsClient() {
  const [activeTab, setActiveTab] = useState<TabKey>("market");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"all" | AgentType>("all");
  const [agents, setAgents] = useState<Agent[]>(() =>
    syncRegistryStatus(initialAgents),
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Install state
  const [installingAgent, setInstallingAgent] = useState<Agent | null>(null);
  const [installProgress, setInstallProgress] =
    useState<InstallProgress | null>(null);

  // Toast state
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  // API key dialog state
  const [apiKeyAgent, setApiKeyAgent] = useState<Agent | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState("");

  const installer = getAgentInstaller();
  const registry = getAgentRegistry();

  // Sync registry on mount and when registry changes
  useEffect(() => {
    const unsub = registry.subscribe(() => {
      setAgents(syncRegistryStatus(initialAgents));
    });
    return unsub;
  }, [registry]);

  // ---- actions ----

  const copyInstall = useCallback((agent: Agent) => {
    navigator.clipboard.writeText(agent.installCommand).then(() => {
      setCopiedId(agent.id);
      setTimeout(() => setCopiedId(null), 2000);
    });
  }, []);

  const handleInstall = useCallback(
    async (agent: Agent) => {
      if (agent.needsApiKey) {
        setApiKeyAgent(agent);
        return;
      }

      setInstallingAgent(agent);
      setInstallProgress({ stage: "copying", message: "开始安装…" });

      const success = await installer.install(agent.id, (p) => {
        setInstallProgress(p);
      });

      // Update local state
      setAgents(syncRegistryStatus(initialAgents));

      if (success) {
        setToast({
          message: `${agent.name} 安装成功`,
          type: "success",
        });
      } else {
        setToast({ message: `${agent.name} 安装失败`, type: "error" });
      }

      // Clear overlay after a brief delay
      setTimeout(() => {
        setInstallingAgent(null);
        setInstallProgress(null);
      }, 1200);
    },
    [installer],
  );

  const handleApiKeySubmit = useCallback(async () => {
    if (!apiKeyAgent || !apiKeyValue.trim()) return;

    setApiKeyAgent(null);
    setInstallingAgent(apiKeyAgent);
    setInstallProgress({ stage: "saving", message: "正在接入…" });

    const success = await installer.installRemoteWithKey(
      apiKeyAgent.id,
      apiKeyValue.trim(),
      (p) => setInstallProgress(p),
    );

    setApiKeyValue("");
    setAgents(syncRegistryStatus(initialAgents));

    if (success) {
      setToast({
        message: `${apiKeyAgent.name} 接入成功`,
        type: "success",
      });
    } else {
      setToast({
        message: `${apiKeyAgent.name} 接入失败`,
        type: "error",
      });
    }

    setTimeout(() => {
      setInstallingAgent(null);
      setInstallProgress(null);
    }, 1200);
  }, [apiKeyAgent, apiKeyValue, installer]);

  const uninstallAgent = useCallback(
    (id: string) => {
      registry.uninstall(id);
      setAgents(syncRegistryStatus(initialAgents));
      setToast({ message: "已卸载", type: "info" });
    },
    [registry],
  );

  const toggleRun = useCallback(
    (id: string) => {
      const agent = registry.getById(id);
      if (agent?.status === "running") {
        registry.updateStatus(id, "installed");
      } else if (agent?.status === "installed") {
        registry.updateStatus(id, "running");
      }
      setAgents(syncRegistryStatus(initialAgents));
    },
    [registry],
  );

  // ---- filters ----

  const filtered = agents.filter((a) => {
    const matchQuery =
      a.name.toLowerCase().includes(query.toLowerCase()) ||
      a.description.toLowerCase().includes(query.toLowerCase());
    const matchCategory = category === "all" || a.type === category;
    return matchQuery && matchCategory;
  });

  const installedAgents = agents.filter(
    (a) => a.status === "installed" || a.status === "running",
  );

  // ---- render helpers ----

  const renderCategoryFilter = () => (
    <div className="flex items-center gap-1.5">
      {(
        [
          { key: "all", label: "全部" },
          { key: "local", label: "本地 Agent" },
          { key: "remote", label: "远程 Agent" },
          { key: "tool", label: "工具" },
        ] as const
      ).map((c) => (
        <button
          key={c.key}
          onClick={() => setCategory(c.key)}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            category === c.key
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground"
          }`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  const renderAgentCard = (agent: Agent) => {
    const isInstalled = agent.status !== "available";
    const isRunning = agent.status === "running";

    return (
      <div
        key={agent.id}
        className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40"
      >
        {/* Top row: icon + name + type badge */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            {agent.icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold truncate">{agent.name}</h3>
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColors[agent.type]}`}
              >
                {typeIcons[agent.type]}
                {typeLabels[agent.type]}
              </span>
              {isRunning && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  运行中
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
              {agent.description}
            </p>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {agent.size !== "—" && (
            <span className="flex items-center gap-1">
              <Database size={10} />
              {agent.size}
            </span>
          )}
          {agent.installCommand && (
            <span className="flex items-center gap-1 truncate max-w-[200px]">
              <Copy size={10} />
              <code className="truncate">{agent.installCommand}</code>
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          {!isInstalled && agent.installCommand && (
            <button
              onClick={() => copyInstall(agent)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-muted px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              {copiedId === agent.id ? (
                <>
                  <Check size={12} /> 已复制
                </>
              ) : (
                <>
                  <Copy size={12} /> 复制安装命令
                </>
              )}
            </button>
          )}

          {!isInstalled && (
            <button
              onClick={() => handleInstall(agent)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {agent.needsApiKey ? (
                <>
                  <Plug size={12} /> 一键接入
                </>
              ) : (
                <>
                  <Download size={12} /> 一键安装
                </>
              )}
            </button>
          )}

          {isInstalled && (
            <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
              <CheckCircle2 size={12} /> 已安装
            </span>
          )}
        </div>
      </div>
    );
  };

  // ---- tab content ----

  const renderMarket = () => (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-4 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索 Agent…"
              className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {renderCategoryFilter()}
        </div>
        <span className="text-xs text-muted-foreground">
          {filtered.length} 个 Agent
        </span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map(renderAgentCard)}
        </div>
      </div>
    </div>
  );

  const renderInstalled = () => (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="text-sm text-muted-foreground">
          共 {installedAgents.length} 个已安装 Agent
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {installedAgents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Download size={40} className="mb-4 opacity-30" />
            <p className="text-sm">暂无已安装的 Agent</p>
            <p className="text-xs mt-1">
              前往「Agent 市场」安装你需要的 Agent
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {installedAgents.map((agent) => (
              <div
                key={agent.id}
                className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {agent.icon}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-medium">{agent.name}</h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${typeColors[agent.type]}`}
                    >
                      {typeIcons[agent.type]}
                      {typeLabels[agent.type]}
                    </span>
                    {agent.status === "running" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        运行中
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {agent.description}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRun(agent.id)}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                      agent.status === "running"
                        ? "bg-amber-500/15 text-amber-400 hover:bg-amber-500/25"
                        : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                    }`}
                  >
                    {agent.status === "running" ? (
                      <>
                        <Square size={12} /> 停止
                      </>
                    ) : (
                      <>
                        <Play size={12} /> 启动
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => uninstallAgent(agent.id)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive/15 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/25"
                  >
                    <Trash2 size={12} /> 卸载
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderMySkills = () => (
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <Wrench size={40} className="mb-4 opacity-30" />
      <p className="text-sm">自定义技能即将上线</p>
      <p className="text-xs mt-1">你可以在这里创建和管理自己的 Agent 技能</p>
    </div>
  );

  // ---- main ----

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border px-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`relative px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {activeTab === tab.key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-primary" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "market" && renderMarket()}
        {activeTab === "installed" && renderInstalled()}
        {activeTab === "my" && renderMySkills()}
      </div>

      {/* Install Progress Overlay */}
      {installingAgent && (
        <InstallOverlay
          progress={installProgress}
          agentName={installingAgent.name}
        />
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* API Key Dialog */}
      <Dialog
        open={!!apiKeyAgent}
        onClose={() => {
          setApiKeyAgent(null);
          setApiKeyValue("");
        }}
        title={`接入 ${apiKeyAgent?.name ?? ""}`}
        description="输入你的 API Key 以接入该远程 Agent。"
        footer={
          <>
            <button
              onClick={() => {
                setApiKeyAgent(null);
                setApiKeyValue("");
              }}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              取消
            </button>
            <button
              onClick={handleApiKeySubmit}
              disabled={!apiKeyValue.trim()}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              <Plug size={12} /> 确认接入
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <label className="block text-xs text-muted-foreground">
            API Key
          </label>
          <input
            type="password"
            value={apiKeyValue}
            onChange={(e) => setApiKeyValue(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleApiKeySubmit();
            }}
          />
        </div>
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sync helper — merge registry state into the static agent list
// ---------------------------------------------------------------------------

function syncRegistryStatus(agents: Agent[]): Agent[] {
  const registry = getAgentRegistry();
  return agents.map((a) => {
    const reg = registry.getById(a.id);
    if (reg && reg.status !== "available") {
      return {
        ...a,
        status: reg.status as AgentStatus,
      };
    }
    return { ...a, status: "available" };
  });
}

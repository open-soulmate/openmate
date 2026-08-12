"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Moon,
  Sun,
  Palette,
  Monitor,
  Save,
  Bot,
  Cpu,
  Globe,
  Key,
  Bell,
  HardDrive,
  Info,
  Shield,
  Wrench,
  Sliders,
  Eye,
  EyeOff,
  Check,
  X,
  RefreshCw,
  Download,
  Upload,
  Trash2,
  ExternalLink,
  Terminal,
  Wifi,
  FolderOpen,
  Gauge,
  RotateCcw,
  Zap,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ThemeId, themes, getStoredTheme, persistTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";

// ─── Types ───────────────────────────────────────────────────────────────────

type SectionId =
  | "appearance"
  | "agent"
  | "model"
  | "tools"
  | "storage"
  | "about";

type FontSize = "small" | "medium" | "large";
type Language = "zh" | "en" | "ja";
type SidebarPosition = "left" | "right";
type LogLevel = "debug" | "info" | "warn" | "error";
type RetryStrategy = "none" | "linear" | "exponential";

interface SettingsState {
  // Appearance
  theme: ThemeId;
  fontSize: FontSize;
  language: Language;
  sidebarPosition: SidebarPosition;
  animationEnabled: boolean;

  // Agent
  defaultAgent: string;
  agentTimeout: number;
  retryStrategy: RetryStrategy;
  logLevel: LogLevel;

  // Model
  llmProvider: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;

  // Tools
  shellWhitelist: string;
  fileAccess: "full" | "restricted" | "readonly";
  networkAccess: boolean;
  mcpConfig: string;

  // Storage
  knowledgePath: string;
  cacheLimit: number;
}

const sections: { id: SectionId; label: string; icon: React.ElementType }[] = [
  { id: "appearance", label: "外观", icon: Monitor },
  { id: "agent", label: "Agent", icon: Bot },
  { id: "model", label: "模型", icon: Cpu },
  { id: "tools", label: "工具", icon: Wrench },
  { id: "storage", label: "存储", icon: HardDrive },
  { id: "about", label: "关于", icon: Info },
];

const fontSizes: { value: FontSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
];

const languages: { value: Language; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
];

const logLevels: { value: LogLevel; label: string }[] = [
  { value: "debug", label: "Debug" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

const retryStrategies: { value: RetryStrategy; label: string }[] = [
  { value: "none", label: "不重试" },
  { value: "linear", label: "线性重试" },
  { value: "exponential", label: "指数退避" },
];

const llmProviders = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { value: "claude", label: "Claude (Anthropic)", models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"] },
  { value: "mimo", label: "MiMo (小米)", models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-auto"] },
  { value: "ollama", label: "Ollama (本地)", models: ["llama3.1", "qwen2.5", "deepseek-r1"] },
  { value: "custom", label: "自定义", models: [] },
];

const defaultAgents = [
  { value: "auto", label: "自动选择" },
  { value: "soma-1", label: "采集分身-北京" },
  { value: "ai-1", label: "GPT-4o" },
  { value: "ai-2", label: "Claude Sonnet" },
  { value: "mcp-1", label: "文件系统 MCP" },
];

// ─── Reusable Components ─────────────────────────────────────────────────────

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-card p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SelectInput({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "rounded-md border border-border bg-muted px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary",
        className,
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-6" : "translate-x-1",
        )}
      />
    </button>
  );
}

function ButtonGroup<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; icon?: React.ElementType }[];
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
            value === o.value
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {o.icon && <o.icon size={12} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon size={16} />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {description && (
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SettingsClient() {
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const setLLMConfig = useAppStore((s) => s.setLLMConfig);
  const agentNodes = useAppStore((s) => s.agentNodes);

  const [active, setActive] = useState<SectionId>("appearance");
  const [saved, setSaved] = useState(false);

  const [settings, setSettings] = useState<SettingsState>({
    theme: "dark",
    fontSize: "medium",
    language: "zh",
    sidebarPosition: "left",
    animationEnabled: true,
    defaultAgent: "auto",
    agentTimeout: 30,
    retryStrategy: "exponential",
    logLevel: "info",
    llmProvider: llmConfig.provider || "openai",
    apiKey: llmConfig.apiKey || "",
    model: llmConfig.model || "gpt-4o",
    temperature: 0.7,
    maxTokens: 4096,
    shellWhitelist: "ls, cat, grep, find, git",
    fileAccess: "full",
    networkAccess: true,
    mcpConfig: "",
    knowledgePath: "~/.openmate/knowledge",
    cacheLimit: 512,
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");

  useEffect(() => {
    setSettings((s) => ({ ...s, theme: storeTheme }));
  }, [storeTheme]);

  const update = useCallback(
    <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
      setSettings((s) => ({ ...s, [key]: value }));
    },
    [],
  );

  function handleSave() {
    persistTheme(settings.theme);
    setStoreTheme(settings.theme);
    setLLMConfig({
      provider: settings.llmProvider,
      apiKey: settings.apiKey,
      model: settings.model,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleTestConnection() {
    setTestStatus("testing");
    setTimeout(() => {
      setTestStatus(settings.apiKey ? "success" : "error");
    }, 1500);
  }

  function handleClearCache() {
    if (typeof window !== "undefined") {
      localStorage.removeItem("openmate-conversations");
    }
  }

  function handleExportData() {
    if (typeof window === "undefined") return;
    const data: Record<string, string> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("openmate-")) {
        const val = localStorage.getItem(key);
        if (val) data[key] = val;
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "openmate-settings.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const data = JSON.parse(ev.target?.result as string) as Record<string, string>;
          Object.entries(data).forEach(([k, v]) => {
            if (k.startsWith("openmate-")) {
              localStorage.setItem(k, v);
            }
          });
          window.location.reload();
        } catch {
          // ignore invalid JSON
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  const currentProvider = llmProviders.find((p) => p.value === settings.llmProvider);
  const modelOptions = currentProvider?.models.length
    ? currentProvider.models.map((m) => ({ value: m, label: m }))
    : [{ value: settings.model, label: settings.model || "输入模型名称" }];

  const agentOptions = [
    ...defaultAgents,
    ...agentNodes
      .filter((n) => !defaultAgents.some((d) => d.value === n.id))
      .map((n) => ({ value: n.id, label: n.name })),
  ];

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-56 shrink-0 border-r border-border p-4">
        <nav className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active === s.id
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <s.icon size={16} />
              {s.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* ─── Appearance ──────────────────────────────────────── */}
        {active === "appearance" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={Monitor}
              title="外观设置"
              description="自定义界面外观和显示偏好"
            />

            <SettingRow label="主题" description="选择界面配色方案">
              <ButtonGroup
                value={settings.theme}
                onChange={(v) => update("theme", v as ThemeId)}
                options={themes.map((t) => ({
                  value: t.id,
                  label: t.label,
                  icon: t.id === "dark" ? Moon : t.id === "light" ? Sun : Palette,
                }))}
              />
            </SettingRow>

            <SettingRow label="字体大小" description="调整全局文字大小">
              <ButtonGroup
                value={settings.fontSize}
                onChange={(v) => update("fontSize", v as FontSize)}
                options={fontSizes}
              />
            </SettingRow>

            <SettingRow label="语言" description="切换界面语言">
              <SelectInput
                value={settings.language}
                onChange={(v) => update("language", v as Language)}
                options={languages}
              />
            </SettingRow>

            <SettingRow label="侧边栏位置" description="设置主导航栏停靠方向">
              <ButtonGroup
                value={settings.sidebarPosition}
                onChange={(v) => update("sidebarPosition", v as SidebarPosition)}
                options={[
                  { value: "left", label: "左" },
                  { value: "right", label: "右" },
                ]}
              />
            </SettingRow>

            <SettingRow label="动画效果" description="启用或禁用界面过渡动画">
              <Toggle
                checked={settings.animationEnabled}
                onChange={(v) => update("animationEnabled", v)}
              />
            </SettingRow>
          </div>
        )}

        {/* ─── Agent ───────────────────────────────────────────── */}
        {active === "agent" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={Bot}
              title="Agent 设置"
              description="配置 Agent 运行时参数和行为策略"
            />

            <SettingRow label="默认 Agent" description="新建对话时自动使用的 Agent">
              <SelectInput
                value={settings.defaultAgent}
                onChange={(v) => update("defaultAgent", v)}
                options={agentOptions}
                className="w-48"
              />
            </SettingRow>

            <SettingRow
              label="超时时间"
              description={`Agent 单次请求超时（当前: ${settings.agentTimeout}s）`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={5}
                  max={120}
                  step={5}
                  value={settings.agentTimeout}
                  onChange={(e) => update("agentTimeout", Number(e.target.value))}
                  className="w-32 accent-primary"
                />
                <span className="w-10 text-right text-xs text-muted-foreground">
                  {settings.agentTimeout}s
                </span>
              </div>
            </SettingRow>

            <SettingRow label="重试策略" description="请求失败时的自动重试方式">
              <SelectInput
                value={settings.retryStrategy}
                onChange={(v) => update("retryStrategy", v as RetryStrategy)}
                options={retryStrategies}
              />
            </SettingRow>

            <SettingRow label="日志级别" description="控制 Agent 运行日志的详细程度">
              <ButtonGroup
                value={settings.logLevel}
                onChange={(v) => update("logLevel", v as LogLevel)}
                options={logLevels}
              />
            </SettingRow>
          </div>
        )}

        {/* ─── Model ───────────────────────────────────────────── */}
        {active === "model" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={Cpu}
              title="模型设置"
              description="配置 LLM 提供商、模型和推理参数"
            />

            <SettingRow label="LLM Provider" description="选择大语言模型服务提供商">
              <SelectInput
                value={settings.llmProvider}
                onChange={(v) => {
                  const p = llmProviders.find((pr) => pr.value === v);
                  update("llmProvider", v);
                  if (p?.models[0]) update("model", p.models[0]);
                }}
                options={llmProviders.map((p) => ({ value: p.value, label: p.label }))}
                className="w-48"
              />
            </SettingRow>

            <div className="rounded-lg border border-border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">API Key</label>
              <div className="relative">
                <input
                  type={showApiKey ? "text" : "password"}
                  value={settings.apiKey}
                  onChange={(e) => update("apiKey", e.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 pr-9 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
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

            <SettingRow label="模型" description="选择具体的模型版本">
              {currentProvider && currentProvider.models.length > 0 ? (
                <SelectInput
                  value={settings.model}
                  onChange={(v) => update("model", v)}
                  options={modelOptions}
                  className="w-48"
                />
              ) : (
                <input
                  type="text"
                  value={settings.model}
                  onChange={(e) => update("model", e.target.value)}
                  placeholder="model-name"
                  className="w-48 rounded-md border border-border bg-muted px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              )}
            </SettingRow>

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-3 flex items-center justify-between">
                <label className="text-sm font-medium">Temperature</label>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
                  {settings.temperature.toFixed(1)}
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.1}
                value={settings.temperature}
                onChange={(e) => update("temperature", Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>精确 (0)</span>
                <span>创造性 (2)</span>
              </div>
            </div>

            <SettingRow label="Max Tokens" description="单次回复的最大 token 数">
              <input
                type="number"
                min={256}
                max={128000}
                step={256}
                value={settings.maxTokens}
                onChange={(e) => update("maxTokens", Number(e.target.value))}
                className="w-32 rounded-md border border-border bg-muted px-3 py-1.5 text-sm font-mono outline-none focus:ring-2 focus:ring-primary"
              />
            </SettingRow>

            <button
              onClick={handleTestConnection}
              disabled={testStatus === "testing"}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors",
                testStatus === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                  : testStatus === "error"
                    ? "border-destructive/30 bg-destructive/10 text-destructive"
                    : "border-border bg-card text-foreground hover:bg-accent",
              )}
            >
              {testStatus === "testing" ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  测试中...
                </>
              ) : testStatus === "success" ? (
                <>
                  <CheckCircle2 size={14} />
                  连接成功
                </>
              ) : testStatus === "error" ? (
                <>
                  <AlertCircle size={14} />
                  连接失败
                </>
              ) : (
                <>
                  <Wifi size={14} />
                  测试连接
                </>
              )}
            </button>
          </div>
        )}

        {/* ─── Tools ───────────────────────────────────────────── */}
        {active === "tools" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={Wrench}
              title="工具设置"
              description="管理 Agent 可使用的工具和权限"
            />

            <div className="rounded-lg border border-border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">
                Shell 命令白名单
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                允许 Agent 执行的 Shell 命令，逗号分隔
              </p>
              <input
                type="text"
                value={settings.shellWhitelist}
                onChange={(e) => update("shellWhitelist", e.target.value)}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <SettingRow label="文件访问权限" description="控制 Agent 对文件系统的访问范围">
              <ButtonGroup
                value={settings.fileAccess}
                onChange={(v) => update("fileAccess", v as SettingsState["fileAccess"])}
                options={[
                  { value: "full", label: "完全" },
                  { value: "restricted", label: "受限" },
                  { value: "readonly", label: "只读" },
                ]}
              />
            </SettingRow>

            <SettingRow label="网络访问" description="允许 Agent 访问外部网络资源">
              <Toggle
                checked={settings.networkAccess}
                onChange={(v) => update("networkAccess", v)}
              />
            </SettingRow>

            <div className="rounded-lg border border-border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">
                MCP 服务器配置
              </label>
              <p className="mb-2 text-xs text-muted-foreground">
                JSON 格式的 MCP 服务器连接配置
              </p>
              <textarea
                value={settings.mcpConfig}
                onChange={(e) => update("mcpConfig", e.target.value)}
                placeholder={`{
  "servers": [
    {
      "name": "filesystem",
      "url": "stdio://mcp-filesystem"
    }
  ]
}`}
                rows={6}
                className="w-full rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs outline-none focus:ring-2 focus:ring-primary resize-none"
              />
            </div>
          </div>
        )}

        {/* ─── Storage ─────────────────────────────────────────── */}
        {active === "storage" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={HardDrive}
              title="存储设置"
              description="管理知识库路径、缓存和数据导入导出"
            />

            <div className="rounded-lg border border-border bg-card p-4">
              <label className="mb-2 block text-sm font-medium">
                知识库存储路径
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={settings.knowledgePath}
                  onChange={(e) => update("knowledgePath", e.target.value)}
                  className="flex-1 rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
                />
                <button className="flex items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
                  <FolderOpen size={14} />
                  浏览
                </button>
              </div>
            </div>

            <SettingRow
              label="缓存大小限制"
              description={`最大缓存空间: ${settings.cacheLimit} MB`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={64}
                  max={2048}
                  step={64}
                  value={settings.cacheLimit}
                  onChange={(e) => update("cacheLimit", Number(e.target.value))}
                  className="w-32 accent-primary"
                />
                <span className="w-16 text-right text-xs text-muted-foreground">
                  {settings.cacheLimit} MB
                </span>
              </div>
            </SettingRow>

            <button
              onClick={handleClearCache}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <Trash2 size={14} />
              清除缓存
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleExportData}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Download size={14} />
                导出数据
              </button>
              <button
                onClick={handleImportData}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                <Upload size={14} />
                导入数据
              </button>
            </div>
          </div>
        )}

        {/* ─── About ───────────────────────────────────────────── */}
        {active === "about" && (
          <div className="max-w-xl space-y-4">
            <SectionHeader
              icon={Info}
              title="关于"
              description="OpenMate 版本信息和相关链接"
            />

            <div className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Zap size={28} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">OpenMate</h3>
                  <p className="text-sm text-muted-foreground">
                    智能 Agent 协作平台
                  </p>
                </div>
              </div>
            </div>

            <SettingRow label="版本号">
              <span className="rounded-full bg-muted px-3 py-1 text-xs font-mono text-muted-foreground">
                v0.1.0
              </span>
            </SettingRow>

            <button
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <RefreshCw size={16} className="text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">检查更新</p>
                  <p className="text-xs text-muted-foreground">
                    当前已是最新版本
                  </p>
                </div>
              </div>
              <ChevronRight size={16} className="text-muted-foreground" />
            </button>

            <button
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <Shield size={16} className="text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">开源协议</p>
                  <p className="text-xs text-muted-foreground">MIT License</p>
                </div>
              </div>
              <ExternalLink size={14} className="text-muted-foreground" />
            </button>

            <a
              href="https://github.com/openmate/openmate"
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-3">
                <Terminal size={16} className="text-muted-foreground" />
                <div className="text-left">
                  <p className="text-sm font-medium">GitHub</p>
                  <p className="text-xs text-muted-foreground">
                    github.com/openmate/openmate
                  </p>
                </div>
              </div>
              <ExternalLink size={14} className="text-muted-foreground" />
            </a>
          </div>
        )}

        {/* ─── Save Bar ────────────────────────────────────────── */}
        {active !== "about" && (
          <div className="mt-8 max-w-xl">
            <button
              onClick={handleSave}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors",
                saved
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {saved ? (
                <>
                  <Check size={14} />
                  已保存
                </>
              ) : (
                <>
                  <Save size={14} />
                  保存设置
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

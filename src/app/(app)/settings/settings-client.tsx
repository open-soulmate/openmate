"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Moon, Sun, Palette, Monitor, Save, Bot, Cpu, Globe, Key,
  HardDrive, Info, Wrench, Sliders, Eye, EyeOff, Check, X,
  RefreshCw, Download, Upload, Trash2, ExternalLink, Terminal,
  Wifi, FolderOpen, Gauge, RotateCcw, Zap, ChevronRight,
  CheckCircle2, AlertCircle, LogOut, User, Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ThemeId, themes, getStoredTheme, persistTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";
import { getApiBaseUrl, getToken, getUserId } from "@/lib/api-client";
import { useToast } from "@/components/toast-provider";
import i18n from "@/lib/i18n";

type SectionId = "appearance" | "agent" | "model" | "tools" | "storage" | "organs" | "account" | "about";

interface SettingsState {
  theme: ThemeId; fontSize: string; language: string; sidebarPosition: string; animationEnabled: boolean;
  defaultAgent: string; agentTimeout: number; retryStrategy: string; logLevel: string;
  llmProvider: string; apiKey: string; model: string; temperature: number; maxTokens: number;
  shellWhitelist: string; fileAccess: string; networkAccess: boolean; mcpConfig: string;
  knowledgePath: string; cacheLimit: number;
}

const sections: { id: SectionId; label: string; icon: React.ElementType; group: string }[] = [
  { id: "appearance", label: "外观", icon: Monitor, group: "界面设置" },
  { id: "model", label: "模型配置", icon: Cpu, group: "界面设置" },
  { id: "agent", label: "Agent", icon: Bot, group: "运行时" },
  { id: "tools", label: "工具权限", icon: Wrench, group: "运行时" },
  { id: "storage", label: "存储", icon: HardDrive, group: "运行时" },
  { id: "organs", label: "器官管理", icon: Zap, group: "运行时" },
  { id: "account", label: "账户", icon: User, group: "账户" },
  { id: "about", label: "关于", icon: Info, group: "账户" },
];

const llmProviders = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { value: "claude", label: "Claude (Anthropic)", models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"] },
  { value: "mimo", label: "MiMo (小米)", models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-auto"] },
  { value: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-coder", "deepseek-r1"] },
  { value: "qwen", label: "Qwen (通义)", models: ["qwen-max", "qwen-plus", "qwen-turbo"] },
  { value: "ollama", label: "Ollama (本地)", models: ["llama3.1", "qwen2.5", "deepseek-r1"] },
  { value: "custom", label: "自定义", models: [] },
];

// ─── Reusable Components ─────────────────────────────────────────────

function SettingCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-sm font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between">
      {label && <span className="text-sm">{label}</span>}
      <button onClick={() => onChange(!checked)} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30">
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function ButtonGroup<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string; icon?: React.ElementType }[] }) {
  return (
    <div className="flex gap-1 rounded-lg border border-border p-0.5 bg-muted/50">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all", value === o.value ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}>
          {o.icon && <o.icon size={12} />}{o.label}
        </button>
      ))}
    </div>
  );
}

function Slider({ value, onChange, min, max, step, unit }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; unit?: string }) {
  return (
    <div className="flex items-center gap-3">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-primary" />
      <span className="text-sm font-mono text-muted-foreground min-w-16 text-right">{value}{unit}</span>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative">
      <input type={type === "password" && !showPassword ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30 pr-8" />
      {type === "password" && (
        <button onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────

export function SettingsClient() {
  const router = useRouter();
  const storeTheme = useAppStore((s) => s.theme);
  const setStoreTheme = useAppStore((s) => s.setTheme);
  const llmConfig = useAppStore((s) => s.llmConfig);
  const setLLMConfig = useAppStore((s) => s.setLLMConfig);

  const [active, setActive] = useState<SectionId>(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "") as SectionId;
      if (["appearance","agent","model","tools","storage","account","about"].includes(hash)) return hash;
    }
    return "appearance";
  });
  const [saved, setSaved] = useState(false);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [backendVersion, setBackendVersion] = useState<string>("");

  const [settings, setSettings] = useState<SettingsState>({
    theme: "dark", fontSize: "medium", language: "zh", sidebarPosition: "left", animationEnabled: true,
    defaultAgent: "auto", agentTimeout: 30, retryStrategy: "exponential", logLevel: "info",
    llmProvider: "mimo", apiKey: "", model: "mimo-v2.5-pro",
    temperature: 0.7, maxTokens: 4096,
    shellWhitelist: "ls, cat, grep, find, git", fileAccess: "full", networkAccess: true, mcpConfig: "",
    knowledgePath: "~/.openmate/knowledge", cacheLimit: 512,
  });

  // Load backend config on mount
  useEffect(() => {
    const apiBase = getApiBaseUrl();
    const loadBackendConfig = async () => {
      try {
        // Load config
        const res = await fetch(`${apiBase}/api/config`);
        if (res.ok) {
          const data = await res.json();
          if (data.models?.default) {
            setSettings(s => ({ ...s, model: data.models.default }));
          }
        }
        // Load version
        const vRes = await fetch(`${apiBase}/api/version`);
        if (vRes.ok) {
          const vData = await vRes.json();
          setBackendVersion(vData.version || "");
        }
      } catch {} finally {
        setLoadingConfig(false);
      }
    };
    loadBackendConfig();
  }, []);

  useEffect(() => { setSettings((s) => ({ ...s, theme: storeTheme })); }, [storeTheme]);

  const update = useCallback(<K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  async function handleSave() {
    // Save local settings
    persistTheme(settings.theme);
    setStoreTheme(settings.theme);
    i18n.changeLanguage(settings.language);
    localStorage.setItem("openmate-language", settings.language);
    setLLMConfig({ provider: settings.llmProvider, apiKey: settings.apiKey, model: settings.model });

    // Save to backend config
    const apiBase = getApiBaseUrl();
    try {
      await fetch(`${apiBase}/api/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: {
            models: {
              default: settings.model,
              provider: settings.llmProvider,
            },
            agent: {
              default: settings.defaultAgent,
              timeout: settings.agentTimeout,
              retry_strategy: settings.retryStrategy,
              log_level: settings.logLevel,
            },
            tools: {
              shell_whitelist: settings.shellWhitelist,
              file_access: settings.fileAccess,
              network_access: settings.networkAccess,
            },
            storage: {
              knowledge_path: settings.knowledgePath,
              cache_limit_mb: settings.cacheLimit,
            },
          },
        }),
      });
    } catch {}

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() {
    localStorage.removeItem("openmate-token");
    localStorage.removeItem("openmate-api-url");
    window.location.href = "/login";
  }

  // ── Export / Import / Clear Cache ───────────────────────────────────
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleExportData() {
    try {
      const state = useAppStore.getState();
      const data = {
        version: "0.1.0",
        exported_at: new Date().toISOString(),
        settings: settings,
        theme: getStoredTheme(),
        api_url: getApiBaseUrl(),
        user_id: getUserId(),
        // Export store data
        workspaces: state.workspaces,
        conversations: state.conversations,
        knowledgeItems: state.knowledgeItems,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openmate-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("导出成功", "设置和数据已导出为 JSON 文件");
    } catch (e) {
      toast.error("导出失败", e instanceof Error ? e.message : "未知错误");
    }
  }

  function handleImportData() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.version) {
        toast.error("导入失败", "文件格式不正确，缺少版本信息");
        return;
      }
      // Restore settings
      if (data.settings) {
        setSettings((prev) => ({ ...prev, ...data.settings }));
      }
      // Restore store data
      const store = useAppStore.getState();
      if (data.knowledgeItems && store.setKnowledgeItems) {
        store.setKnowledgeItems(data.knowledgeItems);
      }

      toast.success("导入成功", `已从 ${file.name} 恢复设置数据`);
    } catch (e) {
      toast.error("导入失败", e instanceof Error ? e.message : "文件解析错误");
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleClearCache() {
    if (!confirm("确定要清除所有缓存数据吗？这不会删除你的知识库和设置。")) return;
    try {
      // Clear localStorage caches (not auth tokens)
      const keysToKeep = ["openmate-token", "openmate-api-url", "openmate-user-id", "openmate-theme"];
      const allKeys = Object.keys(localStorage);
      for (const key of allKeys) {
        if (!keysToKeep.includes(key)) {
          localStorage.removeItem(key);
        }
      }
      // Clear caches API if available
      const apiBase = getApiBaseUrl();
      try {
        await fetch(`${apiBase}/api/admin/clear-cache`, { method: "POST" });
      } catch {}
      toast.success("缓存已清除", "本地缓存数据已清理完毕");
    } catch (e) {
      toast.error("清除失败", e instanceof Error ? e.message : "未知错误");
    }
  }

  async function handleTestConnection() {
    setTestStatus("testing");
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/health`);
      if (res.ok) {
        setTestStatus("success");
      } else {
        setTestStatus("error");
      }
    } catch {
      setTestStatus("error");
    }
    setTimeout(() => setTestStatus("idle"), 3000);
  }

  const currentProvider = llmProviders.find((p) => p.value === settings.llmProvider);
  const modelOptions = currentProvider?.models.length ? currentProvider.models.map((m) => ({ value: m, label: m })) : [{ value: settings.model, label: settings.model || "输入模型名称" }];

  // Group sections
  const groups = sections.reduce<Record<string, typeof sections>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});

  return (
    <div className="flex h-full">
      {/* Left Sidebar - Settings Navigation */}
      <div className="w-56 shrink-0 border-r border-border bg-card/50 p-4 flex flex-col">
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-1">
            <Settings size={14} className="text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">设置</span>
          </div>
        </div>
        <nav className="flex-1 space-y-4">
          {Object.entries(groups).map(([group, items]) => (
            <div key={group}>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1.5">{group}</div>
              {items.map((s) => (
                <button key={s.id} onClick={() => setActive(s.id)}
                  className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors", active === s.id ? "bg-accent text-foreground font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
                  <s.icon size={15} />{s.label}
                </button>
              ))}
            </div>
          ))}
        </nav>
        {/* Version info */}
        <div className="mt-auto pt-4 border-t border-border">
          <div className="text-[10px] text-muted-foreground px-3 space-y-0.5">
            <div>OpenMate v0.1.0</div>
            {backendVersion && <div>OpenSoul v{backendVersion}</div>}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-8 py-8 space-y-6">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>设置</span><ChevronRight size={10} />
            <span>{sections.find(s => s.id === active)?.group}</span><ChevronRight size={10} />
            <span className="text-foreground">{sections.find(s => s.id === active)?.label}</span>
          </div>

          {/* ─── Appearance ──────────────────────────────────── */}
          {active === "appearance" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Monitor size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">外观设置</h1><p className="text-xs text-muted-foreground">自定义界面外观和显示偏好</p></div>
              </div>

              <SettingCard title="主题" description="选择界面配色方案">
                <ButtonGroup value={settings.theme} onChange={(v) => update("theme", v as ThemeId)}
                  options={themes.map((t) => ({ value: t.id, label: t.label, icon: t.id === "dark" ? Moon : t.id === "light" ? Sun : Palette }))} />
              </SettingCard>

              <SettingCard title="字体大小" description="调整全局文字大小">
                <ButtonGroup value={settings.fontSize} onChange={(v) => update("fontSize", v)}
                  options={[{ value: "small", label: "小" }, { value: "medium", label: "中" }, { value: "large", label: "大" }]} />
              </SettingCard>

              <SettingCard title="语言" description="切换界面语言">
                <SelectInput value={settings.language} onChange={(v) => update("language", v)}
                  options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }]} />
              </SettingCard>

              <SettingCard title="动画效果" description="启用或禁用界面过渡动画">
                <Toggle checked={settings.animationEnabled} onChange={(v) => update("animationEnabled", v)} />
              </SettingCard>
            </>
          )}

          {/* ─── Model ───────────────────────────────────────── */}
          {active === "model" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Cpu size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">模型配置</h1><p className="text-xs text-muted-foreground">配置 LLM 提供商和模型参数</p></div>
              </div>

              <SettingCard title="LLM 提供商" description="选择 AI 模型提供商">
                <SelectInput value={settings.llmProvider} onChange={(v) => { update("llmProvider", v); const p = llmProviders.find(p => p.value === v); if (p?.models[0]) update("model", p.models[0]); }}
                  options={llmProviders.map(p => ({ value: p.value, label: p.label }))} />
              </SettingCard>

              <SettingCard title="模型" description="选择具体的模型版本">
                <SelectInput value={settings.model} onChange={(v) => update("model", v)} options={modelOptions} />
              </SettingCard>

              <SettingCard title="API Key" description="输入你的 API 密钥">
                <TextInput value={settings.apiKey} onChange={(v) => update("apiKey", v)} placeholder="sk-..." type="password" />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleTestConnection}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5">
                    {testStatus === "testing" ? <RefreshCw size={12} className="animate-spin" /> : testStatus === "success" ? <CheckCircle2 size={12} className="text-green-500" /> : testStatus === "error" ? <AlertCircle size={12} className="text-red-500" /> : <Wifi size={12} />}
                    测试连接
                  </button>
                </div>
              </SettingCard>

              <SettingCard title="Temperature" description={`控制输出随机性: ${settings.temperature}`}>
                <Slider value={settings.temperature} onChange={(v) => update("temperature", v)} min={0} max={2} step={0.1} />
              </SettingCard>

              <SettingCard title="Max Tokens" description="单次回复最大 token 数">
                <Slider value={settings.maxTokens} onChange={(v) => update("maxTokens", v)} min={256} max={16384} step={256} />
              </SettingCard>
            </>
          )}

          {/* ─── Agent ───────────────────────────────────────── */}
          {active === "agent" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Bot size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">Agent 设置</h1><p className="text-xs text-muted-foreground">配置 Agent 运行时参数和行为策略</p></div>
              </div>

              <SettingCard title="默认 Agent" description="系统默认使用的 Agent">
                <SelectInput value={settings.defaultAgent} onChange={(v) => update("defaultAgent", v)}
                  options={[{ value: "auto", label: "自动选择" }, { value: "hermes", label: "Hermes" }, { value: "mimo", label: "MiMo" }]} />
              </SettingCard>

              <SettingCard title="Agent 超时" description={`单次执行最大等待时间: ${settings.agentTimeout}s`}>
                <Slider value={settings.agentTimeout} onChange={(v) => update("agentTimeout", v)} min={5} max={300} step={5} unit="s" />
              </SettingCard>

              <SettingCard title="重试策略" description="请求失败时的重试方式">
                <ButtonGroup value={settings.retryStrategy} onChange={(v) => update("retryStrategy", v)}
                  options={[{ value: "none", label: "不重试" }, { value: "linear", label: "线性" }, { value: "exponential", label: "指数退避" }]} />
              </SettingCard>

              <SettingCard title="日志级别" description="控制日志输出详细程度">
                <ButtonGroup value={settings.logLevel} onChange={(v) => update("logLevel", v)}
                  options={[{ value: "debug", label: "Debug" }, { value: "info", label: "Info" }, { value: "warn", label: "Warn" }, { value: "error", label: "Error" }]} />
              </SettingCard>
            </>
          )}

          {/* ─── Tools ───────────────────────────────────────── */}
          {active === "tools" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Wrench size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">工具权限</h1><p className="text-xs text-muted-foreground">控制 Agent 可以使用的工具和权限范围</p></div>
              </div>

              <SettingCard title="Shell 白名单" description="允许 Agent 执行的命令（逗号分隔）">
                <TextInput value={settings.shellWhitelist} onChange={(v) => update("shellWhitelist", v)} placeholder="ls, cat, grep" />
              </SettingCard>

              <SettingCard title="文件访问" description="Agent 的文件系统访问权限">
                <ButtonGroup value={settings.fileAccess} onChange={(v) => update("fileAccess", v)}
                  options={[{ value: "full", label: "完全访问" }, { value: "restricted", label: "受限" }, { value: "readonly", label: "只读" }]} />
              </SettingCard>

              <SettingCard title="网络访问" description="允许 Agent 访问外部网络">
                <Toggle checked={settings.networkAccess} onChange={(v) => update("networkAccess", v)} />
              </SettingCard>
            </>
          )}

          {/* ─── Storage ─────────────────────────────────────── */}
          {active === "storage" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><HardDrive size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">存储管理</h1><p className="text-xs text-muted-foreground">管理知识库路径和缓存设置</p></div>
              </div>

              <SettingCard title="知识库路径" description="本地知识库存储位置">
                <TextInput value={settings.knowledgePath} onChange={(v) => update("knowledgePath", v)} placeholder="~/.openmate/knowledge" />
              </SettingCard>

              <SettingCard title="缓存限制" description={`最大缓存空间: ${settings.cacheLimit}MB`}>
                <Slider value={settings.cacheLimit} onChange={(v) => update("cacheLimit", v)} min={64} max={4096} step={64} unit="MB" />
              </SettingCard>

              <SettingCard title="数据管理" description="导出、导入或清除本地数据">
                <div className="flex gap-2">
                  <button onClick={handleExportData} className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5"><Download size={12} />导出数据</button>
                  <button onClick={handleImportData} className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5"><Upload size={12} />导入数据</button>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                  <button onClick={handleClearCache} className="px-3 py-2 rounded-lg border border-red-500/30 text-xs text-red-500 hover:bg-red-500/5 flex items-center gap-1.5"><Trash2 size={12} />清除缓存</button>
                </div>
              </SettingCard>
            </>
          )}

          {/* ─── Organs ──────────────────────────────────────── */}
          {active === "organs" && (
            <OrgansSection apiBase={getApiBaseUrl()} />
          )}

          {/* ─── Account ─────────────────────────────────────── */}
          {active === "account" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><User size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">账户</h1><p className="text-xs text-muted-foreground">管理你的账户信息和登录状态</p></div>
              </div>

              <SettingCard title="用户信息">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {(getUserId() || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-sm font-medium">{getUserId() || "User"}</div>
                    <div className="text-xs text-muted-foreground">已登录</div>
                  </div>
                </div>
              </SettingCard>

              <SettingCard title="API 地址" description="当前连接的 OpenSoul 后端地址">
                <div className="text-sm font-mono text-muted-foreground p-2 rounded bg-muted/50">{getApiBaseUrl()}</div>
              </SettingCard>

              <SettingCard title="退出登录" description="清除本地登录状态，返回登录页面">
                <button onClick={handleLogout} className="px-4 py-2 rounded-lg border border-red-500/30 text-sm text-red-500 hover:bg-red-500/5 flex items-center gap-2">
                  <LogOut size={14} />退出登录
                </button>
              </SettingCard>
            </>
          )}

          {/* ─── About ───────────────────────────────────────── */}
          {active === "about" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Info size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">关于</h1><p className="text-xs text-muted-foreground">OpenMate 版本和项目信息</p></div>
              </div>

              <SettingCard title="OpenMate">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">前端版本</span><span className="font-mono">v0.1.0</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">后端版本</span><span className="font-mono">{backendVersion || "检测中..."}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">框架</span><span>Next.js + Tauri</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">后端</span><span>OpenSoul (FastAPI)</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">许可证</span><span>MIT</span></div>
                </div>
              </SettingCard>

              <SettingCard title="25组件生态">
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {["OpenSoul", "OpenMate", "OpenSoma", "OpenCortex", "OpenNerve", "OpenVein", "OpenSense", "OpenWill", "OpenVital", "OpenGland", "OpenImmune", "OpenMarrow", "OpenGene", "OpenEcho", "OpenMirror", "OpenLink", "OpenHippo", "OpenReflex", "OpenHeredity", "OpenNest", "OpenPulse", "OpenLimb", "OpenVoice", "OpenVision", "OpenMind"].map(name => (
                    <div key={name} className="flex items-center gap-1.5 p-1.5 rounded bg-muted/50">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </SettingCard>

              <SettingCard title="链接">
                <div className="space-y-2">
                  <a href="https://github.com/open-soulmate" target="_blank" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink size={14} />GitHub 仓库
                  </a>
                  <a href="#" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink size={14} />使用文档
                  </a>
                </div>
              </SettingCard>
            </>
          )}

          {/* Save button */}
          <div className="sticky bottom-0 pt-4 pb-6 bg-background/80 backdrop-blur-sm">
            <button onClick={handleSave} className={cn("w-full px-4 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all",
              saved ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {saved ? <><Check size={16} />已保存</> : <><Save size={16} />保存设置</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Organs Management Section ─────────────────────────────────────
function OrgansSection({ apiBase }: { apiBase: string }) {
  const [organs, setOrgans] = useState<Array<{ key: string; enabled: boolean; config: Record<string, unknown> }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${apiBase}/api/organs`)
      .then(r => r.json())
      .then(data => setOrgans(data.organs || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [apiBase]);

  const toggleOrgan = async (key: string, enabled: boolean) => {
    try {
      await fetch(`${apiBase}/api/organs/${key}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      setOrgans(prev => prev.map(o => o.key === key ? { ...o, enabled } : o));
    } catch {}
  };

  const organLabels: Record<string, { label: string; emoji: string }> = {
    cortex: { label: "皮层", emoji: "🧠" }, nerve: { label: "神经", emoji: "⚡" },
    vein: { label: "血管", emoji: "🩸" }, sense: { label: "感官", emoji: "👁" },
    will: { label: "意志", emoji: "✨" }, immune: { label: "免疫", emoji: "🛡" },
    vital: { label: "体征", emoji: "📊" }, marrow: { label: "骨髓", emoji: "🦴" },
    gland: { label: "腺体", emoji: "🧪" }, gene: { label: "基因", emoji: "🧬" },
    echo: { label: "回声", emoji: "🔊" }, mirror: { label: "镜像", emoji: "🪞" },
    link: { label: "突触", emoji: "🔗" }, hippo: { label: "海马体", emoji: "🧠" },
    reflex: { label: "反射", emoji: "⚡" }, heredity: { label: "遗传链", emoji: "🔗" },
    pulse: { label: "脉搏", emoji: "💓" }, nest: { label: "巢穴", emoji: "🏠" },
    limb: { label: "四肢", emoji: "💪" }, voice: { label: "声带", emoji: "🎤" },
    vision: { label: "视觉", emoji: "🎨" }, mind: { label: "心智", emoji: "💭" },
    trajectory: { label: "轨迹", emoji: "📊" }, mcp: { label: "MCP", emoji: "🔌" },
    learn: { label: "学习", emoji: "📚" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw size={16} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  const enabledCount = organs.filter(o => o.enabled).length;

  return (
    <>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Zap size={16} className="text-primary" /></div>
        <div><h1 className="text-lg font-semibold">器官管理</h1><p className="text-xs text-muted-foreground">启用或禁用系统器官组件 ({enabledCount}/{organs.length} 已启用)</p></div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {organs.map(organ => {
            const info = organLabels[organ.key] || { label: organ.key, emoji: "⚙️" };
            return (
              <div key={organ.key} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                <div className="flex items-center gap-2.5">
                  <span className="text-lg">{info.emoji}</span>
                  <div>
                    <div className="text-sm font-medium">{info.label}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{organ.key}</div>
                  </div>
                </div>
                <button
                  onClick={() => toggleOrgan(organ.key, !organ.enabled)}
                  className={cn(
                    "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                    organ.enabled ? "bg-green-500" : "bg-muted-foreground/30"
                  )}
                >
                  <span className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                    organ.enabled ? "translate-x-4" : "translate-x-0.5"
                  )} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

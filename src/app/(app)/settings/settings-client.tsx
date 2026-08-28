"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Moon, Sun, Palette, Monitor, Save, Bot, Cpu, Globe, Key,
  HardDrive, Info, Wrench, Sliders, Eye, EyeOff, Check, X,
  RefreshCw, Download, Upload, Trash2, ExternalLink, Terminal,
  Wifi, FolderOpen, Gauge, RotateCcw, Zap, ChevronRight,
  CheckCircle2, AlertCircle, LogOut, User, Settings, Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type ThemeId, getThemes, getStoredTheme, persistTheme } from "@/lib/theme";
import { useAppStore } from "@/stores/app-store";
import { getApiBaseUrl, getToken, getUserId, getUserName } from "@/lib/api-client";
import { useToast } from "@/components/toast-provider";
import i18n from "@/lib/i18n";
import { useTranslation } from "react-i18next";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type SectionId = "appearance" | "agent" | "model" | "tools" | "storage" | "organs" | "account" | "about";

interface SettingsState {
  theme: ThemeId; fontSize: string; language: string; sidebarPosition: string; animationEnabled: boolean;
  defaultAgent: string; agentTimeout: number; retryStrategy: string; logLevel: string;
  llmProvider: string; apiKey: string; url: string; model: string; temperature: number; maxTokens: number;
  shellWhitelist: string; fileAccess: string; networkAccess: boolean; mcpConfig: string;
  knowledgePath: string; cacheLimit: number;
}

// sections defined inside SettingsClient for i18n

const llmProviders = [
  { value: "openai", label: "OpenAI", models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"] },
  { value: "claude", label: "Claude (Anthropic)", models: ["claude-sonnet-4-20250514", "claude-haiku-4-20250514"] },
  { value: "mimo", label: "MiMo", models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-auto"] },
  { value: "deepseek", label: "DeepSeek", models: ["deepseek-chat", "deepseek-coder", "deepseek-r1"] },
  { value: "qwen", label: "Qwen", models: ["qwen-max", "qwen-plus", "qwen-turbo"] },
  { value: "ollama", label: "Ollama (Local)", models: ["llama3.1", "qwen2.5", "deepseek-r1"] },
  { value: "custom", label: "Custom", models: [] },
];

// ─── Reusable Components ─────────────────────────────────────────────

function SettingCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-3">
      <div>
        <h3 className="text-xs lg:text-sm font-medium">{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center justify-between">
      {label && <span className="text-xs lg:text-sm">{label}</span>}
      <button onClick={() => onChange(!checked)} className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition-colors", checked ? "bg-primary" : "bg-muted-foreground/30")}>
        <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform shadow-sm", checked ? "translate-x-[18px]" : "translate-x-[3px]")} />
      </button>
    </div>
  );
}

function SelectInput({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30">
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
      <span className="text-xs lg:text-sm font-mono text-muted-foreground min-w-16 text-right">{value}{unit}</span>
    </div>
  );
}

function TextInput({ value, onChange, placeholder, type = "text" }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="relative">
      <input type={type === "password" && !showPassword ? "password" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:ring-2 focus:ring-primary/30 pr-8" />
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
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const [showSidebar, setShowSidebar] = useState(false);

  const sections: { id: SectionId; label: string; icon: React.ElementType; group: string }[] = [
    { id: "appearance", label: t("settings.appearance"), icon: Monitor, group: t("settings.uiSettings") },
    { id: "model", label: t("settings.modelConfig"), icon: Cpu, group: t("settings.uiSettings") },
    { id: "agent", label: "Agent", icon: Bot, group: t("settings.runtime") },
    { id: "tools", label: t("settings.toolPermissions"), icon: Wrench, group: t("settings.runtime") },
    { id: "storage", label: t("settings.storage"), icon: HardDrive, group: t("settings.runtime") },
    { id: "organs", label: t("settings.organManagement"), icon: Zap, group: t("settings.runtime") },
    { id: "account", label: t("settings.account"), icon: User, group: t("settings.account") },
    { id: "about", label: t("settings.about"), icon: Info, group: t("settings.account") },
  ];

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
    llmProvider: "mimo", apiKey: "", url: "", model: "mimo-v2.5-pro",
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
        // Load LLM config (api_key, model)
        try {
          const llmRes = await fetch(`${apiBase}/api/llm/config`);
          if (llmRes.ok) {
            const llmData = await llmRes.json();
            setSettings(s => ({
              ...s,
              ...(llmData.model ? { model: llmData.model } : {}),
              ...(llmData.base_url ? { url: llmData.base_url } : {}),
            }));
          }
        } catch {}
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
    const apiBase = getApiBaseUrl();

    // Only save settings for the current tab
    switch (active) {
      case "appearance":
        persistTheme(settings.theme);
        setStoreTheme(settings.theme);
        i18n.changeLanguage(settings.language);
        localStorage.setItem("openmate-language", settings.language);
        break;

      case "model":
        setLLMConfig({ provider: settings.llmProvider, apiKey: settings.apiKey, url: settings.url, model: settings.model });
        // Save LLM config to backend
        try {
          await fetch(`${apiBase}/api/llm/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: settings.apiKey || undefined,
              base_url: settings.url || undefined,
              model: settings.model || undefined,
            }),
          });
        } catch {}
        break;

      case "agent":
        // Save agent config to backend
        try {
          await fetch(`${apiBase}/api/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                agent: {
                  default: settings.defaultAgent,
                  timeout: settings.agentTimeout,
                  retry_strategy: settings.retryStrategy,
                  log_level: settings.logLevel,
                },
              },
            }),
          });
        } catch {}
        break;

      case "tools":
        try {
          await fetch(`${apiBase}/api/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                tools: {
                  shell_whitelist: settings.shellWhitelist,
                  file_access: settings.fileAccess,
                  network_access: settings.networkAccess,
                },
              },
            }),
          });
        } catch {}
        break;

      case "storage":
        try {
          await fetch(`${apiBase}/api/config`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              data: {
                storage: {
                  knowledge_path: settings.knowledgePath,
                  cache_limit_mb: settings.cacheLimit,
                },
              },
            }),
          });
        } catch {}
        break;

      default:
        break;
    }

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
      toast.success(t("settings.exportSuccess"), t("settings.exportSuccessDesc"));
    } catch (e) {
      toast.error(t("settings.exportFailed"), e instanceof Error ? e.message : t("settings.unknownError"));
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
        toast.error(t("settings.importFailed"), t("settings.importFailedDesc"));
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

      toast.success(t("settings.importSuccess"), `${file.name}`);
    } catch (e) {
      toast.error(t("settings.importFailed"), e instanceof Error ? e.message : t("settings.fileParseError"));
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleClearCache() {
    if (!confirm(t("settings.confirmClearCache"))) return;
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
      toast.success(t("settings.cacheCleared"), t("settings.cacheClearedDesc"));
    } catch (e) {
      toast.error(t("settings.clearFailed"), e instanceof Error ? e.message : t("settings.unknownError"));
    }
  }

  async function handleTestConnection() {
    setTestStatus("testing");
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/llm/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          base_url: settings.url || undefined,
          api_key: settings.apiKey || undefined,
          model: settings.model || undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.status === "ok") {
          setTestStatus("success");
          toast.success(
            t("settings.testSuccess") || "连接成功",
            `${data.model} @ ${data.base_url} — ${data.reply}`
          );
        } else {
          setTestStatus("error");
        }
      } else {
        const err = await res.json().catch(() => ({}));
        setTestStatus("error");
        toast.error(
          t("settings.testFailed") || "连接失败",
          err.detail || `HTTP ${res.status}`
        );
      }
    } catch (e) {
      setTestStatus("error");
      toast.error(
        t("settings.testFailed") || "连接失败",
        e instanceof Error ? e.message : t("settings.networkError") || "网络错误"
      );
    }
    setTimeout(() => setTestStatus("idle"), 3000);
  }

  const currentProvider = llmProviders.find((p) => p.value === settings.llmProvider);
  const modelOptions = currentProvider?.models.length ? currentProvider.models.map((m) => ({ value: m, label: m })) : [{ value: settings.model, label: settings.model || t("settings.inputModelName") }];

  // Group sections
  const groups = sections.reduce<Record<string, typeof sections>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group].push(s);
    return acc;
  }, {});

  // Sidebar content extracted for reuse in both PC and mobile Sheet
  const SidebarNav = () => (
    <>
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={14} className="text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t("settings.title")}</span>
        </div>
      </div>
      <nav className="flex-1 space-y-4">
        {Object.entries(groups).map(([group, items]) => (
          <div key={group}>
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 mb-1.5">{group}</div>
            {items.map((s) => (
              <button key={s.id} onClick={() => { setActive(s.id); if (isMobile) setShowSidebar(false); }}
                className={cn("flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs lg:text-sm transition-colors", active === s.id ? "bg-[rgba(124,58,237,0.12)] text-[#7c3aed] font-medium" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground")}>
                <s.icon size={15} />{s.label}
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-border">
        <div className="text-[10px] text-muted-foreground px-3 space-y-0.5">
          <div>OpenMate v0.1.0</div>
          {backendVersion && <div>OpenSoul v{backendVersion}</div>}
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* Mobile: top bar with hamburger + current section */}
      {isMobile && (
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/50 shrink-0">
          <button onClick={() => setShowSidebar(true)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground">
            <Menu size={18} />
          </button>
          <div className="flex items-center gap-1.5 text-xs lg:text-sm">
            <span className="text-muted-foreground">{sections.find(s => s.id === active)?.group}</span>
            <ChevronRight size={12} className="text-muted-foreground" />
            <span className="font-medium">{sections.find(s => s.id === active)?.label}</span>
          </div>
        </div>
      )}

      {/* Mobile: Sheet drawer for sidebar */}
      {isMobile ? (
        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
          <SheetContent side="left" className="w-64 p-4 flex flex-col">
            <SidebarNav />
          </SheetContent>
        </Sheet>
      ) : (
        /* PC: fixed sidebar */
        <div className="w-56 shrink-0 border-r border-border bg-card/50 p-4 flex flex-col">
          <SidebarNav />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-2xl mx-auto px-4 md:px-8 py-3 lg:py-6 md:py-8 space-y-6">
          {/* Breadcrumb - hidden on mobile (shown in top bar) */}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>{t("settings.title")}</span><ChevronRight size={10} />
            <span>{sections.find(s => s.id === active)?.group}</span><ChevronRight size={10} />
            <span className="text-foreground">{sections.find(s => s.id === active)?.label}</span>
          </div>

          {/* ─── Appearance ──────────────────────────────────── */}
          {active === "appearance" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Monitor size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">{t("settings.appearanceSettings")}</h1><p className="text-xs text-muted-foreground">{t("settings.appearanceDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.theme")} description={t("settings.themeDesc")}>
                <ButtonGroup value={settings.theme} onChange={(v) => update("theme", v as ThemeId)}
                  options={getThemes().map((t) => ({ value: t.id, label: t.label, icon: t.id === "dark" ? Moon : t.id === "light" ? Sun : Palette }))} />
              </SettingCard>

              <SettingCard title={t("settings.fontSize")} description={t("settings.fontSizeDesc")}>
                <ButtonGroup value={settings.fontSize} onChange={(v) => update("fontSize", v)}
                  options={[{ value: "small", label: t("settings.small") }, { value: "medium", label: t("settings.medium") }, { value: "large", label: t("settings.large") }]} />
              </SettingCard>

              <SettingCard title={t("settings.language")} description={t("settings.languageDesc")}>
                <SelectInput value={settings.language} onChange={(v) => update("language", v)}
                  options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }]} />
              </SettingCard>

              <SettingCard title={t("settings.animationEffects")} description={t("settings.animationDesc")}>
                <Toggle checked={settings.animationEnabled} onChange={(v) => update("animationEnabled", v)} />
              </SettingCard>
            </>
          )}

          {/* ─── Model ───────────────────────────────────────── */}
          {active === "model" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Cpu size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">{t("settings.modelConfig")}</h1><p className="text-xs text-muted-foreground">{t("settings.modelConfigDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.llmProvider")} description={t("settings.llmProviderDesc")}>
                <SelectInput value={settings.llmProvider} onChange={(v) => { update("llmProvider", v); const p = llmProviders.find(p => p.value === v); if (p?.models[0]) update("model", p.models[0]); }}
                  options={llmProviders.map(p => ({ value: p.value, label: p.label }))} />
              </SettingCard>

              <SettingCard title={t("settings.model")} description={t("settings.modelDesc")}>
                <SelectInput value={settings.model} onChange={(v) => update("model", v)} options={modelOptions} />
              </SettingCard>

              <SettingCard title={t("settings.apiKey")} description={t("settings.apiKeyDesc")}>
                <TextInput value={settings.apiKey} onChange={(v) => update("apiKey", v)} placeholder="sk-..." type="password" />
                <div className="flex gap-2 mt-2">
                  <button onClick={handleTestConnection}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5">
                    {testStatus === "testing" ? <RefreshCw size={12} className="animate-spin" /> : testStatus === "success" ? <CheckCircle2 size={12} className="text-green-500" /> : testStatus === "error" ? <AlertCircle size={12} className="text-red-500" /> : <Wifi size={12} />}
                    {t("settings.testConnection")}
                  </button>
                </div>
              </SettingCard>

              <SettingCard title={t("settings.baseUrl") || "Base URL"} description={t("settings.baseUrlDesc") || "API endpoint base URL (e.g. https://api.openai.com/v1)"}>
                <TextInput value={settings.url} onChange={(v) => update("url", v)} placeholder="https://api.openai.com/v1" />
              </SettingCard>

              <SettingCard title="Temperature" description={`${t("settings.temperatureDesc")}: ${settings.temperature}`}>
                <Slider value={settings.temperature} onChange={(v) => update("temperature", v)} min={0} max={2} step={0.1} />
              </SettingCard>

              <SettingCard title="Max Tokens" description={t("settings.maxTokensDesc")}>
                <Slider value={settings.maxTokens} onChange={(v) => update("maxTokens", v)} min={256} max={16384} step={256} />
              </SettingCard>
            </>
          )}

          {/* ─── Agent ───────────────────────────────────────── */}
          {active === "agent" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Bot size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">{t("settings.defaultAgent")}</h1><p className="text-xs text-muted-foreground">{t("settings.agentTimeoutDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.defaultAgent")} description={t("settings.defaultAgentDesc")}>
                <SelectInput value={settings.defaultAgent} onChange={(v) => update("defaultAgent", v)}
                  options={[{ value: "auto", label: t("settings.autoSelect") }, { value: "hermes", label: "Hermes" }, { value: "mimo", label: "MiMo" }]} />
              </SettingCard>

              <SettingCard title={t("settings.agentTimeout")} description={`${t("settings.agentTimeoutDesc")}: ${settings.agentTimeout}s`}>
                <Slider value={settings.agentTimeout} onChange={(v) => update("agentTimeout", v)} min={5} max={300} step={5} unit="s" />
              </SettingCard>

              <SettingCard title={t("settings.retryStrategy")} description={t("settings.retryStrategyDesc")}>
                <ButtonGroup value={settings.retryStrategy} onChange={(v) => update("retryStrategy", v)}
                  options={[{ value: "none", label: t("settings.noRetry") }, { value: "linear", label: t("settings.linear") }, { value: "exponential", label: t("settings.exponential") }]} />
              </SettingCard>

              <SettingCard title={t("settings.logLevel")} description={t("settings.logLevelDesc")}>
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
                <div><h1 className="text-lg font-semibold">{t("settings.toolPermissions")}</h1><p className="text-xs text-muted-foreground">{t("settings.toolPermissionsDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.shellWhitelist")} description={t("settings.shellWhitelistDesc")}>
                <TextInput value={settings.shellWhitelist} onChange={(v) => update("shellWhitelist", v)} placeholder={t("settings.shellWhitelistPlaceholder")} />
              </SettingCard>

              <SettingCard title={t("settings.fileAccess")} description={t("settings.fileAccessDesc")}>
                <ButtonGroup value={settings.fileAccess} onChange={(v) => update("fileAccess", v)}
                  options={[{ value: "full", label: t("settings.fullAccess") }, { value: "restricted", label: t("settings.restricted") }, { value: "readonly", label: t("settings.readonly") }]} />
              </SettingCard>

              <SettingCard title={t("settings.networkAccess")} description={t("settings.networkAccessDesc")}>
                <Toggle checked={settings.networkAccess} onChange={(v) => update("networkAccess", v)} />
              </SettingCard>
            </>
          )}

          {/* ─── Storage ─────────────────────────────────────── */}
          {active === "storage" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><HardDrive size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">{t("settings.storageManagement")}</h1><p className="text-xs text-muted-foreground">{t("settings.storageDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.knowledgePath")} description={t("settings.knowledgePathDesc")}>
                <TextInput value={settings.knowledgePath} onChange={(v) => update("knowledgePath", v)} placeholder={t("settings.knowledgePathPlaceholder")} />
              </SettingCard>

              <SettingCard title={t("settings.cacheLimit")} description={`${t("settings.cacheLimitDesc")}: ${settings.cacheLimit}MB`}>
                <Slider value={settings.cacheLimit} onChange={(v) => update("cacheLimit", v)} min={64} max={4096} step={64} unit="MB" />
              </SettingCard>

              <SettingCard title={t("settings.dataManagement")} description={t("settings.dataManagementDesc")}>
                <div className="flex gap-2">
                  <button onClick={handleExportData} className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5"><Download size={12} />{t("settings.exportData")}</button>
                  <button onClick={handleImportData} className="px-3 py-2 rounded-lg border border-border text-xs hover:bg-muted flex items-center gap-1.5"><Upload size={12} />{t("settings.importData")}</button>
                  <input ref={fileInputRef} type="file" accept=".json" onChange={handleImportFile} className="hidden" />
                  <button onClick={handleClearCache} className="px-3 py-2 rounded-lg border border-red-500/30 text-xs text-red-500 hover:bg-red-500/5 flex items-center gap-1.5"><Trash2 size={12} />{t("settings.clearCache")}</button>
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
                <div><h1 className="text-lg font-semibold">{t("settings.account")}</h1><p className="text-xs text-muted-foreground">{t("settings.accountDesc")}</p></div>
              </div>

              <SettingCard title={t("settings.userInfo")}>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-xs lg:text-sm font-medium text-primary-foreground">
                    {(getUserName() || getUserId() || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="text-xs lg:text-sm font-medium">{getUserName() || getUserId() || "User"}</div>
                    <div className="text-xs text-muted-foreground">{t("settings.signedIn")}</div>
                  </div>
                </div>
              </SettingCard>

              <SettingCard title={t("settings.apiAddress")} description={t("settings.apiAddressDesc")}>
                <div className="text-xs lg:text-sm font-mono text-muted-foreground p-2 rounded bg-muted/50">{getApiBaseUrl()}</div>
              </SettingCard>

              <SettingCard title={t("settings.logout")} description={t("settings.logoutDesc")}>
                <button onClick={handleLogout} className="px-4 py-2 rounded-lg border border-red-500/30 text-xs lg:text-sm text-red-500 hover:bg-red-500/5 flex items-center gap-2">
                  <LogOut size={14} />{t("settings.logout")}
                </button>
              </SettingCard>
            </>
          )}

          {/* ─── About ───────────────────────────────────────── */}
          {active === "about" && (
            <>
              <div className="flex items-center gap-2.5 mb-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10"><Info size={16} className="text-primary" /></div>
                <div><h1 className="text-lg font-semibold">{t("settings.about")}</h1><p className="text-xs text-muted-foreground">{t("settings.aboutDesc")}</p></div>
              </div>

              <SettingCard title="OpenMate">
                <div className="space-y-2 text-xs lg:text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("settings.frontendVersion")}</span><span className="font-mono">v0.1.0</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("settings.backendVersion")}</span><span className="font-mono">{backendVersion || t("settings.detecting")}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("settings.framework")}</span><span>Next.js + Tauri</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("settings.backend")}</span><span>OpenSoul (FastAPI)</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">{t("settings.license")}</span><span>MIT</span></div>
                </div>
              </SettingCard>

              <SettingCard title={t("settings.ecosystem")}>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  {["OpenSoul", "OpenMate", "OpenSoma", "OpenCortex", "OpenNerve", "OpenVein", "OpenSense", "OpenWill", "OpenVital", "OpenGland", "OpenImmune", "OpenMarrow", "OpenGene", "OpenEcho", "OpenMirror", "OpenLink", "OpenHippo", "OpenReflex", "OpenHeredity", "OpenNest", "OpenPulse", "OpenLimb", "OpenVoice", "OpenVision", "OpenMind"].map(name => (
                    <div key={name} className="flex items-center gap-1.5 p-1.5 rounded bg-muted/50">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span>{name}</span>
                    </div>
                  ))}
                </div>
              </SettingCard>

              <SettingCard title={t("settings.links")}>
                <div className="space-y-2">
                  <a href="https://github.com/open-soulmate" target="_blank" className="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink size={14} />GitHub
                  </a>
                  <a href="#" className="flex items-center gap-2 text-xs lg:text-sm text-muted-foreground hover:text-foreground">
                    <ExternalLink size={14} />Documentation
                  </a>
                </div>
              </SettingCard>
            </>
          )}

          {/* Save button */}
          <div className="sticky bottom-0 pt-4 pb-6 bg-background/80 backdrop-blur-sm">
            <button onClick={handleSave} className={cn("w-full px-4 py-2.5 rounded-xl text-xs lg:text-sm font-medium flex items-center justify-center gap-2 transition-all",
              saved ? "bg-green-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90")}>
              {saved ? <><Check size={16} />{t("settings.saved")}</> : <><Save size={16} />{t("settings.saveSettings")}</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Organs Management Section ─────────────────────────────────────
function OrgansSection({ apiBase }: { apiBase: string }) {
  const { t } = useTranslation();
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
    cortex: { label: t("nav.cortex"), emoji: "🧠" }, nerve: { label: t("nav.nerve"), emoji: "⚡" },
    vein: { label: t("nav.vein"), emoji: "🩸" }, sense: { label: t("nav.sense"), emoji: "👁" },
    will: { label: t("nav.will"), emoji: "✨" }, immune: { label: t("nav.immune"), emoji: "🛡" },
    vital: { label: t("nav.vital"), emoji: "📊" }, marrow: { label: t("nav.marrow"), emoji: "🦴" },
    gland: { label: t("nav.gland"), emoji: "🧪" }, gene: { label: t("nav.gene"), emoji: "🧬" },
    echo: { label: t("nav.echo"), emoji: "🔊" }, mirror: { label: t("nav.mirror"), emoji: "🪞" },
    link: { label: t("nav.link"), emoji: "🔗" }, hippo: { label: t("nav.hippo"), emoji: "🧠" },
    reflex: { label: t("nav.reflex"), emoji: "⚡" }, heredity: { label: t("nav.heredity"), emoji: "🔗" },
    pulse: { label: t("nav.pulse"), emoji: "💓" }, nest: { label: t("nav.nest"), emoji: "🏠" },
    limb: { label: t("nav.limb"), emoji: "💪" }, voice: { label: t("nav.voice"), emoji: "🎤" },
    vision: { label: t("nav.vision"), emoji: "🎨" }, mind: { label: t("nav.mind"), emoji: "💭" },
    trajectory: { label: t("nav.trajectory"), emoji: "📊" }, mcp: { label: "MCP", emoji: "🔌" },
    learn: { label: t("nav.learn"), emoji: "📚" },
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
        <div><h1 className="text-lg font-semibold">{t("settings.organManagement")}</h1><p className="text-xs text-muted-foreground">{t("settings.organManagementDesc")} ({enabledCount}/{organs.length} {t("settings.enabledCount")})</p></div>
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
                    <div className="text-xs lg:text-sm font-medium">{info.label}</div>
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

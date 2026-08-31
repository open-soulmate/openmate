"use client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl, getToken, getUserId, getUserName } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import {
  Moon, Sun, Monitor, Cpu, Palette, Info, Check, Key,
  Eye, EyeOff, LogOut, Loader2, ExternalLink, User,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type SectionId = "profile" | "model" | "appearance" | "about";

interface Section {
  id: SectionId;
  label: string;
  icon: React.ElementType;
}

// ─── Toggle Switch ───────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors",
        checked ? "bg-zinc-400" : "bg-zinc-800"
      )}
    >
      <div
        className={cn(
          "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
          checked ? "translate-x-5" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

// ─── Profile Section ─────────────────────────────────────────────────────────

function ProfileSection() {
  const { t } = useTranslation();
  const [name, setName] = useState(getUserName() || "Admin");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const base = getApiBaseUrl();
      await fetch(`${base}/api/user/profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ name }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-2xl font-medium text-zinc-300">
          {name.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="text-sm text-zinc-400">头像根据用户名自动生成</p>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">显示名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-sm focus:outline-none focus:border-zinc-500"
        />
      </div>

      <div className="space-y-2">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">邮箱</label>
        <input
          value="admin@opensoul.local"
          disabled
          className="w-full h-9 px-3 bg-zinc-900/50 border border-zinc-800 rounded-md text-sm text-zinc-500"
        />
        <p className="text-xs text-zinc-600">邮箱由登录系统管理</p>
      </div>

      <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm flex items-center gap-2 disabled:opacity-50">
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
        {saved ? "已保存" : "保存资料"}
      </button>
    </div>
  );
}

// ─── Model Section ───────────────────────────────────────────────────────────

function ModelSection() {
  const { t } = useTranslation();
  const [llm, setLlm] = useState({
    provider: "xiaomi",
    model: "mimo-v2.5-pro",
    apiKey: "",
    baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
  });
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [temp, setTemp] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const base = getApiBaseUrl();
    fetch(`${base}/api/llm/config`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => {
        setLlm((prev) => ({
          ...prev,
          ...(d.base_url ? { baseUrl: d.base_url } : {}),
          ...(d.model ? { model: d.model } : {}),
          ...(d.api_key ? { apiKey: d.api_key } : {}),
        }));
        if (d.temperature !== undefined) setTemp(d.temperature);
        if (d.max_tokens !== undefined) setMaxTokens(d.max_tokens);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const base = getApiBaseUrl();
      const r = await fetch(`${base}/api/llm/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ api_key: llm.apiKey, base_url: llm.baseUrl, model: llm.model }),
      });
      const data = await r.json();
      setTestResult(r.ok && data.status === "ok" ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 5000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const base = getApiBaseUrl();
      await fetch(`${base}/api/llm/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          api_key: llm.apiKey,
          base_url: llm.baseUrl,
          model: llm.model,
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {}
    setSaving(false);
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-zinc-500"><Loader2 className="w-4 h-4 animate-spin" /> 加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Provider card */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center text-white font-bold text-sm">
          Mi
        </div>
        <div>
          <p className="text-sm font-medium">{llm.provider === "xiaomi" ? "Xiaomi MiMo" : llm.provider}</p>
          <p className="text-xs text-zinc-500">{llm.model}</p>
        </div>
      </div>

      {/* API Key */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-zinc-400 text-xs uppercase tracking-wider flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" /> API Key
          </label>
          <button onClick={() => setShowKey(!showKey)} className="text-zinc-600 hover:text-zinc-400">
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <input
          type={showKey ? "text" : "password"}
          value={llm.apiKey}
          onChange={(e) => setLlm({ ...llm, apiKey: e.target.value })}
          placeholder="tp-..."
          className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Base URL */}
      <div className="space-y-2">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">Base URL</label>
        <input
          value={llm.baseUrl}
          onChange={(e) => setLlm({ ...llm, baseUrl: e.target.value })}
          className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Model */}
      <div className="space-y-2">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">模型</label>
        <input
          value={llm.model}
          onChange={(e) => setLlm({ ...llm, model: e.target.value })}
          className="w-full h-9 px-3 bg-zinc-900 border border-zinc-700 rounded-md text-sm font-mono focus:outline-none focus:border-zinc-500"
        />
      </div>

      {/* Temperature */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-zinc-400 text-xs uppercase tracking-wider">Temperature</label>
          <span className="text-sm font-mono text-zinc-500">{temp.toFixed(1)}</span>
        </div>
        <input
          type="range" min={0} max={2} step={0.1}
          value={temp}
          onChange={(e) => setTemp(parseFloat(e.target.value))}
          className="w-full accent-zinc-400"
        />
      </div>

      {/* Max Tokens */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-zinc-400 text-xs uppercase tracking-wider">Max Tokens</label>
          <span className="text-sm font-mono text-zinc-500">{maxTokens}</span>
        </div>
        <input
          type="range" min={256} max={32768} step={256}
          value={maxTokens}
          onChange={(e) => setMaxTokens(parseInt(e.target.value))}
          className="w-full accent-zinc-400"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          onClick={handleTest}
          disabled={testing}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          {testResult === "ok" ? "✓ 连接成功" : testResult === "fail" ? "✗ 连接失败" : "测试连接"}
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-white text-black hover:bg-zinc-200 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
          {saved ? "已保存" : "保存配置"}
        </button>
      </div>
    </div>
  );
}

// ─── Appearance Section ──────────────────────────────────────────────────────

function AppearanceSection() {
  const [theme, setTheme] = useState("dark");
  const [fontSize, setFontSize] = useState(14);
  const [language, setLanguage] = useState("zh");
  const [animations, setAnimations] = useState(true);

  const themes = [
    { id: "dark", label: "深色", icon: Moon, color: "bg-zinc-900" },
    { id: "light", label: "浅色", icon: Sun, color: "bg-white" },
    { id: "system", label: "跟随系统", icon: Monitor, color: "bg-gradient-to-r from-zinc-900 to-white" },
  ];

  return (
    <div className="space-y-8">
      {/* Theme */}
      <div className="space-y-3">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">主题</label>
        <div className="grid grid-cols-3 gap-3">
          {themes.map((th) => {
            const Icon = th.icon;
            return (
              <button
                key={th.id}
                onClick={() => setTheme(th.id)}
                className={cn(
                  "flex flex-col items-center gap-2 p-3 rounded-lg border transition-all",
                  theme === th.id
                    ? "border-zinc-500 bg-zinc-800"
                    : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
                )}
              >
                <div className={cn("w-full h-8 rounded", th.color, "border border-zinc-700")} />
                <span className="text-xs text-zinc-400">{th.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Font Size */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-zinc-400 text-xs uppercase tracking-wider">字体大小</label>
          <span className="text-sm font-mono text-zinc-500">{fontSize}px</span>
        </div>
        <input
          type="range" min={10} max={20} step={1}
          value={fontSize}
          onChange={(e) => setFontSize(parseInt(e.target.value))}
          className="w-full accent-zinc-400"
        />
      </div>

      {/* Language */}
      <div className="space-y-3">
        <label className="text-zinc-400 text-xs uppercase tracking-wider">语言</label>
        <div className="grid grid-cols-2 gap-3">
          {[{ id: "zh", label: "中文" }, { id: "en", label: "English" }].map((lang) => (
            <button
              key={lang.id}
              onClick={() => setLanguage(lang.id)}
              className={cn(
                "p-3 rounded-lg border transition-all",
                language === lang.id
                  ? "border-zinc-500 bg-zinc-800"
                  : "border-zinc-800 bg-zinc-900 hover:border-zinc-700"
              )}
            >
              <span className="text-sm">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Animations */}
      <div className="flex items-center justify-between">
        <div>
          <label className="text-zinc-400 text-xs uppercase tracking-wider">动画效果</label>
          <p className="text-xs text-zinc-600 mt-1">界面过渡动画和微交互</p>
        </div>
        <Toggle checked={animations} onChange={setAnimations} />
      </div>
    </div>
  );
}

// ─── About Section ───────────────────────────────────────────────────────────

function AboutSection() {
  const [backendVersion, setBackendVersion] = useState("");

  useEffect(() => {
    const base = getApiBaseUrl();
    fetch(`${base}/api/system/info`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((r) => r.json())
      .then((d) => setBackendVersion(d.version || "1.0.0"))
      .catch(() => setBackendVersion("1.0.0"));
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800">
        <span className="text-sm text-zinc-400">版本</span>
        <span className="font-mono text-sm text-zinc-300">OpenSoul v{backendVersion || "1.0.0"}</span>
      </div>

      <a
        href="https://github.com/nousresearch/hermes-agent"
        target="_blank"
        className="flex items-center justify-between p-3 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors"
      >
        <span className="text-sm text-zinc-400">GitHub</span>
        <ExternalLink className="w-4 h-4 text-zinc-600" />
      </a>

      <button className="w-full p-3 rounded-lg border border-red-900/50 text-red-400 hover:bg-red-950/50 hover:text-red-300 transition-colors flex items-center justify-center gap-2 text-sm">
        <LogOut className="w-4 h-4" />
        退出登录
      </button>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function SettingsClient() {
  const { t } = useTranslation();
  const [active, setActive] = useState<SectionId>("model");

  const sections: Section[] = [
    { id: "profile", label: "个人资料", icon: User },
    { id: "model", label: "AI 模型", icon: Cpu },
    { id: "appearance", label: "外观", icon: Palette },
    { id: "about", label: "关于", icon: Info },
  ];

  return (
    <div className="flex h-full">
      {/* Left sidebar */}
      <div className="w-48 border-r border-zinc-800 p-4 space-y-1 shrink-0">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                active === s.id
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900"
              )}
            >
              <Icon className="w-4 h-4" />
              {s.label}
            </button>
          );
        })}
      </div>

      {/* Right content */}
      <div className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-lg">
          <h2 className="text-lg font-medium mb-6">
            {sections.find((s) => s.id === active)?.label}
          </h2>
          {active === "profile" && <ProfileSection />}
          {active === "model" && <ModelSection />}
          {active === "appearance" && <AppearanceSection />}
          {active === "about" && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

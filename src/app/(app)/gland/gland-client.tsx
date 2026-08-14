"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Zap, RefreshCw, Plus, Trash2, TestTube, Key, Activity,
  Server, CheckCircle, XCircle, AlertTriangle, ChevronDown,
  Settings, BarChart3, Loader2,
} from "lucide-react";

interface Provider {
  name: string;
  base_url: string;
  models: Record<string, string>;
  enabled: boolean;
  priority: number;
  consecutive_failures: number;
}

interface HealthData {
  status: string;
  component: string;
  providers: { total: number; enabled: number; unhealthy: number };
  keys: { total: number };
  token_meter: any;
}

interface UsageSummary {
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_cost: number;
  by_provider: Record<string, any>;
  by_model: Record<string, any>;
}

export function GlandClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"providers" | "keys" | "usage" | "test">("providers");
  const [health, setHealth] = useState<HealthData | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [recentUsage, setRecentUsage] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testProvider, setTestProvider] = useState("");
  const apiBase = getApiBaseUrl();

  // Add provider form
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newChatModel, setNewChatModel] = useState("");
  const [newEmbedModel, setNewEmbedModel] = useState("");
  const [newApiKey, setNewApiKey] = useState("");
  const [newPriority, setNewPriority] = useState("0");

  // Add key form
  const [keyProvider, setKeyProvider] = useState("");
  const [keyValue, setKeyValue] = useState("");

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gland/health`);
      if (res.ok) setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchProviders = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gland/providers`);
      const data = await res.json();
      setProviders(data.providers || []);
    } catch {}
  }, [apiBase]);

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/gland/keys`);
      const data = await res.json();
      setKeys(data.keys || data.slots || []);
    } catch {}
  }, [apiBase]);

  const fetchUsage = useCallback(async () => {
    try {
      const [summary, recent] = await Promise.all([
        fetch(`${apiBase}/api/gland/usage`).then(r => r.json()),
        fetch(`${apiBase}/api/gland/usage/recent?limit=50`).then(r => r.json()),
      ]);
      setUsage(summary);
      setRecentUsage(recent.records || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    fetchProviders();
    if (tab === "keys") fetchKeys();
    if (tab === "usage") fetchUsage();
  }, [tab, fetchHealth, fetchProviders, fetchKeys, fetchUsage]);

  const handleAddProvider = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    setLoading(true);
    try {
      const models: Record<string, string> = {};
      if (newChatModel) models.chat = newChatModel;
      if (newEmbedModel) models.embedding = newEmbedModel;
      await fetch(`${apiBase}/api/gland/providers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName, base_url: newUrl, models,
          api_key: newApiKey || undefined, priority: parseInt(newPriority) || 0,
        }),
      });
      setNewName(""); setNewUrl(""); setNewChatModel(""); setNewEmbedModel(""); setNewApiKey(""); setNewPriority("0");
      fetchProviders(); fetchHealth();
    } catch {} finally { setLoading(false); }
  };

  const handleRemoveProvider = async (name: string) => {
    if (!confirm(`确定删除 provider '${name}'？`)) return;
    try {
      await fetch(`${apiBase}/api/gland/providers/${name}`, { method: "DELETE" });
      fetchProviders(); fetchHealth();
    } catch {}
  };

  const handleTestProvider = async () => {
    setLoading(true); setTestResult(null);
    try {
      const body = testProvider ? { provider: testProvider } : undefined;
      const res = await fetch(`${apiBase}/api/gland/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      setTestResult(await res.json());
    } catch (e: any) {
      setTestResult({ status: "error", detail: e.message });
    } finally { setLoading(false); }
  };

  const handleAddKey = async () => {
    if (!keyProvider.trim() || !keyValue.trim()) return;
    try {
      await fetch(`${apiBase}/api/gland/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: keyProvider, api_key: keyValue }),
      });
      setKeyProvider(""); setKeyValue("");
      fetchKeys(); fetchHealth();
    } catch {}
  };

  const tabs = [
    { id: "providers" as const, label: t("gland.providers") || "模型提供商", icon: Server },
    { id: "keys" as const, label: t("gland.keys") || "API密钥", icon: Key },
    { id: "usage" as const, label: t("gland.usage") || "用量统计", icon: BarChart3 },
    { id: "test" as const, label: t("gland.test") || "连接测试", icon: TestTube },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Zap size={20} className="text-amber-500" />
          <h1 className="text-lg font-semibold">{t("gland.title") || "腺体 · 模型网关"}</h1>
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
            {t("gland.subtitle") || "多LLM调度 · 密钥管理 · Token计量"}
          </span>
        </div>
        <button onClick={() => { fetchHealth(); fetchProviders(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Health Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("gland.totalProviders") || "提供商总数"}</span>
              <p className="text-2xl font-bold">{health.providers.total}</p>
              <span className="text-xs text-emerald-500">{health.providers.enabled} {t("gland.enabled") || "已启用"}</span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("gland.unhealthy") || "异常"}</span>
              <p className="text-2xl font-bold text-red-500">{health.providers.unhealthy}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("gland.totalKeys") || "API密钥"}</span>
              <p className="text-2xl font-bold">{health.keys.total}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("gland.totalTokens") || "总Token"}</span>
              <p className="text-2xl font-bold">
                {((health.token_meter?.total_prompt_tokens || 0) + (health.token_meter?.total_completion_tokens || 0)).toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
                tab === tabItem.id ? "bg-amber-500/10 text-amber-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Providers Tab */}
        {tab === "providers" && (
          <div className="space-y-4">
            {/* Add Provider Form */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("gland.addProvider") || "添加提供商"}</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <input value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="名称 (e.g. openai)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
                  placeholder="Base URL" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input value={newChatModel} onChange={e => setNewChatModel(e.target.value)}
                  placeholder="Chat模型 (e.g. gpt-4o)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input value={newEmbedModel} onChange={e => setNewEmbedModel(e.target.value)}
                  placeholder="Embedding模型" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input value={newApiKey} onChange={e => setNewApiKey(e.target.value)} type="password"
                  placeholder="API Key (可选)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <input value={newPriority} onChange={e => setNewPriority(e.target.value)} type="number"
                  placeholder="优先级 (0=最高)" className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <button onClick={handleAddProvider} disabled={loading}
                  className="flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50">
                  <Plus size={14} /> {t("gland.add") || "添加"}
                </button>
              </div>
            </div>

            {/* Provider List */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.name") || "名称"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">Base URL</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.models") || "模型"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.priority") || "优先级"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.status") || "状态"}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">{t("common.actions") || "操作"}</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      {t("gland.noProviders") || "暂无提供商，点击上方添加"}
                    </td></tr>
                  ) : providers.map((p) => (
                    <tr key={p.name} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{p.name}</td>
                      <td className="px-4 py-2.5 text-xs font-mono text-muted-foreground truncate max-w-[200px]">{p.base_url}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(p.models).map(([task, model]) => (
                            <span key={task} className="inline-block rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-600">
                              {task}: {model}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-center">{p.priority}</td>
                      <td className="px-4 py-2.5">
                        {p.enabled && p.consecutive_failures === 0 ? (
                          <span className="flex items-center gap-1 text-emerald-500 text-xs"><CheckCircle size={12} /> 健康</span>
                        ) : p.consecutive_failures > 0 ? (
                          <span className="flex items-center gap-1 text-amber-500 text-xs"><AlertTriangle size={12} /> {p.consecutive_failures}次失败</span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-500 text-xs"><XCircle size={12} /> 已禁用</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => handleRemoveProvider(p.name)}
                          className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Keys Tab */}
        {tab === "keys" && (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("gland.addKey") || "添加API密钥"}</h3>
              <div className="flex gap-3">
                <select value={keyProvider} onChange={e => setKeyProvider(e.target.value)}
                  className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">{t("gland.selectProvider") || "选择提供商"}</option>
                  {providers.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                </select>
                <input value={keyValue} onChange={e => setKeyValue(e.target.value)} type="password"
                  placeholder="API Key" className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
                <button onClick={handleAddKey}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600">
                  <Key size={14} /> {t("gland.add") || "添加"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.provider") || "提供商"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.key") || "密钥"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.status") || "状态"}</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      {t("gland.noKeys") || "暂无API密钥"}
                    </td></tr>
                  ) : keys.map((k: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 font-medium">{k.provider}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{k.masked || k.key?.slice(0, 8) + "..."}</td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1 text-emerald-500 text-xs"><CheckCircle size={12} /> 活跃</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {tab === "usage" && (
          <div className="space-y-4">
            {usage && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="rounded-xl border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">{t("gland.promptTokens") || "Prompt Tokens"}</span>
                  <p className="text-2xl font-bold">{(usage.total_prompt_tokens || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">{t("gland.completionTokens") || "Completion Tokens"}</span>
                  <p className="text-2xl font-bold">{(usage.total_completion_tokens || 0).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">{t("gland.totalCost") || "总费用"}</span>
                  <p className="text-2xl font-bold">${(usage.total_cost || 0).toFixed(4)}</p>
                </div>
                <div className="rounded-xl border border-border bg-card p-4">
                  <span className="text-xs text-muted-foreground">{t("gland.requests") || "请求数"}</span>
                  <p className="text-2xl font-bold">{recentUsage.length}</p>
                </div>
              </div>
            )}

            {/* By Provider */}
            {usage?.by_provider && Object.keys(usage.by_provider).length > 0 && (
              <div className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium mb-3">{t("gland.byProvider") || "按提供商"}</h3>
                <div className="space-y-2">
                  {Object.entries(usage.by_provider).map(([name, stats]: [string, any]) => (
                    <div key={name} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                      <span className="text-sm font-medium">{name}</span>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>{(stats.prompt_tokens || 0).toLocaleString()} prompt</span>
                        <span>{(stats.completion_tokens || 0).toLocaleString()} completion</span>
                        <span className="font-medium text-foreground">${(stats.cost || 0).toFixed(4)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Usage */}
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.time") || "时间"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.provider") || "提供商"}</th>
                    <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("gland.model") || "模型"}</th>
                    <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">{t("gland.tokens") || "Tokens"}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentUsage.length === 0 ? (
                    <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      {t("gland.noUsage") || "暂无使用记录"}
                    </td></tr>
                  ) : recentUsage.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.ts ? new Date(r.ts * 1000).toLocaleString("zh-CN") : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-xs">{r.provider}</td>
                      <td className="px-4 py-2.5 text-xs font-mono">{r.model}</td>
                      <td className="px-4 py-2.5 text-xs text-right">
                        <span className="text-amber-600">{(r.prompt_tokens || 0).toLocaleString()}</span>
                        <span className="text-muted-foreground mx-1">+</span>
                        <span className="text-emerald-600">{(r.completion_tokens || 0).toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Test Tab */}
        {tab === "test" && (
          <div className="space-y-4 max-w-xl">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h3 className="text-sm font-medium">{t("gland.testConnection") || "测试连接"}</h3>
              <div className="flex gap-3">
                <select value={testProvider} onChange={e => setTestProvider(e.target.value)}
                  className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="">{t("gland.autoSelect") || "自动选择最高优先级"}</option>
                  {providers.map(p => <option key={p.name} value={p.name}>{p.name} ({p.base_url})</option>)}
                </select>
                <button onClick={handleTestProvider} disabled={loading}
                  className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm text-white hover:bg-amber-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                  {t("gland.test") || "测试"}
                </button>
              </div>
            </div>

            {testResult && (
              <div className={cn("rounded-xl border p-5 space-y-3",
                testResult.status === "ok" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
                <div className="flex items-center gap-2">
                  {testResult.status === "ok" ? (
                    <CheckCircle size={18} className="text-emerald-500" />
                  ) : (
                    <XCircle size={18} className="text-red-500" />
                  )}
                  <span className="text-sm font-medium">
                    {testResult.status === "ok" ? "连接成功" : "连接失败"}
                  </span>
                </div>
                <div className="text-sm space-y-1">
                  {testResult.provider && <div><span className="text-muted-foreground">Provider:</span> {testResult.provider}</div>}
                  {testResult.model && <div><span className="text-muted-foreground">Model:</span> {testResult.model}</div>}
                  {testResult.reply && <div><span className="text-muted-foreground">Reply:</span> <span className="font-mono">{testResult.reply}</span></div>}
                  {testResult.detail && <div className="text-red-500">{testResult.detail}</div>}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

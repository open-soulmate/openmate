"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Volume2, RefreshCw, Send, Radio, Settings,
  CheckCircle, XCircle, Clock, MessageSquare,
} from "lucide-react";

export function EchoClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"send" | "channels" | "history">("send");
  const [health, setHealth] = useState<any>(null);
  const [channels, setChannels] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [sendTitle, setSendTitle] = useState("");
  const [sendContent, setSendContent] = useState("");
  const [sendChannel, setSendChannel] = useState("webhook");
  const [sendTarget, setSendTarget] = useState("");
  const [sendResult, setSendResult] = useState<any>(null);
  const [chEndpoint, setChEndpoint] = useState("");
  const [chToken, setChToken] = useState("");
  const [chExtra, setChExtra] = useState("");
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/echo/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/echo/channels`);
      const data = await res.json();
      setChannels(data.channels || []);
    } catch {}
  }, [apiBase]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/echo/history?limit=50`);
      const data = await res.json();
      setHistory(data.messages || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    if (tab === "channels") fetchChannels();
    if (tab === "history") fetchHistory();
  }, [tab, fetchHealth, fetchChannels, fetchHistory]);

  const handleSend = async () => {
    if (!sendTitle.trim() || !sendContent.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/echo/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: sendChannel,
          title: sendTitle,
          content: sendContent,
          target: sendTarget,
        }),
      });
      setSendResult(await res.json());
      fetchHealth();
    } catch {}
  };

  const handleBroadcast = async () => {
    if (!sendTitle.trim() || !sendContent.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/echo/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sendTitle, content: sendContent }),
      });
      setSendResult(await res.json());
      fetchHealth();
    } catch {}
  };

  const handleConfigure = async (channel: string) => {
    try {
      let extra = {};
      if (chExtra.trim()) {
        try { extra = JSON.parse(chExtra); } catch { /* ignore */ }
      }
      await fetch(`${apiBase}/api/echo/channels/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel, endpoint: chEndpoint, token: chToken, enabled: true, extra }),
      });
      setChEndpoint(""); setChToken(""); setChExtra("");
      fetchChannels();
    } catch {}
  };

  const tabs = [
    { id: "send" as const, label: t("echo.b5f159"), icon: Send },
    { id: "channels" as const, label: t("echo.60a8c8"), icon: Radio },
    { id: "history" as const, label: t("echo.498815"), icon: Clock },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="text-pink-500" />
          <h1 className="text-lg font-semibold">{t("echo.title")}</h1>
          <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-xs font-medium text-pink-500">
            {t("echo.81bbd9")}
          <span>
        </div>
        <button onClick={() => { fetchHealth(); tab === "channels" && fetchChannels(); tab === "history" && fetchHistory(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
          <RefreshCw size={14} /> {t("common.refresh")}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("echo.05faf1")}<span>
              <p className="text-2xl font-bold">{health.total_messages || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("echo.330363")}<span>
              <p className="text-2xl font-bold text-emerald-500">{health.sent || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("echo.acd5cb")}<span>
              <p className="text-2xl font-bold text-red-500">{health.failed || 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4">
              <span className="text-xs text-muted-foreground">{t("echo.e4f52e")}<span>
              <p className="text-2xl font-bold">{health.channels_enabled || 0}/{health.channels_configured || 0}</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm",
                tab === tabItem.id ? "bg-pink-500/10 text-pink-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Send Tab */}
        {tab === "send" && (
          <div className="space-y-4 max-w-xl">
            <div className="flex gap-3">
              <select value={sendChannel} onChange={(e) => setSendChannel(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="webhook">Webhook</option>
                <option value="dingtalk">{t("echo.4a0e91")}<option>
                <option value="wechat_work">{t("echo.ff17b9")}<option>
                <option value="feishu">{t("echo.7714e5")}<option>
                <option value="telegram">Telegram</option>
                <option value="email">{t("echo.e9e805")}<option>
                <option value="console">{t("echo.b5c377")}<option>
              </select>
              <input value={sendTarget} onChange={(e) => setSendTarget(e.target.value)}
                placeholder={t("echo.666147")} className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <input value={sendTitle} onChange={(e) => setSendTitle(e.target.value)}
              placeholder={t("echo.a53db5")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <textarea value={sendContent} onChange={(e) => setSendContent(e.target.value)}
              placeholder={t("echo.b87b77")} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm min-h-[100px] resize-none" />
            <div className="flex gap-2">
              <button onClick={handleSend}
                className="flex items-center gap-2 rounded-lg bg-pink-500 px-4 py-2 text-sm text-white hover:bg-pink-600">
                <Send size={14} /> {t("echo.1535fc")}
              <button>
              <button onClick={handleBroadcast}
                className="flex items-center gap-2 rounded-lg border border-pink-500/30 px-4 py-2 text-sm text-pink-600 hover:bg-pink-500/10">
                <Radio size={14} /> {t("echo.8e21d4")}
              <button>
            </div>
            {sendResult && (
              <div className={cn("rounded-lg border p-3 text-sm",
                sendResult.success !== false ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
                <pre className="text-xs">{JSON.stringify(sendResult, null, 2)}</pre>
              </div>
            )}
          </div>
        )}

        {/* Channels Tab */}
        {tab === "channels" && (
          <div className="space-y-4">
            <div className="flex gap-3 items-end">
              <div>
                <label className="text-xs text-muted-foreground">Endpoint</label>
                <input value={chEndpoint} onChange={(e) => setChEndpoint(e.target.value)}
                  placeholder="Webhook URL / SMTP host"
                  className="block rounded-lg border border-border bg-background px-3 py-2 text-sm w-80" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Token / Password</label>
                <input value={chToken} onChange={(e) => setChToken(e.target.value)}
                  placeholder="API Token / SMTP password" type="password"
                  className="block rounded-lg border border-border bg-background px-3 py-2 text-sm w-48" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Extra (JSON)</label>
                <input value={chExtra} onChange={(e) => setChExtra(e.target.value)}
                  placeholder='{"smtp_port":587,"username":"..."}'
                  className="block rounded-lg border border-border bg-background px-3 py-2 text-sm w-64" />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {channels.map((ch) => (
                <div key={ch.channel} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Radio size={16} className={ch.enabled ? "text-emerald-500" : "text-muted-foreground"} />
                      <span className="font-medium text-sm">{ch.channel}</span>
                    </div>
                    <span className={cn("text-xs", ch.enabled ? "text-emerald-500" : "text-muted-foreground")}>
                      {ch.enabled ? t("echo.53ace4") : t("echo.463776")}
                    </span>
                  </div>
                  {ch.has_endpoint && <p className="text-xs text-muted-foreground font-mono">{t("echo.fec943")}<p>}
                  {ch.has_token && <p className="text-xs text-muted-foreground">{t("echo.7bdb3d")}<p>}
                  <button onClick={() => {t("echo.5906c7")}
                  <button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* History Tab */}
        {tab === "history" && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("echo.19fcb9")}<th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("echo.e4f52e")}<th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("echo.32c65d")}<th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("echo.3fea7c")}<th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground text-xs">{t("echo.89fe87")}<td></tr>
                ) : history.map((m, i) => (
                  <tr key={m.msg_id || i} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(m.timestamp * 1000).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">{m.channel}</td>
                    <td className="px-4 py-2.5 text-xs">{m.title}</td>
                    <td className="px-4 py-2.5">
                      {m.status === "sent" ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-500" />}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

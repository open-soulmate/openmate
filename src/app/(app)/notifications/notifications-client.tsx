"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Bell, Check, CheckCheck, Trash2, X, Info, AlertTriangle,
  AlertCircle, CheckCircle, Loader2, Filter, RefreshCw,
  Search, ChevronDown, ExternalLink,
  Radio, Settings, Send, Webhook,
} from "lucide-react";

interface Notification {
  id: string;
  source: string;
  title: string;
  body: string;
  level: "info" | "warning" | "error" | "success";
  organ: string;
  emoji: string;
  action_url: string;
  metadata: Record<string, unknown>;
  timestamp: number;
  read: boolean;
}

function levelIcon(level: string) {
  switch (level) {
    case "error": return <AlertCircle size={16} className="text-red-500 shrink-0" />;
    case "warning": return <AlertTriangle size={16} className="text-amber-500 shrink-0" />;
    case "success": return <CheckCircle size={16} className="text-emerald-500 shrink-0" />;
    default: return <Info size={16} className="text-blue-500 shrink-0" />;
  }
}

function levelBadge(level: string) {
  switch (level) {
    case "error": return "bg-red-500/10 text-red-500 border-red-500/20";
    case "warning": return "bg-amber-500/10 text-amber-500 border-amber-500/20";
    case "success": return "bg-emerald-500/10 text-emerald-500 border-emerald-500/20";
    default: return "bg-blue-500/10 text-blue-500 border-blue-500/20";
  }
}

function formatTime(ts: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts * 1000;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t("notifications.justNow") || "刚刚";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("notifications.t38995", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.t82894", { hours });
  const days = Math.floor(hours / 24);
  return t("notifications.t87957", { days });
}

function formatFullTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

export function NotificationsClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [levelFilter, setLevelFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  // Echo forwarding state
  const [forwardRules, setForwardRules] = useState<Record<string, string[]>>({});
  const [forwardEnabled, setForwardEnabled] = useState(true);
  const [showForwardSettings, setShowForwardSettings] = useState(false);
  const [newRuleLevel, setNewRuleLevel] = useState("error");
  const [newRuleChannels, setNewRuleChannels] = useState("");
  const apiBase = getApiBaseUrl();

  const fetchNotifications = useCallback(async () => {
    if (!apiBase) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "200" });
      if (filter === "unread") params.set("unread_only", "true");
      if (levelFilter) params.set("level", levelFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      const res = await fetch(`${apiBase}/api/notifications/recent?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [apiBase, filter, levelFilter, sourceFilter]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const fetchForwardRules = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/notifications/forward/rules`);
      if (res.ok) {
        const data = await res.json();
        setForwardRules(data.rules || {});
        setForwardEnabled(data.enabled ?? true);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => { fetchForwardRules(); }, [fetchForwardRules]);

  const handleMarkRead = async (id: string) => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {}
  };

  const handleMarkAllRead = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/read-all`, { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {}
  };

  const handleDismiss = async (id: string) => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/${id}`, { method: "DELETE" });
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    } catch {}
  };

  const handleClearAll = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/`, { method: "DELETE" });
      setNotifications([]);
    } catch {}
  };

  const handlePushTest = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/test`, { method: "POST" });
      fetchNotifications();
    } catch {}
  };

  const handleAddForwardRule = async () => {
    if (!apiBase || !newRuleChannels) return;
    const channels = newRuleChannels.split(",").map((s) => s.trim()).filter(Boolean);
    if (channels.length === 0) return;
    try {
      const res = await fetch(`${apiBase}/api/notifications/forward/rules`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level: newRuleLevel, channels }),
      });
      if (res.ok) {
        fetchForwardRules();
        setNewRuleChannels("");
      }
    } catch {}
  };

  const handleDeleteForwardRule = async (level: string) => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/forward/rules/${level}`, { method: "DELETE" });
      fetchForwardRules();
    } catch {}
  };

  const handleToggleForward = async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/notifications/forward/enabled?enabled=${!forwardEnabled}`, { method: "PUT" });
      if (res.ok) {
        const data = await res.json();
        setForwardEnabled(data.enabled);
      }
    } catch {}
  };

  // Client-side search filter
  const filtered = notifications.filter((n) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      n.title.toLowerCase().includes(q) ||
      n.body.toLowerCase().includes(q) ||
      n.organ.toLowerCase().includes(q) ||
      n.source.toLowerCase().includes(q)
    );
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Get unique sources for filter dropdown
  const sources = [...new Set(notifications.map((n) => n.source))].filter(Boolean);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Bell size={20} className="text-foreground" />
          <h2 className="text-lg font-semibold text-foreground">
            {t("notifications.title") || "通知中心"}
          </h2>
          {unreadCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500/10 px-2 text-xs font-medium text-red-500">
              {unreadCount} {t("notifications.unread") || "未读"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePushTest}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border"
          >
            🧪 {t("notifications.test") || "测试通知"}
          </button>
          <button
            onClick={() => setShowForwardSettings(!showForwardSettings)}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors border",
              showForwardSettings
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
            title={t("notifications.echoForward") || "Echo 推送设置"}
          >
            <Radio size={14} />
            Echo
          </button>
          <button
            onClick={fetchNotifications}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={t("notifications.refresh") || "刷新"}
          >
            <RefreshCw size={14} />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <CheckCheck size={14} />
              {t("notifications.markAllRead") || "全部已读"}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
              {t("notifications.clearAll") || "清空"}
            </button>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-border bg-muted/30">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("notifications.searchPlaceholder") || "搜索通知..."}
            className="w-full h-8 pl-9 pr-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn(
            "flex h-8 items-center gap-1.5 rounded-md px-3 text-xs transition-colors border",
            showFilters
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <Filter size={14} />
          {t("notifications.filters") || "筛选"}
          <ChevronDown size={12} className={cn("transition-transform", showFilters && "rotate-180")} />
        </button>

        {/* Quick filters */}
        <div className="flex items-center gap-1">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex h-7 items-center rounded-md px-2.5 text-xs transition-colors",
                filter === f
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {f === "all" ? (t("notifications.all") || "全部") : (t("notifications.unread") || "未读")}
            </button>
          ))}
        </div>
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="flex items-center gap-4 px-6 py-2 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("notifications.level") || "级别"}:</span>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("notifications.all") || "全部"}</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="success">Success</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("notifications.source") || "来源"}:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("notifications.all") || "全部"}</option>
              {sources.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {(levelFilter || sourceFilter) && (
            <button
              onClick={() => { setLevelFilter(""); setSourceFilter(""); }}
              className="text-xs text-primary hover:underline"
            >
              {t("notifications.clearFilters") || "清除筛选"}
            </button>
          )}
        </div>
      )}

      {/* Echo Forwarding Settings */}
      {showForwardSettings && (
        <div className="px-6 py-4 border-b border-border bg-muted/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Radio size={14} className="text-primary" />
              <span className="text-sm font-medium">{t("notifications.echoForward") || "Echo 推送桥接"}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                {Object.keys(forwardRules).length} {t("notifications.rules") || "规则"}
              </span>
            </div>
            <button
              onClick={handleToggleForward}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs transition-colors border",
                forwardEnabled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
                  : "border-muted-foreground/30 bg-muted text-muted-foreground"
              )}
            >
              {forwardEnabled ? "✅ " + (t("notifications.forwardOn") || "已开启") : "⏸ " + (t("notifications.forwardOff") || "已关闭")}
            </button>
          </div>

          {/* Existing rules */}
          <div className="space-y-1.5">
            {Object.entries(forwardRules).map(([level, channels]) => (
              <div key={level} className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded font-medium",
                  level === "error" ? "bg-red-500/10 text-red-500" :
                  level === "warning" ? "bg-amber-500/10 text-amber-500" :
                  level === "success" ? "bg-emerald-500/10 text-emerald-500" :
                  "bg-blue-500/10 text-blue-500"
                )}>
                  {level.toUpperCase()}
                </span>
                <span className="text-xs text-muted-foreground">→</span>
                <div className="flex flex-wrap gap-1 flex-1">
                  {channels.map((ch) => (
                    <span key={ch} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                      {ch}
                    </span>
                  ))}
                </div>
                <button
                  onClick={() => handleDeleteForwardRule(level)}
                  className="text-muted-foreground hover:text-red-500 transition-colors"
                  title={t("notifications.deleteRule") || "删除规则"}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
            {Object.keys(forwardRules).length === 0 && (
              <p className="text-xs text-muted-foreground py-2">
                {t("notifications.noRules") || "暂无转发规则。添加规则以将通知自动推送到外部渠道。"}
              </p>
            )}
          </div>

          {/* Add new rule */}
          <div className="flex items-center gap-2 pt-1">
            <select
              value={newRuleLevel}
              onChange={(e) => setNewRuleLevel(e.target.value)}
              className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
              <option value="success">Success</option>
            </select>
            <span className="text-xs text-muted-foreground">→</span>
            <input
              type="text"
              value={newRuleChannels}
              onChange={(e) => setNewRuleChannels(e.target.value)}
              placeholder={t("notifications.channelsPlaceholder") || "console, dingtalk, telegram..."}
              className="flex-1 h-8 rounded-md border border-border bg-background px-3 text-xs text-foreground placeholder:text-muted-foreground"
            />
            <button
              onClick={handleAddForwardRule}
              disabled={!newRuleChannels.trim()}
              className="flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send size={12} />
              {t("notifications.addRule") || "添加"}
            </button>
          </div>
        </div>
      )}

      {/* Notification List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Bell size={48} className="mb-4 opacity-20" />
            <p className="text-sm font-medium">
              {searchQuery
                ? (t("notifications.noResults") || "没有匹配的通知")
                : (t("notifications.empty") || "暂无通知")}
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? (t("notifications.tryDifferentSearch") || "尝试不同的搜索词")
                : (t("notifications.emptyDesc") || "系统事件和器官活动将在此显示")}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((notif) => (
              <div
                key={notif.id}
                className={cn(
                  "group flex items-start gap-4 px-6 py-4 transition-colors cursor-pointer",
                  notif.read ? "hover:bg-accent/30" : "bg-accent/20 hover:bg-accent/40"
                )}
                onClick={() => {
                  if (!notif.read) handleMarkRead(notif.id);
                  if (notif.action_url) router.push(notif.action_url);
                }}
              >
                {/* Level Icon */}
                <div className="mt-0.5 shrink-0">
                  {levelIcon(notif.level)}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "text-sm truncate",
                          notif.read ? "text-muted-foreground" : "text-foreground font-medium"
                        )}>
                          {notif.emoji} {notif.title}
                        </p>
                        {!notif.read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {notif.body}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!notif.read && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMarkRead(notif.id); }}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={t("notifications.markRead") || "标记已读"}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {notif.action_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(notif.action_url); }}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={t("notifications.navigate") || "前往"}
                        >
                          <ExternalLink size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDismiss(notif.id); }}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
                        title={t("notifications.dismiss") || "移除"}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground" title={formatFullTime(notif.timestamp)}>
                      {formatTime(notif.timestamp, t)}
                    </span>
                    {notif.organ && (
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded border",
                        levelBadge(notif.level)
                      )}>
                        {notif.organ}
                      </span>
                    )}
                    {notif.source && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {notif.source}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between px-6 py-3 border-t border-border bg-muted/30">
        <span className="text-xs text-muted-foreground">
          {t("notifications.showing") || "显示"} {filtered.length} / {notifications.length} {t("notifications.items") || "条"}
        </span>
        <button
          onClick={() => router.push("/activity")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          {t("notifications.viewActivity") || "查看活动流"} →
        </button>
      </div>
    </div>
  );
}

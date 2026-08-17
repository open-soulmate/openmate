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

function formatTime(ts: number): string {
  const diff = Date.now() - ts * 1000;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t("notifications.4181f7");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("notifications.450055");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.687c18");
  const days = Math.floor(hours / 24);
  return t("notifications.152629");
}

function formatFullTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
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
            {t("notifications.title")}
          </h2>
          {unreadCount > 0 && (
            <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500/10 px-2 text-xs font-medium text-red-500">
              {unreadCount} {t("notifications.unread")}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePushTest}
            className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors border border-border"
          >
            🧪 {t("notifications.test")}
          </button>
          <button
            onClick={fetchNotifications}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title={t("notifications.refresh")}
          >
            <RefreshCw size={14} />
          </button>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <CheckCheck size={14} />
              {t("notifications.markAllRead")}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex h-8 items-center gap-1.5 rounded-md px-3 text-xs text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={14} />
              {t("notifications.clearAll")}
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
            placeholder={t("notifications.searchPlaceholder")}
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
          {t("notifications.filters")}
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
              {f === "all" ? (t("notifications.all")) : (t("notifications.unread"))}
            </button>
          ))}
        </div>
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="flex items-center gap-4 px-6 py-2 border-b border-border bg-muted/20">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("notifications.level")}:</span>
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("notifications.all")}</option>
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="error">Error</option>
              <option value="success">Success</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t("notifications.source")}:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("notifications.all")}</option>
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
              {t("notifications.clearFilters")}
            </button>
          )}
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
                ? (t("notifications.noResults"))
                : (t("notifications.empty"))}
            </p>
            <p className="text-xs mt-1">
              {searchQuery
                ? (t("notifications.tryDifferentSearch"))
                : (t("notifications.emptyDesc"))}
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
                          title={t("notifications.markRead")}
                        >
                          <Check size={14} />
                        </button>
                      )}
                      {notif.action_url && (
                        <button
                          onClick={(e) => { e.stopPropagation(); router.push(notif.action_url); }}
                          className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={t("notifications.navigate")}
                        >
                          <ExternalLink size={14} />
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDismiss(notif.id); }}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
                        title={t("notifications.dismiss")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-muted-foreground" title={formatFullTime(notif.timestamp)}>
                      {formatTime(notif.timestamp)}
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
          {t("notifications.showing")} {filtered.length} / {notifications.length} {t("notifications.items")}
        </span>
        <button
          onClick={() => router.push("/activity")}
          className="text-xs text-primary hover:underline flex items-center gap-1"
        >
          {t("notifications.viewActivity")} →
        </button>
      </div>
    </div>
  );
}

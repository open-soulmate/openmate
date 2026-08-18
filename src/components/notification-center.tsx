"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Bell, Check, CheckCheck, Trash2, X, Info, AlertTriangle,
  AlertCircle, CheckCircle, Loader2,
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
  timestamp: number;
  read: boolean;
}

function levelIcon(level: string) {
  switch (level) {
    case "error": return <AlertCircle size={14} className="text-red-500 shrink-0" />;
    case "warning": return <AlertTriangle size={14} className="text-amber-500 shrink-0" />;
    case "success": return <CheckCircle size={14} className="text-emerald-500 shrink-0" />;
    default: return <Info size={14} className="text-blue-500 shrink-0" />;
  }
}

function levelBorder(level: string) {
  switch (level) {
    case "error": return "border-l-red-500";
    case "warning": return "border-l-amber-500";
    case "success": return "border-l-emerald-500";
    default: return "border-l-blue-500";
  }
}

function formatTime(ts: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  const diff = Date.now() - ts * 1000;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return t("notifications.justNow");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t("notifications.minutesAgo", { minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { hours });
  const days = Math.floor(hours / 24);
  return t("notifications.daysAgo", { days });
}

export function NotificationCenter() {
  const { t } = useTranslation();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const panelRef = useRef<HTMLDivElement>(null);
  const apiBase = getApiBaseUrl();

  const fetchNotifications = useCallback(async () => {
    if (!apiBase) return;
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter === "unread") params.set("unread_only", "true");
      const res = await fetch(`${apiBase}/api/notifications/recent?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unread_count || 0);
      }
    } catch {}
  }, [apiBase, filter]);

  const fetchUnreadCount = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/notifications/unread-count`);
      if (res.ok) {
        const data = await res.json();
        setUnreadCount(data.unread_count || 0);
      }
    } catch {}
  }, [apiBase]);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch full list when panel opens
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleMarkRead = async (id: string) => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/${id}/read`, { method: "POST" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/read-all`, { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {}
  };

  const handleDismiss = async (id: string) => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/${id}`, { method: "DELETE" });
      const notif = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (notif && !notif.read) setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {}
  };

  const handleClearAll = async () => {
    if (!apiBase) return;
    try {
      await fetch(`${apiBase}/api/notifications/`, { method: "DELETE" });
      setNotifications([]);
      setUnreadCount(0);
    } catch {}
  };

  const handleClick = (notif: Notification) => {
    if (!notif.read) handleMarkRead(notif.id);
    if (notif.action_url) {
      router.push(notif.action_url);
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "relative flex h-8 w-8 items-center justify-center rounded-md transition-colors",
          open
            ? "bg-accent text-foreground"
            : "text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
        title={t("notifications.title") || "通知中心"}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[500px] rounded-xl border border-border bg-card shadow-xl overflow-hidden z-50 flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <Bell size={16} className="text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                {t("notifications.title") || "通知中心"}
              </h3>
              {unreadCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/10 px-1.5 text-[10px] font-medium text-red-500">
                  {unreadCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                  title={t("notifications.markAllRead") || "全部已读"}
                >
                  <CheckCheck size={12} />
                  <span className="hidden sm:inline">{t("notifications.markAllRead") || "全部已读"}</span>
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex border-b border-border px-4">
            <button
              onClick={() => setFilter("all")}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                filter === "all"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("notifications.all") || "全部"}
              {filter === "all" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={cn(
                "relative px-3 py-2 text-xs font-medium transition-colors",
                filter === "unread"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t("notifications.unread") || "未读"}
              {unreadCount > 0 && (
                <span className="ml-1 text-[10px] text-muted-foreground">({unreadCount})</span>
              )}
              {filter === "unread" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          </div>

          {/* Notification List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={20} className="animate-spin text-muted-foreground" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Bell size={32} className="mb-3 opacity-30" />
                <p className="text-sm">{t("notifications.empty") || "暂无通知"}</p>
                <p className="text-xs mt-1">{t("notifications.emptyDesc") || "系统事件和器官活动将在此显示"}</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={cn(
                      "group relative flex gap-3 px-4 py-3 border-l-2 transition-colors cursor-pointer",
                      levelBorder(notif.level),
                      notif.read
                        ? "bg-transparent hover:bg-accent/50"
                        : "bg-accent/30 hover:bg-accent/50"
                    )}
                    onClick={() => handleClick(notif)}
                  >
                    {/* Icon */}
                    <div className="mt-0.5">
                      {levelIcon(notif.level)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={cn(
                          "text-sm truncate",
                          notif.read ? "text-muted-foreground" : "text-foreground font-medium"
                        )}>
                          {notif.title}
                        </p>
                        {!notif.read && (
                          <div className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {notif.body}
                      </p>
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[10px] text-muted-foreground">
                          {formatTime(notif.timestamp, t)}
                        </span>
                        {notif.organ && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {notif.organ}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions (visible on hover) */}
                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {!notif.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMarkRead(notif.id);
                          }}
                          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                          title={t("notifications.markRead") || "标记已读"}
                        >
                          <Check size={12} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDismiss(notif.id);
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-red-500 transition-colors"
                        title={t("notifications.dismiss") || "移除"}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-2">
              <button
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {t("notifications.clearAll") || "清空全部"}
              </button>
              <button
                onClick={() => { router.push("/activity"); setOpen(false); }}
                className="text-xs text-primary hover:underline"
              >
                {t("notifications.viewAll") || "查看全部活动"} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

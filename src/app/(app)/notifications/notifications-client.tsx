'use client'

import { useState, useEffect, useCallback } from 'react'
import { getApiBaseUrl } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import {
  Bell, RefreshCw, Loader2, Trash2, CheckCircle2,
  AlertCircle, AlertTriangle, Info, Eye, EyeOff,
  BellOff, Send, BellRing,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Notification {
  id: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'error' | 'success'
  read: boolean
  created_at: string
}

interface NotificationStats {
  total: number
  unread: number
  read: number
}

const SEVERITY_META: Record<string, { icon: typeof Info; color: string; bg: string }> = {
  info:    { icon: Info,          color: 'text-blue-400',   bg: 'bg-blue-900/20' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  bg: 'bg-amber-900/20' },
  error:   { icon: AlertCircle,   color: 'text-red-400',    bg: 'bg-red-900/20' },
  success: { icon: CheckCircle2,  color: 'text-green-400',  bg: 'bg-green-900/20' },
}

export function NotificationsClient() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [stats, setStats] = useState<NotificationStats | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const apiBase = getApiBaseUrl()

  const fetchAll = useCallback(async () => {
    if (!apiBase) {
      setError(t('notifications.noApiBase', 'API base URL not configured'))
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const [notifRes, countRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/api/notifications/recent`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => []),
        fetch(`${apiBase}/api/notifications/unread-count`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => ({ unread: 0 })),
        fetch(`${apiBase}/api/notifications/stats`, { signal: AbortSignal.timeout(10000) })
          .then(r => r.json())
          .catch(() => null),
      ])

      setNotifications(Array.isArray(notifRes) ? notifRes : notifRes.notifications || [])
      setUnreadCount(countRes.unread ?? 0)
      setStats(statsRes)
    } catch (e: unknown) {
      setError(t('notifications.fetchError', 'Failed to load notifications: {{error}}', {
        error: e instanceof Error ? e.message : String(e)
      }))
    } finally {
      setLoading(false)
    }
  }, [apiBase, t])

  useEffect(() => { fetchAll() }, [fetchAll])

  const markAsRead = useCallback(async (notifId: string) => {
    if (!apiBase) return
    setActionLoading(`read-${notifId}`)
    try {
      await fetch(`${apiBase}/api/notifications/${notifId}/read`, { method: 'POST' })
      setNotifications(prev => prev.map(n => n.id === notifId ? { ...n, read: true } : n))
      setUnreadCount(prev => Math.max(0, prev - 1))
      setStats(prev => prev ? { ...prev, read: prev.read + 1, unread: Math.max(0, prev.unread - 1) } : prev)
    } catch { /* silent */ }
    finally { setActionLoading(null) }
  }, [apiBase])

  const markAllRead = useCallback(async () => {
    if (!apiBase) return
    setActionLoading('read-all')
    try {
      await fetch(`${apiBase}/api/notifications/read-all`, { method: 'POST' })
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      setStats(prev => prev ? { ...prev, read: prev.total, unread: 0 } : prev)
    } catch { /* silent */ }
    finally { setActionLoading(null) }
  }, [apiBase])

  const deleteNotification = useCallback(async (notifId: string) => {
    if (!apiBase) return
    setActionLoading(`del-${notifId}`)
    try {
      await fetch(`${apiBase}/api/notifications/${notifId}`, { method: 'DELETE' })
      setNotifications(prev => prev.filter(n => n.id !== notifId))
      setStats(prev => {
        if (!prev) return prev
        const wasUnread = notifications.find(n => n.id === notifId)?.read === false
        return { total: prev.total - 1, read: wasUnread ? prev.read : prev.read - 1, unread: wasUnread ? prev.unread - 1 : prev.unread }
      })
    } catch { /* silent */ }
    finally { setActionLoading(null) }
  }, [apiBase, notifications])

  const clearAll = useCallback(async () => {
    if (!apiBase) return
    if (!window.confirm(t('notifications.confirmClearAll', 'Delete all notifications?'))) return
    setActionLoading('clear-all')
    try {
      await fetch(`${apiBase}/api/notifications/`, { method: 'DELETE' })
      setNotifications([])
      setUnreadCount(0)
      setStats(prev => prev ? { total: 0, read: 0, unread: 0 } : prev)
    } catch { /* silent */ }
    finally { setActionLoading(null) }
  }, [apiBase, t])

  const sendTest = useCallback(async () => {
    if (!apiBase) return
    setActionLoading('test')
    try {
      await fetch(`${apiBase}/api/notifications/test`, { method: 'POST' })
      await fetchAll()
    } catch { /* silent */ }
    finally { setActionLoading(null) }
  }, [apiBase, fetchAll])

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'read') return n.read
    return true
  })

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      const now = new Date()
      const diffMs = now.getTime() - d.getTime()
      const diffMin = Math.floor(diffMs / 60000)
      if (diffMin < 1) return t('notifications.justNow', 'Just now')
      if (diffMin < 60) return t('notifications.minutesAgo', '{{count}}m ago', { count: diffMin })
      const diffHr = Math.floor(diffMin / 60)
      if (diffHr < 24) return t('notifications.hoursAgo', '{{count}}h ago', { count: diffHr })
      return d.toLocaleDateString()
    } catch { return ts }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-3 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-7 h-7 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            {t('notifications.title', 'Notifications')}
          </h1>
        </div>
        <button
          onClick={fetchAll}
          className={cn(
            'p-2 rounded-lg bg-card border border-border hover:bg-accent transition-colors',
            loading && 'opacity-50 pointer-events-none'
          )}
          title={t('notifications.refresh', 'Refresh')}
        >
          <RefreshCw className={cn('w-4 h-4 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-300 text-xs lg:text-sm">
          {error}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: t('notifications.total', 'Total'), value: stats.total, color: 'text-blue-400' },
            { label: t('notifications.unread', 'Unread'), value: stats.unread, color: 'text-amber-400' },
            { label: t('notifications.read', 'Read'), value: stats.read, color: 'text-green-400' },
          ].map(s => (
            <div key={s.label} className="bg-card border border-border rounded-lg p-4 text-center">
              <div className={cn('text-2xl font-bold', s.color)}>{s.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {(['all', 'unread', 'read'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors border',
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent'
              )}
            >
              {t(`notifications.filter.${f}`, f.charAt(0).toUpperCase() + f.slice(1))}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <button
            onClick={markAllRead}
            disabled={actionLoading === 'read-all' || unreadCount === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors border border-border',
              'bg-card hover:bg-accent text-muted-foreground disabled:opacity-40 disabled:pointer-events-none'
            )}
          >
            {actionLoading === 'read-all' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {t('notifications.markAllRead', 'Mark All Read')}
          </button>

          <button
            onClick={clearAll}
            disabled={actionLoading === 'clear-all' || notifications.length === 0}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors border border-border',
              'bg-card hover:bg-red-900/20 text-muted-foreground hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none'
            )}
          >
            {actionLoading === 'clear-all' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            {t('notifications.clearAll', 'Clear All')}
          </button>

          <button
            onClick={sendTest}
            disabled={actionLoading === 'test'}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs lg:text-sm font-medium transition-colors border border-border',
              'bg-card hover:bg-accent text-muted-foreground disabled:opacity-40 disabled:pointer-events-none'
            )}
          >
            {actionLoading === 'test' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
            {t('notifications.test', 'Test')}
          </button>
        </div>
      </div>

      {/* Notification List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <BellOff className="w-16 h-16 mb-4 opacity-30" />
          <p className="text-lg font-medium">
            {t('notifications.empty', 'No notifications')}
          </p>
          <p className="text-xs lg:text-sm mt-1">
            {filter !== 'all'
              ? t('notifications.emptyFilter', 'No {{filter}} notifications', { filter })
              : t('notifications.emptyHint', "You're all caught up!")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(n => {
            const meta = SEVERITY_META[n.severity] || SEVERITY_META.info
            const Icon = meta.icon
            const isProcessing = actionLoading === `read-${n.id}` || actionLoading === `del-${n.id}`

            return (
              <div
                key={n.id}
                className={cn(
                  'flex items-start gap-4 p-4 rounded-lg border transition-colors',
                  'bg-card border-border hover:bg-accent/50',
                  n.read && 'opacity-60'
                )}
              >
                {/* Severity icon */}
                <div className={cn('flex-shrink-0 p-2 rounded-lg', meta.bg)}>
                  <Icon className={cn('w-5 h-5', meta.color)} />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className={cn('text-xs lg:text-sm font-semibold text-foreground truncate')}>
                      {n.title}
                    </h3>
                    {!n.read && (
                      <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <p className="text-xs lg:text-sm text-muted-foreground mt-0.5 line-clamp-2">
                    {n.message}
                  </p>
                  <span className="text-xs text-muted-foreground/60 mt-1 inline-block">
                    {formatTime(n.created_at)}
                  </span>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <>
                      <button
                        onClick={() => n.read ? undefined : markAsRead(n.id)}
                        className={cn(
                          'p-1.5 rounded-md transition-colors',
                          n.read
                            ? 'text-green-400/40 cursor-default'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                        )}
                        title={n.read
                          ? t('notifications.alreadyRead', 'Already read')
                          : t('notifications.markRead', 'Mark as read')}
                      >
                        {n.read ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </button>
                      <button
                        onClick={() => deleteNotification(n.id)}
                        className="p-1.5 rounded-md text-muted-foreground hover:bg-red-900/20 hover:text-red-400 transition-colors"
                        title={t('notifications.delete', 'Delete')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

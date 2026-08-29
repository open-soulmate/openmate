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
import { PageLayout } from '@/components/page-layout';

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

const SEVERITY_META: Record<string, { icon: typeof Info; color: string; dot: string }> = {
  info:    { icon: Info,          color: 'text-blue-400',   dot: 'bg-blue-400' },
  warning: { icon: AlertTriangle, color: 'text-amber-400',  dot: 'bg-amber-400' },
  error:   { icon: AlertCircle,   color: 'text-red-400',    dot: 'bg-red-400' },
  success: { icon: CheckCircle2,  color: 'text-green-400',  dot: 'bg-green-400' },
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

  // Group by date
  const grouped = filtered.reduce<Record<string, Notification[]>>((acc, n) => {
    const d = new Date(n.created_at)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffDays = Math.floor(diffMs / 86400000)
    let label: string
    if (diffDays === 0) label = t('notifications.today', '今天')
    else if (diffDays === 1) label = t('notifications.yesterday', '昨天')
    else if (diffDays < 7) label = t('notifications.daysAgo', '{{count}}天前', { count: diffDays })
    else label = d.toLocaleDateString()
    if (!acc[label]) acc[label] = []
    acc[label].push(n)
    return acc
  }, {})

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch { return ts }
  }

  if (loading) {
    return (
        <PageLayout title="Notifications">
          
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    
        </PageLayout>
      )
  }

  return (
    <div className="max-w-4xl mx-auto px-3 lg:px-6 py-4 lg:py-6 space-y-4 lg:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <div className="relative shrink-0">
            <Bell className="w-5 h-5 lg:w-7 lg:h-7 text-foreground" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 lg:w-5 lg:h-5 flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <h1 className="text-lg lg:text-2xl font-bold text-foreground truncate">
            {t('notifications.title', 'Notifications')}
          </h1>
        </div>
        <button
          onClick={fetchAll}
          className={cn(
            'p-2 rounded-lg bg-card border border-border hover:bg-accent transition-colors shrink-0 touch-manipulation',
            loading && 'opacity-50 pointer-events-none'
          )}
          title={t('notifications.refresh', 'Refresh')}
        >
          <RefreshCw className={cn('w-3.5 h-3.5 lg:w-4 lg:h-4 text-muted-foreground', loading && 'animate-spin')} />
        </button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-900/20 border border-red-800 text-red-300 text-xs lg:text-sm">
          {error}
        </div>
      )}

      {/* Stats — compact inline */}
      {stats && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{stats.total} {t('notifications.total', '总计')}</span>
          <span className="text-amber-400">{stats.unread} {t('notifications.unread', '未读')}</span>
          <span className="text-green-400">{stats.read} {t('notifications.read', '已读')}</span>
        </div>
      )}

      {/* Filters & Actions — single row */}
      <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {(['all', 'unread', 'read'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border touch-manipulation',
              filter === f
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border hover:bg-accent'
            )}
          >
            {t(`notifications.filter.${f}`, f.charAt(0).toUpperCase() + f.slice(1))}
          </button>
        ))}

        <div className="w-px h-4 bg-border shrink-0 mx-1" />

        <button
          onClick={markAllRead}
          disabled={actionLoading === 'read-all' || unreadCount === 0}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-border bg-card hover:bg-accent text-muted-foreground disabled:opacity-40 disabled:pointer-events-none touch-manipulation"
        >
          {t('notifications.markAllRead', '全部已读')}
        </button>

        <button
          onClick={clearAll}
          disabled={actionLoading === 'clear-all' || notifications.length === 0}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-border bg-card hover:bg-red-900/20 text-muted-foreground hover:text-red-400 disabled:opacity-40 disabled:pointer-events-none touch-manipulation"
        >
          {t('notifications.clearAll', '清空')}
        </button>

        <button
          onClick={sendTest}
          disabled={actionLoading === 'test'}
          className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border border-border bg-card hover:bg-accent text-muted-foreground disabled:opacity-40 disabled:pointer-events-none touch-manipulation"
        >
          {t('notifications.test', '测试')}
        </button>
      </div>

      {/* Notification List — grouped by date */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 lg:py-20 text-muted-foreground">
          <BellOff className="w-12 h-12 lg:w-16 lg:h-16 mb-3 lg:mb-4 opacity-30" />
          <p className="text-sm lg:text-lg font-medium">
            {t('notifications.empty', 'No notifications')}
          </p>
          <p className="text-xs lg:text-sm mt-1">
            {filter !== 'all'
              ? t('notifications.emptyFilter', 'No {{filter}} notifications', { filter })
              : t('notifications.emptyHint', "You're all caught up!")}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              {/* Date group header */}
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[11px] font-medium text-muted-foreground/70">{dateLabel}</span>
                <div className="flex-1 h-px bg-border/50" />
              </div>

              {/* Items in this group */}
              <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border/50">
                {items.map(n => {
                  const meta = SEVERITY_META[n.severity] || SEVERITY_META.info
                  const Icon = meta.icon
                  const isProcessing = actionLoading === `read-${n.id}` || actionLoading === `del-${n.id}`

                  return (
                    <div
                      key={n.id}
                      className={cn(
                        'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-accent/30',
                        n.read && 'opacity-50'
                      )}
                    >
                      {/* Unread dot */}
                      <div className="flex-shrink-0 mt-1.5">
                        {!n.read ? (
                          <span className={cn('block w-2 h-2 rounded-full', meta.dot)} />
                        ) : (
                          <span className="block w-2 h-2" />
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className={cn('text-sm font-medium text-foreground truncate', !n.read && 'font-semibold')}>
                            {n.title}
                          </h3>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                      </div>

                      {/* Time + actions */}
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        <span className="text-[11px] text-muted-foreground/60 whitespace-nowrap">
                          {formatTime(n.created_at)}
                        </span>
                        <div className="flex items-center gap-0.5">
                          {isProcessing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              {!n.read && (
                                <button
                                  onClick={() => markAsRead(n.id)}
                                  className="p-1 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors touch-manipulation"
                                  title={t('notifications.markRead', 'Mark as read')}
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                onClick={() => deleteNotification(n.id)}
                                className="p-1 rounded-md text-muted-foreground hover:bg-red-900/20 hover:text-red-400 transition-colors touch-manipulation"
                                title={t('notifications.delete', 'Delete')}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

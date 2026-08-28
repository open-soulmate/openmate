'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { Clock, Play, Pause, Trash2, RefreshCw, Loader2, AlertCircle, ChevronRight, ChevronDown, Plus, X, Zap, History, CheckCircle, XCircle, Timer } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

const getApiUrl = () => getApiBaseUrl();

interface CronJob {
  id: string;
  job_id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused';
  next_run?: string;
  last_run?: string;
  deliver?: string;
  prompt?: string;
  agent?: string;
}

interface HistoryRun {
  run_id: string;
  started_at: string;
  finished_at?: string;
  status: 'success' | 'failed' | 'running';
  duration?: number;
  error?: string;
}

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

function formatDuration(ms?: number): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatTime(iso?: string): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString();
}

export function CronClient() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(new Set());
  const [historyData, setHistoryData] = useState<Record<string, HistoryRun[]>>({});
  const [historyLoading, setHistoryLoading] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSchedule, setCreateSchedule] = useState('30m');
  const [createPrompt, setCreatePrompt] = useState('');
  const [createDeliver, setCreateDeliver] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const { t } = useTranslation();

  const loadJobs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/cron/list');
      setJobs(data.jobs || []);
    } catch (e) { console.error('Failed to load cron jobs:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadJobs(); }, [loadJobs]);

  const handleAction = async (jobId: string, action: 'pause' | 'resume' | 'run' | 'delete') => {
    setActionLoading(jobId + action);
    try {
      if (action === 'delete') {
        await apiRequest(`/api/cron/${jobId}`, 'DELETE');
      } else {
        await apiRequest(`/api/cron/${jobId}/${action}`, 'POST');
      }
      await loadJobs();
    } catch (e) { console.error(`Failed to ${action} job:`, e); }
    setActionLoading(null);
  };

  const toggleHistory = async (jobId: string) => {
    setExpandedHistory(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      return next;
    });
    // Fetch history if not already loaded
    if (!historyData[jobId]) {
      setHistoryLoading(prev => new Set(prev).add(jobId));
      try {
        const data = await apiRequest(`/api/cron/${jobId}/history`);
        setHistoryData(prev => ({ ...prev, [jobId]: data.runs || data.history || [] }));
      } catch (e) { console.error('Failed to load history:', e); }
      setHistoryLoading(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  };

  const handleCreate = async () => {
    if (!createSchedule.trim()) return;
    setCreating(true);
    setCreateError('');
    try {
      await apiRequest('/api/cron/create', 'POST', {
        schedule: createSchedule.trim(),
        prompt: createPrompt.trim(),
        name: createName.trim(),
        deliver: createDeliver.trim(),
      });
      setShowCreate(false);
      setCreateName(''); setCreateSchedule('30m'); setCreatePrompt(''); setCreateDeliver('');
      await loadJobs();
    } catch (e: unknown) {
      setCreateError(e instanceof Error ? e.message : 'Failed to create job');
    }
    setCreating(false);
  };

  const activeCount = useMemo(() => jobs.filter(j => j.status === 'active').length, [jobs]);
  const pausedCount = useMemo(() => jobs.filter(j => j.status === 'paused').length, [jobs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3 lg:mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 lg:w-6 lg:h-6 text-primary" />
            {t('cron.title', 'Cron Jobs')}
          </h1>
          <p className="text-xs lg:text-sm text-muted-foreground mt-1">
            {t('cron.subtitle', 'Manage scheduled tasks and automation')}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          <button onClick={() => setShowCreate(!showCreate)}
            className="px-3 lg:px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm">
            <Plus className="w-4 h-4" /> {t('cron.newJob', 'New Job')}
          </button>
          <button onClick={loadJobs}
            className="px-3 lg:px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-1.5 lg:gap-2 text-xs lg:text-sm">
            <RefreshCw className="w-4 h-4" /> {t('cron.refreshBtn', 'Refresh')}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 lg:gap-4 mb-3 lg:mb-6">
        <div className="p-4 rounded-xl border bg-card">
          <p className="text-xl lg:text-2xl font-bold text-primary">{jobs.length}</p>
          <p className="text-xs lg:text-sm text-muted-foreground">{t('cron.totalTasks', 'Total Jobs')}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <p className="text-xl lg:text-2xl font-bold text-green-500">{activeCount}</p>
          <p className="text-xs lg:text-sm text-muted-foreground">{t('cron.running', 'Active')}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <p className="text-xl lg:text-2xl font-bold text-amber-500">{pausedCount}</p>
          <p className="text-xs lg:text-sm text-muted-foreground">{t('cron.paused', 'Paused')}</p>
        </div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="mb-3 lg:mb-6 p-3 lg:p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> {t('cron.createNew', 'Create New Job')}
            </h3>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="p-1 rounded hover:bg-muted">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('cron.taskNameLabel', 'Job Name')}</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)}
                placeholder={t('cron.taskNamePlaceholder', 'My scheduled task')}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('cron.scheduleRule', 'Schedule')} <span className="text-destructive">*</span></label>
              <input value={createSchedule} onChange={e => setCreateSchedule(e.target.value)}
                placeholder="30m / every 2h / 0 9 * * *"
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">{t('cron.executePrompt', 'Prompt')}</label>
            <textarea value={createPrompt} onChange={e => setCreatePrompt(e.target.value)} rows={3}
              placeholder={t('cron.promptPlaceholder', 'What should the agent do?')}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary resize-none" />
          </div>
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">{t('cron.deliverTarget', 'Deliver To')}</label>
            <input value={createDeliver} onChange={e => setCreateDeliver(e.target.value)}
              placeholder="origin / local / telegram:chat_id"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
          </div>
          {createError && <p className="text-xs text-destructive mb-3">{createError}</p>}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !createSchedule.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
              {t('cron.createBtn', 'Create')}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">
              {t('cron.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Job List */}
      {jobs.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertCircle className="w-8 h-8 mx-auto mb-2" />
          <p>{t('cron.noJobs', 'No cron jobs found')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map(job => {
            const jobId = job.job_id || job.id;
            const isExpanded = expandedHistory.has(jobId);
            const isLoadingHistory = historyLoading.has(jobId);
            const runs = historyData[jobId] || [];

            return (
              <div key={jobId} className="rounded-xl border bg-card overflow-hidden">
                {/* Job header card */}
                <div className="p-3 lg:p-4">
                  <div className="flex items-start lg:items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className={cn('w-2 h-2 rounded-full shrink-0',
                          job.status === 'active' ? 'bg-green-500' : 'bg-amber-500'
                        )} />
                        <h4 className="text-sm font-medium truncate">{job.name || jobId}</h4>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0 font-mono">
                          {job.schedule}
                        </span>
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded shrink-0',
                          job.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'
                        )}>
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 lg:gap-3 ml-4 text-[10px] lg:text-[11px] text-muted-foreground flex-wrap">
                        <span>ID: <span className="font-mono">{jobId.slice(0, 8)}</span></span>
                        {job.last_run && <span>{t('cron.lastRun', 'Last run')}: {formatTime(job.last_run)}</span>}
                        {job.next_run && <span>{t('cron.nextRun', 'Next run')}: {formatTime(job.next_run)}</span>}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-0.5 ml-2 lg:ml-3 shrink-0">
                      {job.status === 'active' ? (
                        <button onClick={() => handleAction(jobId, 'pause')}
                          disabled={actionLoading === jobId + 'pause'}
                          className="p-1.5 rounded-lg hover:bg-muted text-amber-500 touch-manipulation"
                          title={t('cron.pauseBtn', 'Pause')}>
                          {actionLoading === jobId + 'pause'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Pause className="w-3.5 h-3.5" />}
                        </button>
                      ) : (
                        <button onClick={() => handleAction(jobId, 'resume')}
                          disabled={actionLoading === jobId + 'resume'}
                          className="p-1.5 rounded-lg hover:bg-muted text-green-500 touch-manipulation"
                          title={t('cron.resumeBtn', 'Resume')}>
                          {actionLoading === jobId + 'resume'
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Play className="w-3.5 h-3.5" />}
                        </button>
                      )}
                      <button onClick={() => handleAction(jobId, 'run')}
                        disabled={actionLoading === jobId + 'run'}
                        className="p-1.5 rounded-lg hover:bg-muted text-primary touch-manipulation"
                        title={t('cron.runNow', 'Run Now')}>
                        {actionLoading === jobId + 'run'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Zap className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => toggleHistory(jobId)}
                        className={cn('p-1.5 rounded-lg hover:bg-muted touch-manipulation',
                          isExpanded ? 'text-primary bg-muted' : 'text-muted-foreground'
                        )}
                        title={t('cron.history', 'History')}>
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleAction(jobId, 'delete')}
                        disabled={actionLoading === jobId + 'delete'}
                        className="p-1.5 rounded-lg hover:bg-muted text-destructive touch-manipulation"
                        title={t('cron.deleteBtn', 'Delete')}>
                        {actionLoading === jobId + 'delete'
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* History expandable section */}
                {isExpanded && (
                  <div className="border-t border-border bg-muted/20">
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <History className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('cron.recentRuns', 'Recent Runs')}
                        </span>
                      </div>
                      {isLoadingHistory ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                        </div>
                      ) : runs.length === 0 ? (
                        <p className="text-xs text-muted-foreground text-center py-3">
                          {t('cron.noHistory', 'No run history yet')}
                        </p>
                      ) : (
                        <div className="space-y-1.5">
                          {runs.slice(0, 10).map((run) => (
                            <div key={run.run_id}
                              className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-0 px-3 py-2 rounded-lg bg-background/50 text-xs">
                              <div className="flex items-center gap-2">
                                {run.status === 'success' ? (
                                  <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                                ) : run.status === 'failed' ? (
                                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                                ) : (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                )}
                                <span className={cn('px-1.5 py-0.5 rounded text-[10px]',
                                  run.status === 'success' ? 'bg-green-500/10 text-green-500' :
                                  run.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                                  'bg-primary/10 text-primary'
                                )}>
                                  {run.status}
                                </span>
                                {run.error && <span className="text-destructive truncate max-w-[200px]">{run.error}</span>}
                              </div>
                              <div className="flex items-center gap-3 text-muted-foreground">
                                <span className="flex items-center gap-1">
                                  <Timer className="w-3 h-3" />
                                  {formatDuration(run.duration)}
                                </span>
                                <span>{formatTime(run.started_at)}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

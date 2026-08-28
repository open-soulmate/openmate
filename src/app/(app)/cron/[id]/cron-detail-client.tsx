'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Clock, Play, Pause, Trash2, RefreshCw, Loader2, ArrowLeft,
  Copy, Check, AlertCircle, ChevronRight, Calendar, Bot, Send, Zap,
} from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

const getApiUrl = () => getApiBaseUrl();

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  status: 'active' | 'paused';
  next_run?: string;
  last_run?: string;
  deliver?: string;
  prompt?: string;
  agent?: string;
  created_at?: string;
  run_count?: number;
  last_error?: string;
  payload?: Record<string, unknown>;
}

interface RunHistoryEntry {
  id: string;
  started_at: string;
  finished_at?: string;
  status: 'success' | 'failed' | 'running';
  output?: string;
  error?: string;
  duration_ms?: number;
}

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

const agentIcons: Record<string, string> = {
  hermes: '🏛️', mimo: '📱', opencode: '⚡', claude: '🟣', codex: '🟢',
  gemini: '🔵', qwen: '🟠', cursor: '▶️', copilot: '🐙', deepseek: '🐋',
  aider: '🤝', default: '🤖',
};

function getAgentFromJob(job: CronJob): string {
  if (job.agent) return job.agent;
  const text = (job.prompt || '') + ' ' + (job.deliver || '');
  if (text.includes('hermes') || text.includes('Hermes')) return 'hermes';
  if (text.includes('mimo') || text.includes('MiMo')) return 'mimo';
  if (text.includes('opencode')) return 'opencode';
  return 'hermes';
}

function formatSchedule(schedule: string, t: (key: string) => string): string {
  if (schedule.startsWith('every ')) {
    const parts = schedule.replace('every ', '').trim();
    return `${t('cronDetail.every')} ${parts}`;
  }
  if (schedule.includes(' * * *')) return `${t('cronDetail.cronPrefix')}: ${schedule}`;
  return schedule;
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function CronDetailClient({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [job, setJob] = useState<CronJob | null>(null);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJob = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiRequest(`/api/cron/${taskId}`);
      setJob(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load job');
    }
    setLoading(false);
  }, [taskId]);

  const loadHistory = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/cron/${taskId}/history`);
      setHistory(data.runs || data.history || []);
    } catch {
      // History endpoint may not exist yet — not critical
    }
  }, [taskId]);

  useEffect(() => {
    loadJob();
    loadHistory();
  }, [loadJob, loadHistory]);

  const handleAction = async (action: 'pause' | 'resume' | 'run' | 'delete') => {
    setActionLoading(action);
    try {
      if (action === 'delete') {
        await apiRequest(`/api/cron/${taskId}`, 'DELETE');
        router.push('/cron');
        return;
      }
      await apiRequest(`/api/cron/${taskId}/${action}`, 'POST');
      await loadJob();
      if (action === 'run') await loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : `Failed to ${action}`);
    }
    setActionLoading(null);
  };

  const copyId = () => {
    navigator.clipboard.writeText(taskId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-destructive" />
        <p className="text-muted-foreground">{error}</p>
        <button onClick={() => router.push('/cron')} className="px-4 py-2 rounded-lg border text-xs lg:text-sm hover:bg-muted">
          {t('cronDetail.backToList')}
        </button>
      </div>
    );
  }

  if (!job) return null;

  const agent = getAgentFromJob(job);
  const icon = agentIcons[agent] || agentIcons.default;

  return (
    <div className="px-3 lg:px-6 py-4 lg:py-6 h-full overflow-y-auto max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/cron')}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title={t('cronDetail.backToList')}
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <h1 className="text-2xl font-bold">{job.name || job.id}</h1>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
              job.status === 'active'
                ? 'bg-green-500/10 text-green-500'
                : 'bg-amber-500/10 text-amber-500'
            }`}>
              {job.status === 'active' ? (t('cronDetail.running')) : (t('cronDetail.paused'))}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground font-mono">{taskId}</span>
            <button onClick={copyId} className="p-0.5 rounded hover:bg-muted" title={t('cronDetail.copyId')}>
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {job.status === 'active' ? (
            <button
              onClick={() => handleAction('pause')}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs lg:text-sm hover:bg-muted transition-colors text-amber-500"
            >
              {actionLoading === 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
              {t('cronDetail.pause')}
            </button>
          ) : (
            <button
              onClick={() => handleAction('resume')}
              disabled={!!actionLoading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs lg:text-sm hover:bg-muted transition-colors text-green-500"
            >
              {actionLoading === 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {t('cronDetail.resume')}
            </button>
          )}
          <button
            onClick={() => handleAction('run')}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs lg:text-sm hover:bg-primary/90 transition-colors"
          >
            {actionLoading === 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            {t('cronDetail.runNow')}
          </button>
          <button
            onClick={() => handleAction('delete')}
            disabled={!!actionLoading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs lg:text-sm hover:bg-destructive/10 text-destructive transition-colors"
          >
            {actionLoading === 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {t('cronDetail.delete')}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-xs lg:text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Info Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.scheduleRule')}</span>
          </div>
          <p className="text-xs lg:text-sm font-mono">{job.schedule}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatSchedule(job.schedule, t)}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.execAgent')}</span>
          </div>
          <p className="text-xs lg:text-sm font-medium capitalize">{icon} {agent}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.nextRun')}</span>
          </div>
          <p className="text-xs lg:text-sm">{job.next_run ? new Date(job.next_run).toLocaleString('zh-CN') : '—'}</p>
        </div>
        <div className="p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-1">
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.lastRun')}</span>
          </div>
          <p className="text-xs lg:text-sm">{job.last_run ? new Date(job.last_run).toLocaleString('zh-CN') : '—'}</p>
        </div>
      </div>

      {/* Deliver Target */}
      {job.deliver && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <Send className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.deliverTarget')}</span>
          </div>
          <p className="text-xs lg:text-sm font-mono bg-muted/50 rounded-lg px-3 py-2">{job.deliver}</p>
        </div>
      )}

      {/* Prompt */}
      {job.prompt && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex items-center gap-2 mb-2">
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{t('cronDetail.execPrompt')}</span>
          </div>
          <pre className="text-xs lg:text-sm whitespace-pre-wrap bg-muted/50 rounded-lg px-3 py-2 font-mono max-h-60 overflow-y-auto">
            {job.prompt}
          </pre>
        </div>
      )}

      {/* Last Error */}
      {job.last_error && (
        <div className="mb-6 p-4 rounded-xl border border-destructive/30 bg-destructive/5">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            <span className="text-xs text-destructive font-medium">{t('cronDetail.recentError')}</span>
          </div>
          <pre className="text-xs lg:text-sm whitespace-pre-wrap text-destructive/80 font-mono">
            {job.last_error}
          </pre>
        </div>
      )}

      {/* Run History */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <h2 className="text-xs lg:text-sm font-medium flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            {t('cronDetail.execHistory')}
          </h2>
          <button onClick={loadHistory} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title={t('cronDetail.refresh')}>
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
        {history.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-xs lg:text-sm">
            <Clock className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>{t('cronDetail.noHistory')}</p>
            <p className="text-xs mt-1">{t('cronDetail.runNowHint')}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {history.map((entry) => (
              <div key={entry.id} className="p-4 hover:bg-muted/20 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      entry.status === 'success' ? 'bg-green-500' :
                      entry.status === 'failed' ? 'bg-destructive' :
                      'bg-amber-500 animate-pulse'
                    }`} />
                    <span className="text-xs lg:text-sm font-medium">
                      {entry.status === 'success' ? (t('cronDetail.success')) :
                       entry.status === 'failed' ? (t('cronDetail.failed')) : (t('cronDetail.running'))}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">{entry.id.slice(0, 8)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{formatDuration(entry.duration_ms)}</span>
                    <span>{new Date(entry.started_at).toLocaleString('zh-CN')}</span>
                  </div>
                </div>
                {entry.error && (
                  <p className="text-xs text-destructive mt-1 ml-4 line-clamp-2">{entry.error}</p>
                )}
                {entry.output && (
                  <p className="text-xs text-muted-foreground mt-1 ml-4 line-clamp-2">{entry.output}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

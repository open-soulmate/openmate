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

function formatSchedule(schedule: string): string {
  // Human-readable schedule description
  if (schedule.startsWith('every ')) {
    const parts = schedule.replace('every ', '').trim();
    return t('cron.t04123', { parts: parts });
  }
  if (schedule.includes(' * * *')) return t('cron.t50772', { schedule: schedule });
  return schedule;
}

function formatDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

export function CronDetailClient({ taskId }: { taskId: string }) {
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
        <button onClick={() => router.push('/cron')} className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">
          {t('cron.t72184')}
        <button>
      </div>
    );
  }

  if (!job) return null;

  const agent = getAgentFromJob(job);
  const icon = agentIcons[agent] || agentIcons.default;

  return (
    <div className="p-6 h-full overflow-y-auto max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/cron')}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          title=t('cron.t72184')
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
            }t('cron.t37100')w-2 h-2 rounded-full ${
                      entry.status === 'success' ? 'bg-green-500' :
                      entry.status === 'failed' ? 'bg-destructive' :
                      'bg-amber-500 animate-pulse'
                    }`} />
                    <span className="text-sm font-medium">
                      {entry.status === 'success' ? t('common.success') :
                       entry.status === 'failed' ? t('limb.failed') : t('common.running')}
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

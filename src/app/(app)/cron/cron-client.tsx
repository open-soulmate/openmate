'use client';
import { useState, useEffect } from 'react';
import { Clock, Play, Pause, Trash2, RefreshCw, Loader2, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/api-client';
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
}

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function CronClient() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/cron/list');
      setJobs(data.jobs || []);
    } catch (e) {
      console.error('Failed to load cron jobs:', e);
    }
    setLoading(false);
  };

  const handleAction = async (jobId: string, action: 'pause' | 'resume' | 'run' | 'delete') => {
    setActionLoading(jobId + action);
    try {
      if (action === 'delete') {
        await apiRequest(`/api/cron/${jobId}`, 'DELETE');
      } else {
        await apiRequest(`/api/cron/${jobId}/${action}`, 'POST');
      }
      await loadJobs();
    } catch (e) {
      console.error(`Failed to ${action} job:`, e);
    }
    setActionLoading(null);
  };

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const activeCount = jobs.filter(j => j.status === 'active').length;
  const pausedCount = jobs.filter(j => j.status === 'paused').length;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="w-6 h-6 text-primary" /> 定时任务</h1>
          <p className="text-sm text-muted-foreground mt-1">管理Hermes Agent的定时任务和计划</p>
        </div>
        <button onClick={loadJobs} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> 刷新</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-primary">{jobs.length}</p><p className="text-sm text-muted-foreground">总任务数</p></div>
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-green-500">{activeCount}</p><p className="text-sm text-muted-foreground">运行中</p></div>
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-amber-500">{pausedCount}</p><p className="text-sm text-muted-foreground">已暂停</p></div>
      </div>

      {/* Job List */}
      <div className="space-y-3">
        {jobs.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground"><AlertCircle className="w-8 h-8 mx-auto mb-2" /><p>暂无定时任务</p></div>
        ) : jobs.map(job => (
          <div key={job.id} className="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`w-2 h-2 rounded-full ${job.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                  <h3 className="font-medium">{job.name || job.id}</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{job.schedule}</span>
                </div>
                {job.prompt && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{job.prompt.slice(0, 150)}</p>}
                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                  {job.next_run && <span>下次: {new Date(job.next_run).toLocaleString()}</span>}
                  {job.last_run && <span>上次: {new Date(job.last_run).toLocaleString()}</span>}
                  {job.deliver && <span>投递: {job.deliver}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-4">
                {job.status === 'active' ? (
                  <button onClick={() => handleAction(job.id, 'pause')} disabled={actionLoading === job.id + 'pause'}
                    className="p-2 rounded-lg hover:bg-muted text-amber-500" title="暂停">
                    {actionLoading === job.id + 'pause' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pause className="w-4 h-4" />}
                  </button>
                ) : (
                  <button onClick={() => handleAction(job.id, 'resume')} disabled={actionLoading === job.id + 'resume'}
                    className="p-2 rounded-lg hover:bg-muted text-green-500" title="恢复">
                    {actionLoading === job.id + 'resume' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  </button>
                )}
                <button onClick={() => handleAction(job.id, 'run')} disabled={actionLoading === job.id + 'run'}
                  className="p-2 rounded-lg hover:bg-muted text-primary" title="立即执行">
                  {actionLoading === job.id + 'run' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <button onClick={() => handleAction(job.id, 'delete')} disabled={actionLoading === job.id + 'delete'}
                  className="p-2 rounded-lg hover:bg-muted text-destructive" title="删除">
                  {actionLoading === job.id + 'delete' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

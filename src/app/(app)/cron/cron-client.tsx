'use client';
import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Play, Pause, Trash2, RefreshCw, Loader2, AlertCircle, ChevronRight, ChevronDown, Bot, Plus, X, Zap } from 'lucide-react';
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
  agent?: string;
}

async function apiRequest(path: string, method = 'GET', body?: unknown) {
  const token = localStorage.getItem('openmate-token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${getApiUrl()}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

// Known agent icons
const agentIcons: Record<string, string> = {
  hermes: '🏛️', mimo: '📱', opencode: '⚡', claude: '🟣', codex: '🟢',
  gemini: '🔵', qwen: '🟠', cursor: '▶️', copilot: '🐙', deepseek: '🐋',
  aider: '🤝', default: '🤖',
};

function getAgentFromJob(job: CronJob): string {
  if (job.agent) return job.agent;
  // Try to detect from prompt or deliver
  const text = (job.prompt || '') + ' ' + (job.deliver || '');
  if (text.includes('hermes') || text.includes('Hermes')) return 'hermes';
  if (text.includes('mimo') || text.includes('MiMo')) return 'mimo';
  if (text.includes('opencode')) return 'opencode';
  return 'hermes'; // default
}

export function CronClient() {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedAgents, setExpandedAgents] = useState<Set<string>>(new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createSchedule, setCreateSchedule] = useState('30m');
  const [createPrompt, setCreatePrompt] = useState('');
  const [createDeliver, setCreateDeliver] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => { loadJobs(); }, []);

  const loadJobs = async () => {
    setLoading(true);
    try {
      const data = await apiRequest('/api/cron/list');
      const jobsList = data.jobs || [];
      setJobs(jobsList);
      // Auto-expand all agent groups
      const agents = new Set<string>(jobsList.map((j: CronJob) => getAgentFromJob(j)));
      setExpandedAgents(agents);
    } catch (e) { console.error('Failed to load cron jobs:', e); }
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
    } catch (e) { console.error(`Failed to ${action} job:`, e); }
    setActionLoading(null);
  };

  const toggleAgent = (agent: string) => {
    setExpandedAgents(prev => {
      const next = new Set(prev);
      next.has(agent) ? next.delete(agent) : next.add(agent);
      return next;
    });
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

  // Group jobs by agent
  const grouped = useMemo(() => {
    const map: Record<string, CronJob[]> = {};
    for (const job of jobs) {
      const agent = getAgentFromJob(job);
      if (!map[agent]) map[agent] = [];
      map[agent].push(job);
    }
    return map;
  }, [jobs]);

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  const activeCount = jobs.filter(j => j.status === 'active').length;
  const pausedCount = jobs.filter(j => j.status === 'paused').length;

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Clock className="w-6 h-6 text-primary" /> {t('cron.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('cron.subtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(!showCreate)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-2 text-sm"><Plus className="w-4 h-4" /> {t('cron.createJob')}</button>
          <button onClick={loadJobs} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> {t('cron.refresh')}</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-primary">{jobs.length}</p><p className="text-sm text-muted-foreground">{t('cron.totalJobs')}</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-green-500">{activeCount}</p><p className="text-sm text-muted-foreground">{t('cron.running')}</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-amber-500">{pausedCount}</p><p className="text-sm text-muted-foreground">{t('cron.paused')}</p></div>
      </div>

      {/* Create Dialog */}
      {showCreate && (
        <div className="mb-6 p-4 rounded-xl border bg-card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium flex items-center gap-2"><Zap className="w-4 h-4 text-primary" /> {t('cron.createCronJob')}</h3>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('cron.jobName')}</label>
              <input value={createName} onChange={e => setCreateName(e.target.value)} placeholder={t('cron.optional')}
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">{t('cron.scheduleRule')} <span className="text-destructive">*</span></label>
              <input value={createSchedule} onChange={e => setCreateSchedule(e.target.value)} placeholder="30m / every 2h / 0 9 * * *"
                className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
            </div>
          </div>
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">{t('cron.execPrompt')}</label>
            <textarea value={createPrompt} onChange={e => setCreatePrompt(e.target.value)} rows={3} placeholder={t('cron.promptPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary resize-none" />
          </div>
          <div className="mb-4">
            <label className="text-xs text-muted-foreground mb-1 block">{t('cron.deliverTarget')}</label>
            <input value={createDeliver} onChange={e => setCreateDeliver(e.target.value)} placeholder="origin / local / telegram:chat_id"
              className="w-full px-3 py-2 rounded-lg border bg-background text-sm outline-none focus:border-primary" />
          </div>
          {createError && (
            <p className="text-xs text-destructive mb-3">{createError}</p>
          )}
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={creating || !createSchedule.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center gap-1">
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />} {t('cron.create')}
            </button>
            <button onClick={() => { setShowCreate(false); setCreateError(''); }}
              className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">{t('cron.cancel')}</button>
          </div>
        </div>
      )}

      {/* Agent Groups */}
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-12 text-muted-foreground"><AlertCircle className="w-8 h-8 mx-auto mb-2" /><p>{t('cron.noJobs')}</p></div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([agent, agentJobs]) => {
            const isExpanded = expandedAgents.has(agent);
            const icon = agentIcons[agent] || agentIcons.default;
            const agentActive = agentJobs.filter(j => j.status === 'active').length;

            return (
              <div key={agent} className="rounded-xl border bg-card overflow-hidden">
                {/* Agent header */}
                <button onClick={() => toggleAgent(agent)}
                  className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xl">{icon}</span>
                    <div className="text-left">
                      <h3 className="font-medium capitalize">{agent}</h3>
                      <p className="text-xs text-muted-foreground">{t('cron.jobsCount', { count: agentJobs.length, active: agentActive })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{agentJobs.length}</span>
                    {isExpanded ? <ChevronDown size={16} className="text-muted-foreground" /> : <ChevronRight size={16} className="text-muted-foreground" />}
                  </div>
                </button>

                {/* Job list */}
                {isExpanded && (
                  <div className="border-t border-border">
                    {agentJobs.map((job, idx) => (
                      <div key={job.id} className={`flex items-center justify-between p-4 hover:bg-muted/20 transition-colors ${idx > 0 ? 'border-t border-border/50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${job.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            <h4 className="text-sm font-medium truncate">{job.name || job.id}</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{job.schedule}</span>
                          </div>
                          {job.prompt && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 ml-4">{job.prompt.slice(0, 120)}</p>}
                          <div className="flex items-center gap-3 mt-1.5 ml-4 text-[10px] text-muted-foreground">
                            {job.next_run && <span>{t('cron.nextRun')}: {new Date(job.next_run).toLocaleString()}</span>}
                            {job.last_run && <span>{t('cron.lastRun')}: {new Date(job.last_run).toLocaleString()}</span>}
                            {job.deliver && <span>→ {job.deliver}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 ml-3 shrink-0">
                          {job.status === 'active' ? (
                            <button onClick={() => handleAction(job.id, 'pause')} disabled={actionLoading === job.id + 'pause'}
                              className="p-1.5 rounded-lg hover:bg-muted text-amber-500" title={t('cron.pause')}>
                              {actionLoading === job.id + 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <button onClick={() => handleAction(job.id, 'resume')} disabled={actionLoading === job.id + 'resume'}
                              className="p-1.5 rounded-lg hover:bg-muted text-green-500" title={t('cron.resume')}>
                              {actionLoading === job.id + 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleAction(job.id, 'run')} disabled={actionLoading === job.id + 'run'}
                            className="p-1.5 rounded-lg hover:bg-muted text-primary" title={t('cron.runNow')}>
                            {actionLoading === job.id + 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleAction(job.id, 'delete')} disabled={actionLoading === job.id + 'delete'}
                            className="p-1.5 rounded-lg hover:bg-muted text-destructive" title={t('cron.delete')}>
                            {actionLoading === job.id + 'delete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>
                    ))}
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

'use client';
import { useState, useEffect, useMemo } from 'react';
import { Clock, Play, Pause, Trash2, RefreshCw, Loader2, AlertCircle, ChevronRight, ChevronDown, Bot, Plus, X, Zap } from 'lucide-react';
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
    } catch (e) { console.error(`Failed to ${action} job:t('cron.t45800')flex items-center justify-between p-4 hover:bg-muted/20 transition-colors ${idx > 0 ? 'border-t border-border/50' : ''}`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${job.status === 'active' ? 'bg-green-500' : 'bg-amber-500'}`} />
                            <h4 className="text-sm font-medium truncate">{job.name || job.id}</h4>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{job.schedule}</span>
                          </div>
                          {job.prompt && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 ml-4">{job.prompt.slice(0, 120)}</p>}
                          <div className="flex items-center gap-3 mt-1.5 ml-4 text-[10px] text-muted-foreground">
                            {job.next_run && <span>{t('cron.t57143')}: {new Date(job.next_run).toLocaleString()}</span>}
                            {job.last_run && <span>{t('cron.t54362')}: {new Date(job.last_run).toLocaleString()}</span>}
                            {job.deliver && <span>→ {job.deliver}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 ml-3 shrink-0">
                          {job.status === 'active' ? (
                            <button onClick={() => handleAction(job.id, 'pause')} disabled={actionLoading === job.id + 'pause'}
                              className="p-1.5 rounded-lg hover:bg-muted text-amber-500" title=t('common.pause')>
                              {actionLoading === job.id + 'pause' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Pause className="w-3.5 h-3.5" />}
                            </button>
                          ) : (
                            <button onClick={() => handleAction(job.id, 'resume')} disabled={actionLoading === job.id + 'resume'}
                              className="p-1.5 rounded-lg hover:bg-muted text-green-500" title=t('marrow.restore')>
                              {actionLoading === job.id + 'resume' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                            </button>
                          )}
                          <button onClick={() => handleAction(job.id, 'run')} disabled={actionLoading === job.id + 'run'}
                            className="p-1.5 rounded-lg hover:bg-muted text-primary" title=t('cron.t12279')>
                            {actionLoading === job.id + 'run' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          <button onClick={() => handleAction(job.id, 'delete')} disabled={actionLoading === job.id + 'delete'}
                            className="p-1.5 rounded-lg hover:bg-muted text-destructive" title=t('cron.delete')>
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

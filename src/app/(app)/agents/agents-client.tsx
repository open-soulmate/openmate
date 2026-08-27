'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, CheckCircle, XCircle, Loader2, Download, RefreshCw, Play, Pause, Trash2, ArrowUpCircle, Terminal, Monitor, Apple, ChevronDown, ChevronRight, Square, CheckSquare, RotateCcw } from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import { useTranslation } from 'react-i18next';

interface AgentInfo {
  id: string; name: string; binary: string; description: string; icon: string;
  available: boolean; version?: string; path?: string; installCommand?: string; os?: string;
  skillsManaged?: boolean;
  provider?: string; model?: string;
}

interface InstallState {
  status: 'idle' | 'starting' | 'running' | 'done' | 'error';
  progress: number;
  lines: string[];
  error?: string;
}

export function AgentsClient() {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [os, setOs] = useState('linux');
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [category, setCategory] = useState("all");
  const [installs, setInstalls] = useState<Record<string, InstallState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchAction, setBatchAction] = useState<string | null>(null);
  const [configuringAgent, setConfiguringAgent] = useState<string | null>(null);
  const [agentConfigs, setAgentConfigs] = useState<Record<string, {provider: string; model: string; custom?: boolean}>>({});
  const [providers, setProviders] = useState<Array<{name: string; base_url: string; models: Record<string, string>}>>([]);
  const eventSources = useRef<Record<string, EventSource>>({});

  const detect = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agents/detect`, { headers: { Authorization: `Bearer ${getToken()}` } });
      if (res.ok) {
        const data = await res.json();
        setOs(data.os || 'linux');
        setAgents(data.agents || []);
      }
    } catch (e) { console.error('Agent detection failed:', e); }
    setLoading(false);
  }, []);

  useEffect(() => { 
    detect();
    // Load Gland providers
    fetch(`${getApiBaseUrl()}/api/gland/providers`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json()).then(d => setProviders(d.providers || [])).catch(() => {});
    // Load saved agent configs from localStorage
    try {
      const saved = localStorage.getItem('openmate-agent-configs');
      if (saved) setAgentConfigs(JSON.parse(saved));
    } catch {}
  }, [detect]);
  useEffect(() => { return () => { Object.values(eventSources.current).forEach(es => es.close()); }; }, []);

  // ─── Actions ──────────────────────────────────────────────────

  const startInstall = async (agent: AgentInfo) => {
    if (!agent.installCommand) return;
    setInstalls(prev => ({ ...prev, [agent.id]: { status: 'starting', progress: 0, lines: [] } }));
    setExpanded(prev => ({ ...prev, [agent.id]: true }));

    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agents/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      const data = await res.json();
      if (!data.success) {
        setInstalls(prev => ({ ...prev, [agent.id]: { status: 'error', progress: 0, lines: [], error: data.error } }));
        return;
      }
      setInstalls(prev => ({ ...prev, [agent.id]: { status: 'running', progress: 5, lines: [] } }));
      const es = new EventSource(`${getApiBaseUrl()}/api/agents/install/${agent.id}/progress`);
      eventSources.current[agent.id] = es;
      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          setInstalls(prev => {
            const cur = prev[agent.id] || { status: 'running', progress: 0, lines: [] };
            return { ...prev, [agent.id]: { status: d.status || cur.status, progress: d.progress ?? cur.progress, lines: d.line ? [...cur.lines, d.line] : cur.lines, error: d.error || cur.error } };
          });
          if (d.status === 'done' || d.status === 'error') { es.close(); delete eventSources.current[agent.id]; if (d.status === 'done') setTimeout(detect, 2000); }
        } catch {}
      };
      es.onerror = () => { es.close(); delete eventSources.current[agent.id]; };
    } catch { setInstalls(prev => ({ ...prev, [agent.id]: { status: 'error', progress: 0, lines: [], error: 'Network error' } })); }
  };

  const handleUninstall = async (agent: AgentInfo) => {
    if (!confirm(t('agents.confirmUninstall', { name: agent.name }))) return;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agents/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      const data = await res.json();
      if (data.success) setTimeout(detect, 1000);
    } catch {}
  };

  const handleUpdate = async (agent: AgentInfo) => {
    setInstalls(prev => ({ ...prev, [agent.id]: { status: 'starting', progress: 0, lines: [] } }));
    setExpanded(prev => ({ ...prev, [agent.id]: true }));
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agents/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ agent_id: agent.id }),
      });
      const data = await res.json();
      if (data.success) {
        setInstalls(prev => ({ ...prev, [agent.id]: { status: 'running', progress: 5, lines: [] } }));
        const es = new EventSource(`${getApiBaseUrl()}/api/agents/install/${agent.id}/progress`);
        eventSources.current[agent.id] = es;
        es.onmessage = (event) => {
          try {
            const d = JSON.parse(event.data);
            setInstalls(prev => {
              const cur = prev[agent.id] || { status: 'running', progress: 0, lines: [] };
              return { ...prev, [agent.id]: { status: d.status || cur.status, progress: d.progress ?? cur.progress, lines: d.line ? [...cur.lines, d.line] : cur.lines, error: d.error || cur.error } };
            });
            if (d.status === 'done' || d.status === 'error') { es.close(); delete eventSources.current[agent.id]; if (d.status === 'done') setTimeout(detect, 2000); }
          } catch {}
        };
        es.onerror = () => { es.close(); delete eventSources.current[agent.id]; };
      }
    } catch {}
  };

  // ─── Batch Operations ─────────────────────────────────────────

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visible = filtered.map(a => a.id);
    if (visible.every(id => selected.has(id))) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visible));
    }
  };

  const batchInstall = async () => {
    setBatchAction('install');
    const toInstall = agents.filter(a => selected.has(a.id) && !a.available);
    for (const agent of toInstall) {
      await startInstall(agent);
      await new Promise(r => setTimeout(r, 500));
    }
    setBatchAction(null);
  };

  const batchUninstall = async () => {
    if (!confirm(t('agents.confirmBatchUninstall', { count: selected.size }))) return;
    setBatchAction('uninstall');
    const toUninstall = agents.filter(a => selected.has(a.id) && a.available);
    for (const agent of toUninstall) {
      await handleUninstall(agent);
      await new Promise(r => setTimeout(r, 300));
    }
    setBatchAction(null);
    setSelected(new Set());
  };

  // ─── Filter ───────────────────────────────────────────────────

  const filtered = agents.filter(a => {
    const matchCategory = category === "all" || (a as any).category === category;
    if (!matchCategory) return false;
    if (filter === 'available') return a.available;
    if (filter === 'unavailable') return !a.available;
    return true;
  });
  const availableCount = agents.filter(a => a.available).length;

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="w-6 h-6" /> {t('agents.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t('agents.autoDetect')} · {agents.length} {t('agents.category')}</p>
        </div>
        <button onClick={detect} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> {t('agents.autoDetect')}</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-primary">{agents.length}</p><p className="text-sm text-muted-foreground">{t('agents.title')}</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-green-500">{availableCount}</p><p className="text-sm text-muted-foreground">{t('agents.available')}</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-muted-foreground">{agents.length - availableCount}</p><p className="text-sm text-muted-foreground">{t('agents.unavailable')}</p></div>
      </div>

      {/* Filter + Batch */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-2">
          {(['all', 'available', 'unavailable'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>
              {f === 'all' ? t('agents.allAgents') : f === 'available' ? t('agents.onlyAvailable') : t('agents.onlyUnavailable')}
            </button>
          ))}
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{t('agents.selectAll')} {selected.size}</span>
            <button onClick={batchInstall} disabled={!!batchAction}
              className="px-3 py-1.5 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1 disabled:opacity-50">
              {batchAction === 'install' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />} {t('agents.batchInstall')}
            </button>
            <button onClick={batchUninstall} disabled={!!batchAction}
              className="px-3 py-1.5 rounded-lg text-xs border border-red-500/30 text-red-500 hover:bg-red-500/5 flex items-center gap-1 disabled:opacity-50">
              {batchAction === 'uninstall' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />} {t('agents.deleteAgent')}
            </button>
            <button onClick={() => setSelected(new Set())} className="px-2 py-1.5 rounded-lg text-xs border hover:bg-muted">{t('agents.deselectAll')}</button>
          </div>
        )}
      </div>

      {/* Select all */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          {filtered.length > 0 && filtered.every(a => selected.has(a.id)) ? <CheckSquare size={14} /> : <Square size={14} />}
          {t('agents.selectAll')}
        </button>
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(agent => {
          const install = installs[agent.id];
          const isInstalling = install && (install.status === 'running' || install.status === 'starting');
          const isExpanded = expanded[agent.id];
          const isSelected = selected.has(agent.id);

          return (
            <div key={agent.id} className={`rounded-xl border bg-card transition-all ${isSelected ? 'border-primary ring-1 ring-primary/30' : agent.available ? 'border-green-500/30' : 'border-border'}`}>
              <div className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  {/* Checkbox */}
                  <button onClick={() => toggleSelect(agent.id)} className="mt-1 shrink-0">
                    {isSelected ? <CheckSquare size={16} className="text-primary" /> : <Square size={16} className="text-muted-foreground" />}
                  </button>
                  {(agent as any).logo ? <img src={(agent as any).logo} alt={agent.name} className="w-10 h-10 rounded-lg object-contain bg-muted" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; (e.target as HTMLImageElement).nextElementSibling?.classList.remove("hidden"); }} /> : null}
                  <span className={`text-2xl ${(agent as any).logo ? "hidden" : ""}`}>{agent.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{agent.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{agent.description}</p>
                  </div>
                  {agent.available ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" /> : <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {agent.available ? (
                      <span className="text-green-500">● {t('agents.installed')}{agent.version ? ` v${agent.version}` : ''}</span>
                    ) : (
                      <span>● {t('agents.unavailable')}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {agent.available ? (
                      <>
                        <button onClick={() => setConfiguringAgent(configuringAgent === agent.id ? null : agent.id)}
                          className="px-2 py-1 rounded-lg text-xs border hover:bg-muted flex items-center gap-1" title={t('agents.modelConfig')}>
                          ⚙️
                        </button>
                        <button onClick={() => handleUpdate(agent)} disabled={!!isInstalling}
                          className="px-2 py-1 rounded-lg text-xs border hover:bg-muted flex items-center gap-1 disabled:opacity-50" title={t('agents.restart')}>
                          <ArrowUpCircle className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleUninstall(agent)}
                          className="px-2 py-1 rounded-lg text-xs border border-red-500/30 text-red-500 hover:bg-red-500/5 flex items-center gap-1" title={t('agents.deleteAgent')}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => startInstall(agent)} disabled={!!isInstalling}
                        className="px-2.5 py-1 rounded-lg text-xs border hover:bg-muted flex items-center gap-1 disabled:opacity-50 transition-colors">
                        {isInstalling ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('agents.installing')}</> : <><Download className="w-3 h-3" /> {t('agents.install')}</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Install progress */}
              {install && install.status !== 'idle' && (
                <div className="border-t border-border">
                  <div className="h-1 bg-muted">
                    <div className={`h-full transition-all duration-500 ${install.status === 'done' ? 'bg-green-500' : install.status === 'error' ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${install.progress}%` }} />
                  </div>
                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      {install.status === 'done' && <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> {t('agents.installDone')}</span>}
                      {install.status === 'error' && <span className="text-red-500">{install.error}</span>}
                      {install.status === 'running' && <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {install.progress}%</span>}
                      {install.status === 'starting' && <span className="text-muted-foreground">{t('agents.detecting')}</span>}
                    </div>
                    {install.lines.length > 0 && (
                      <button onClick={() => setExpanded(prev => ({ ...prev, [agent.id]: !prev[agent.id] }))} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}{t('agents.logs')}
                      </button>
                    )}
                  </div>
                  {isExpanded && install.lines.length > 0 && (
                    <div className="px-4 pb-3 max-h-40 overflow-y-auto">
                      <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">{install.lines.slice(-20).join('\n')}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* Install command hint */}
              {agent.installCommand && !agent.available && !install && (
                <div className="px-4 pb-3">
                  <div className="p-2 rounded-lg bg-muted text-xs font-mono flex items-center gap-1.5 text-muted-foreground"><Terminal className="w-3 h-3 shrink-0" />{agent.installCommand}</div>
                </div>
              )}

              {/* Model config panel */}
              {agent.available && configuringAgent === agent.id && (
                <div className="border-t border-border px-4 py-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2">{t('agents.modelConfig')}</div>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={!agentConfigs[agent.id]?.custom}
                      onChange={() => {
                        const newConfigs = { ...agentConfigs };
                        delete newConfigs[agent.id];
                        setAgentConfigs(newConfigs);
                        localStorage.setItem('openmate-agent-configs', JSON.stringify(newConfigs));
                      }} />
                    {t('agents.useGlobalDefault')}
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={!!agentConfigs[agent.id]?.custom}
                      onChange={() => {
                        const newConfigs = { ...agentConfigs, [agent.id]: { custom: true, provider: '', model: '' } };
                        setAgentConfigs(newConfigs);
                        localStorage.setItem('openmate-agent-configs', JSON.stringify(newConfigs));
                      }} />
                    {t('agents.customModel')}
                  </label>
                  {agentConfigs[agent.id]?.custom && (
                    <>
                      <div className="flex gap-2 items-center">
                        <label className="text-xs text-muted-foreground w-16">Provider</label>
                        <select
                          value={agentConfigs[agent.id]?.provider || ''}
                          onChange={e => {
                            const cfg = { ...agentConfigs[agent.id], provider: e.target.value, model: '' };
                            const newConfigs = { ...agentConfigs, [agent.id]: cfg };
                            setAgentConfigs(newConfigs);
                            localStorage.setItem('openmate-agent-configs', JSON.stringify(newConfigs));
                          }}
                          className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs"
                        >
                          <option value="">{t('agents.selectProvider')}</option>
                          {providers.map(p => (
                            <option key={p.name} value={p.name}>{p.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex gap-2 items-center">
                        <label className="text-xs text-muted-foreground w-16">Model</label>
                        <select
                          value={agentConfigs[agent.id]?.model || ''}
                          onChange={e => {
                            const cfg = { ...agentConfigs[agent.id], model: e.target.value };
                            const newConfigs = { ...agentConfigs, [agent.id]: cfg };
                            setAgentConfigs(newConfigs);
                            localStorage.setItem('openmate-agent-configs', JSON.stringify(newConfigs));
                          }}
                          className="flex-1 px-2 py-1 rounded border border-border bg-background text-xs"
                        >
                          <option value="">{t('agents.selectModel')}</option>
                          {(() => {
                            const cfg = agentConfigs[agent.id];
                            const prov = providers.find(p => p.name === cfg?.provider);
                            if (!prov) return null;
                            return Object.entries(prov.models).map(([type, model]) => (
                              <option key={`${type}-${model}`} value={model}>{type}: {model}</option>
                            ));
                          })()}
                        </select>
                      </div>
                    </>
                  )}
                  <div className="text-xs text-muted-foreground">
                    {agentConfigs[agent.id]?.custom 
                      ? (agentConfigs[agent.id]?.provider && agentConfigs[agent.id]?.model 
                          ? <span className="text-green-500">✓ {agentConfigs[agent.id].provider}/{agentConfigs[agent.id].model}</span>
                          : t('agents.selectProviderAndModel'))
                      : t('agents.usingGlobalConfig')}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

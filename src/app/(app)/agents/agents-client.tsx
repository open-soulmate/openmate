'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Bot, CheckCircle, XCircle, Loader2, Download, RefreshCw, Play, Terminal, Monitor, Apple, Smartphone, ChevronDown, ChevronRight } from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

interface AgentInfo {
  id: string; name: string; binary: string; description: string; icon: string;
  available: boolean; version?: string; path?: string; installCommand?: string; os?: string;
}

interface InstallState {
  status: 'idle' | 'starting' | 'running' | 'done' | 'error';
  progress: number;
  lines: string[];
  error?: string;
}

export function AgentsClient() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [os, setOs] = useState('linux');
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [installs, setInstalls] = useState<Record<string, InstallState>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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

  useEffect(() => { detect(); }, [detect]);

  // Cleanup EventSources
  useEffect(() => {
    return () => { Object.values(eventSources.current).forEach(es => es.close()); };
  }, []);

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

      // Connect SSE for progress
      setInstalls(prev => ({ ...prev, [agent.id]: { status: 'running', progress: 5, lines: [] } }));
      const es = new EventSource(`${getApiBaseUrl()}/api/agents/install/${agent.id}/progress`);
      eventSources.current[agent.id] = es;

      es.onmessage = (event) => {
        try {
          const d = JSON.parse(event.data);
          setInstalls(prev => {
            const current = prev[agent.id] || { status: 'running', progress: 0, lines: [] };
            return {
              ...prev,
              [agent.id]: {
                status: d.status || current.status,
                progress: d.progress ?? current.progress,
                lines: d.line ? [...current.lines, d.line] : current.lines,
                error: d.error || current.error,
              },
            };
          });

          if (d.status === 'done' || d.status === 'error') {
            es.close();
            delete eventSources.current[agent.id];
            // Re-detect after successful install
            if (d.status === 'done') setTimeout(detect, 2000);
          }
        } catch {}
      };

      es.onerror = () => {
        es.close();
        delete eventSources.current[agent.id];
        setInstalls(prev => {
          const current = prev[agent.id];
          if (current?.status === 'running') {
            return { ...prev, [agent.id]: { ...current, status: 'error', error: 'Connection lost' } };
          }
          return prev;
        });
      };
    } catch (e) {
      setInstalls(prev => ({ ...prev, [agent.id]: { status: 'error', progress: 0, lines: [], error: 'Network error' } }));
    }
  };

  const filtered = agents.filter(a => {
    if (filter === 'available') return a.available;
    if (filter === 'unavailable') return !a.available;
    return true;
  });

  const availableCount = agents.filter(a => a.available).length;

  const osIcon = os === 'darwin' ? <Apple size={14} /> : os === 'win32' ? <Monitor size={14} /> : <Monitor size={14} />;
  const osName = os === 'darwin' ? 'macOS' : os === 'win32' ? 'Windows' : 'Linux';

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="w-6 h-6" /> Agent 管理</h1>
          <p className="text-sm text-muted-foreground mt-1">自动检测本地安装的AI Agent，支持{agents.length}种Agent接入</p>
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
            {osIcon}<span>当前系统: {osName}</span>
          </div>
        </div>
        <button onClick={detect} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> 重新检测</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-primary">{agents.length}</p><p className="text-sm text-muted-foreground">支持的Agent</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-green-500">{availableCount}</p><p className="text-sm text-muted-foreground">已安装可用</p></div>
        <div className="p-4 rounded-xl border bg-card"><p className="text-2xl font-bold text-muted-foreground">{agents.length - availableCount}</p><p className="text-sm text-muted-foreground">未安装</p></div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'available', 'unavailable'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>
            {f === 'all' ? '全部' : f === 'available' ? '已安装' : '未安装'}
          </button>
        ))}
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(agent => {
          const install = installs[agent.id];
          const isInstalling = install && (install.status === 'running' || install.status === 'starting');
          const isExpanded = expanded[agent.id];

          return (
            <div key={agent.id} className={`rounded-xl border bg-card transition-all ${agent.available ? 'border-green-500/30' : 'border-border'}`}>
              {/* Card header */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{agent.icon}</span>
                    <div>
                      <h3 className="font-medium">{agent.name}</h3>
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    </div>
                  </div>
                  {agent.available ? <CheckCircle className="w-5 h-5 text-green-500 shrink-0" /> : <XCircle className="w-5 h-5 text-muted-foreground shrink-0" />}
                </div>

                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">
                    {agent.available ? (
                      <span className="text-green-500">● 已安装{agent.version ? ` v${agent.version}` : ''}</span>
                    ) : (
                      <span>● 未安装</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {agent.available ? (
                      <button className="px-2.5 py-1 rounded-lg text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"><Play className="w-3 h-3" /> 启动</button>
                    ) : (
                      <button onClick={() => startInstall(agent)} disabled={!!isInstalling}
                        className="px-2.5 py-1 rounded-lg text-xs border hover:bg-muted flex items-center gap-1 disabled:opacity-50 transition-colors">
                        {isInstalling ? <><Loader2 className="w-3 h-3 animate-spin" /> 安装中...</> : <><Download className="w-3 h-3" /> 安装</>}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Install progress */}
              {install && install.status !== 'idle' && (
                <div className="border-t border-border">
                  {/* Progress bar */}
                  <div className="h-1 bg-muted">
                    <div className={`h-full transition-all duration-500 ${install.status === 'done' ? 'bg-green-500' : install.status === 'error' ? 'bg-red-500' : 'bg-primary'}`}
                      style={{ width: `${install.progress}%` }} />
                  </div>

                  {/* Status line */}
                  <div className="px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      {install.status === 'done' && <span className="text-green-500 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> 安装完成</span>}
                      {install.status === 'error' && <span className="text-red-500">安装失败: {install.error}</span>}
                      {install.status === 'running' && <span className="text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> {install.progress}%</span>}
                      {install.status === 'starting' && <span className="text-muted-foreground">准备中...</span>}
                    </div>
                    {install.lines.length > 0 && (
                      <button onClick={() => setExpanded(prev => ({ ...prev, [agent.id]: !prev[agent.id] }))} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}日志
                      </button>
                    )}
                  </div>

                  {/* Log output */}
                  {isExpanded && install.lines.length > 0 && (
                    <div className="px-4 pb-3 max-h-40 overflow-y-auto">
                      <pre className="text-[10px] text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed">
                        {install.lines.slice(-20).join('\n')}
                      </pre>
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
            </div>
          );
        })}
      </div>
    </div>
  );
}

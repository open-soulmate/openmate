'use client';
import { useState, useEffect } from 'react';
import { Bot, CheckCircle, XCircle, Loader2, Download, RefreshCw, Play, Terminal } from 'lucide-react';
import { detectAllAgents, type DetectedAgent } from '@/lib/agent-detector';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

export function AgentsClient() {
  const [agents, setAgents] = useState<DetectedAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [installing, setInstalling] = useState<Record<string, string>>({}); // agentId -> status

  useEffect(() => { detect(); }, []);

  const detect = async () => {
    setLoading(true);
    try {
      const detected = await detectAllAgents();
      setAgents(detected);
    } catch (e) {
      console.error('Agent detection failed:', e);
    }
    setLoading(false);
  };

  const handleInstall = async (agent: DetectedAgent) => {
    if (!agent.installCommand) return;
    // If it's a URL, open in new tab
    if (agent.installCommand.startsWith('http')) {
      window.open(agent.installCommand, '_blank');
      return;
    }
    // If it's "VS Code extension", show info
    if (agent.installCommand.includes('extension')) {
      setInstalling(prev => ({ ...prev, [agent.id]: '请在VS Code中搜索安装 ' + agent.name }));
      return;
    }

    setInstalling(prev => ({ ...prev, [agent.id]: 'installing' }));
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/agent/install`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ command: agent.installCommand }),
      });
      const data = await res.json();
      if (data.success) {
        setInstalling(prev => ({ ...prev, [agent.id]: 'done' }));
        // Re-detect after install
        setTimeout(() => { detect(); setInstalling(prev => { const n = { ...prev }; delete n[agent.id]; return n; }); }, 2000);
      } else {
        setInstalling(prev => ({ ...prev, [agent.id]: `失败: ${data.error}` }));
      }
    } catch (e) {
      setInstalling(prev => ({ ...prev, [agent.id]: '网络错误' }));
    }
  };

  const filtered = agents.filter(a => {
    if (filter === 'available') return a.available;
    if (filter === 'unavailable') return !a.available;
    return true;
  });

  const availableCount = agents.filter(a => a.available).length;

  if (loading) return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bot className="w-6 h-6" /> Agent 管理</h1>
          <p className="text-sm text-muted-foreground mt-1">自动检测本地安装的AI Agent，支持{agents.length}种Agent接入</p>
        </div>
        <button onClick={detect} className="px-4 py-2 rounded-lg border hover:bg-muted flex items-center gap-2 text-sm"><RefreshCw className="w-4 h-4" /> 重新检测</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-primary">{agents.length}</p><p className="text-sm text-muted-foreground">支持的Agent</p></div>
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-green-500">{availableCount}</p><p className="text-sm text-muted-foreground">已安装可用</p></div>
        <div className="p-4 rounded-lg border bg-card"><p className="text-2xl font-bold text-muted-foreground">{agents.length - availableCount}</p><p className="text-sm text-muted-foreground">未安装</p></div>
      </div>

      {/* Filter */}
      <div className="flex gap-2 mb-4">
        {(['all', 'available', 'unavailable'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-sm ${filter === f ? 'bg-primary text-primary-foreground' : 'border hover:bg-muted'}`}>
            {f === 'all' ? '全部' : f === 'available' ? '已安装' : '未安装'}
          </button>
        ))}
      </div>

      {/* Agent Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(agent => (
          <div key={agent.id} className={`p-4 rounded-lg border bg-card transition-colors ${agent.available ? 'border-green-500/30' : 'border-muted'}`}>
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{agent.icon}</span>
                <div>
                  <h3 className="font-medium">{agent.name}</h3>
                  <p className="text-xs text-muted-foreground">{agent.description}</p>
                </div>
              </div>
              {agent.available ? (
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              )}
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
                  <button className="px-2 py-1 rounded text-xs bg-primary text-primary-foreground hover:bg-primary/90 flex items-center gap-1"><Play className="w-3 h-3" /> 启动</button>
                ) : (
                  <button
                    onClick={() => handleInstall(agent)}
                    disabled={installing[agent.id] === 'installing'}
                    className="px-2 py-1 rounded text-xs border hover:bg-muted flex items-center gap-1 disabled:opacity-50"
                  >
                    {installing[agent.id] === 'installing' ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> 安装中...</>
                    ) : (
                      <><Download className="w-3 h-3" /> 安装</>
                    )}
                  </button>
                )}
              </div>
            </div>
            {/* Install status / command */}
            {installing[agent.id] && installing[agent.id] !== 'installing' && (
              <div className={`mt-2 p-2 rounded text-xs ${installing[agent.id] === 'done' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                {installing[agent.id] === 'done' ? '✓ 安装成功' : installing[agent.id]}
              </div>
            )}
            {agent.installCommand && !agent.available && !installing[agent.id] && (
              <div className="mt-2 p-2 rounded bg-muted text-xs font-mono flex items-center gap-1"><Terminal className="w-3 h-3 shrink-0" />{agent.installCommand}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { Bot, CheckCircle, XCircle, Loader2, Cpu, MessageSquare, Code2, Terminal, Workflow, Zap } from 'lucide-react';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

const getApiUrl = () => getApiBaseUrl();

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  available: boolean;
  binary: string;
}

// Agent visual config
const AGENT_STYLES: Record<string, { icon: typeof Bot; gradient: string; accent: string }> = {
  hermes: { icon: Workflow, gradient: 'from-cyan-500 to-blue-600', accent: 'text-cyan-400' },
  mimo: { icon: Zap, gradient: 'from-purple-500 to-pink-600', accent: 'text-purple-400' },
  claude: { icon: MessageSquare, gradient: 'from-orange-500 to-red-600', accent: 'text-orange-400' },
  codex: { icon: Code2, gradient: 'from-emerald-500 to-teal-600', accent: 'text-emerald-400' },
  aider: { icon: Bot, gradient: 'from-pink-500 to-rose-600', accent: 'text-pink-400' },
};

interface AgentSelectorProps {
  onSelect: (agent: AgentInfo) => void;
  selectedAgent: AgentInfo | null;
}

export function AgentSelector({ onSelect, selectedAgent }: AgentSelectorProps) {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`${getApiUrl()}/api/agent-proxy/agents`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = await res.json();
        setAgents(data);
      }
    } catch (e) {
      console.error('Failed to load agents:', e);
    }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const available = agents.filter(a => a.available);
  const unavailable = agents.filter(a => !a.available);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Bot className="w-5 h-5 text-primary" />
          选择 Agent
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          选择一个AI Agent开始对话
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Available agents */}
        {available.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              可用 Agent ({available.length})
            </p>
            <div className="grid grid-cols-1 gap-2">
              {available.map(agent => {
                const style = AGENT_STYLES[agent.id] || { icon: Bot, gradient: 'from-gray-500 to-gray-600', accent: 'text-gray-400' };
                const Icon = style.icon;
                const isSelected = selectedAgent?.id === agent.id;

                return (
                  <button
                    key={agent.id}
                    onClick={() => onSelect(agent)}
                    className={`group relative w-full text-left p-4 rounded-xl border transition-all duration-200 hover:shadow-md ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                        : 'border-border bg-card hover:border-primary/50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${style.gradient} flex items-center justify-center shadow-sm`}>
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{agent.name}</span>
                          {isSelected && <CheckCircle className="w-4 h-4 text-primary" />}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {agent.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-xs text-green-500">就绪</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Unavailable agents */}
        {unavailable.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3 px-1">
              未安装 ({unavailable.length})
            </p>
            <div className="grid grid-cols-1 gap-2">
              {unavailable.map(agent => {
                const style = AGENT_STYLES[agent.id] || { icon: Bot, gradient: 'from-gray-400 to-gray-500', accent: 'text-gray-400' };
                const Icon = style.icon;

                return (
                  <div
                    key={agent.id}
                    className="w-full text-left p-4 rounded-xl border border-muted bg-muted/30 opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        <Icon className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium text-sm text-muted-foreground">{agent.name}</span>
                        <p className="text-xs text-muted-foreground/70 mt-0.5">
                          {agent.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <XCircle className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">未安装</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {agents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Bot className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm">未检测到Agent</p>
            <p className="text-xs mt-1">请安装Hermes、MiMo、Claude等CLI工具</p>
          </div>
        )}
      </div>
    </div>
  );
}

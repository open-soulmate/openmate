'use client';

import { useTranslation } from 'react-i18next';
import {
  Bot, Shield, Zap, User, Trash2, ChevronDown,
  ChevronRight, Settings, UserPlus, Edit3,
  ArrowUp, ArrowRight, ArrowDown, Star, Trophy, TrendingUp,
} from 'lucide-react';
import { useAIGroupsStore } from '@/stores/ai-groups-store';

const ROLE_ICONS: Record<string, any> = { advisor: Shield, executor: Zap, verifier: Bot, human: User };
const ROLE_COLORS: Record<string, string> = { advisor: 'text-yellow-400', executor: 'text-blue-400', verifier: 'text-green-400', human: 'text-purple-400' };
const ROLE_BG_COLORS: Record<string, string> = { advisor: 'bg-yellow-500/20', executor: 'bg-blue-500/20', verifier: 'bg-green-500/20', human: 'bg-purple-500/20' };

const AGENT_AVATAR_COLORS = [
  'bg-rose-500/20 text-rose-400', 'bg-sky-500/20 text-sky-400', 'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400', 'bg-violet-500/20 text-violet-400', 'bg-pink-500/20 text-pink-400',
  'bg-teal-500/20 text-teal-400', 'bg-orange-500/20 text-orange-400',
];

function getAgentAvatarColor(index: number) {
  return AGENT_AVATAR_COLORS[index % AGENT_AVATAR_COLORS.length];
}

const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
  if (trend === 'up') return <ArrowUp className="w-3 h-3 text-emerald-400" />;
  if (trend === 'down') return <ArrowDown className="w-3 h-3 text-red-400" />;
  return <ArrowRight className="w-3 h-3 text-muted-foreground" />;
};

export function AIGroupsWorkspace() {
  const { t } = useTranslation();

  const selectedGroup = useAIGroupsStore((s) => s.selectedGroup);
  const expandedAgent = useAIGroupsStore((s) => s.expandedAgent);
  const setExpandedAgent = useAIGroupsStore((s) => s.setExpandedAgent);
  const showAddAgent = useAIGroupsStore((s) => s.showAddAgent);
  const setShowAddAgent = useAIGroupsStore((s) => s.setShowAddAgent);
  const newAgent = useAIGroupsStore((s) => s.newAgent);
  const setNewAgent = useAIGroupsStore((s) => s.setNewAgent);
  const editingAgent = useAIGroupsStore((s) => s.editingAgent);
  const editAgentData = useAIGroupsStore((s) => s.editAgentData);
  const setEditAgentData = useAIGroupsStore((s) => s.setEditAgentData);
  const showGroupSettings = useAIGroupsStore((s) => s.showGroupSettings);
  const setShowGroupSettings = useAIGroupsStore((s) => s.setShowGroupSettings);
  const editGroupName = useAIGroupsStore((s) => s.editGroupName);
  const setEditGroupName = useAIGroupsStore((s) => s.setEditGroupName);
  const editGroupDesc = useAIGroupsStore((s) => s.editGroupDesc);
  const setEditGroupDesc = useAIGroupsStore((s) => s.setEditGroupDesc);
  const agentProfiles = useAIGroupsStore((s) => s.agentProfiles);
  const loadingProfile = useAIGroupsStore((s) => s.loadingProfile);
  const addAgent = useAIGroupsStore((s) => s.addAgent);
  const removeAgent = useAIGroupsStore((s) => s.removeAgent);
  const startEditAgent = useAIGroupsStore((s) => s.startEditAgent);
  const saveEditAgent = useAIGroupsStore((s) => s.saveEditAgent);
  const saveGroupSettings = useAIGroupsStore((s) => s.saveGroupSettings);
  const fetchAgentProfile = useAIGroupsStore((s) => s.fetchAgentProfile);

  const renderCapabilityProfile = (agentId: string) => {
    const profile = agentProfiles[agentId];
    if (!profile) {
      return (
        <button onClick={() => fetchAgentProfile(agentId)}
          className="w-full text-[11px] px-2 py-1.5 bg-primary/10 text-primary rounded hover:bg-primary/20 transition-colors">
          {loadingProfile === agentId ? '加载中...' : '查看能力档案'}
        </button>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground">综合排名</span>
          <div className="flex items-center gap-1">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs lg:text-sm font-bold text-amber-400">{profile.overall_rank.toFixed(1)}</span>
          </div>
        </div>
        {profile.capabilities.map((cap, i) => (
          <div key={i} className="space-y-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">{cap.capability}</span>
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-medium">{cap.avg_score.toFixed(1)}</span>
                <TrendIcon trend={cap.trend} />
              </div>
            </div>
            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(cap.avg_score * 10, 100)}%`,
                  background: cap.avg_score >= 8 ? '#22c55e' : cap.avg_score >= 6 ? '#3b82f6' : cap.avg_score >= 4 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        ))}
        {profile.strengths.length > 0 && (
          <div>
            <span className="text-[10px] text-emerald-400 font-medium">💪 优势</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {profile.strengths.map((s, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-emerald-500/15 text-emerald-400 rounded">{s}</span>
              ))}
            </div>
          </div>
        )}
        {profile.weaknesses.length > 0 && (
          <div>
            <span className="text-[10px] text-orange-400 font-medium">⚠️ 待提升</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {profile.weaknesses.map((w, i) => (
                <span key={i} className="text-[10px] px-1.5 py-0.5 bg-orange-500/15 text-orange-400 rounded">{w}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (!selectedGroup) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Bot className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-xs">{t("aiGroups.selectGroup")}</p>
      </div>
    );
  }

  return (
    <>
      {/* Group info */}
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-muted-foreground">{t("aiGroups.groupInfo")}</span>
          <button onClick={() => {
            setEditGroupName(selectedGroup.name);
            setEditGroupDesc(selectedGroup.description || '');
            setShowGroupSettings(!showGroupSettings);
          }} className="p-0.5 rounded hover:bg-muted"><Edit3 className="w-3 h-3 text-muted-foreground" /></button>
        </div>
        {showGroupSettings ? (
          <div className="space-y-2">
            <input value={editGroupName} onChange={e => setEditGroupName(e.target.value)} placeholder={t("aiGroups.groupNamePlaceholder")}
              className="w-full px-2.5 py-1.5 bg-muted border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <textarea value={editGroupDesc} onChange={e => setEditGroupDesc(e.target.value)} placeholder={t("aiGroups.description")}
              rows={2} className="w-full px-2.5 py-1.5 bg-muted border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none" />
            <div className="flex gap-1.5">
              <button onClick={saveGroupSettings} className="flex-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90">{t("aiGroups.save")}</button>
              <button onClick={() => setShowGroupSettings(false)} className="px-2.5 py-1.5 bg-muted border border-border rounded text-xs hover:bg-accent">{t("aiGroups.cancel")}</button>
            </div>
          </div>
        ) : (
          <div>
            <p className="text-xs lg:text-sm font-medium">{selectedGroup.name}</p>
            {selectedGroup.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedGroup.description}</p>}
          </div>
        )}
      </div>

      {/* Agents list */}
      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted-foreground">{t("aiGroups.participatingAgents")} ({selectedGroup.agents?.length || 0})</span>
          <button onClick={() => setShowAddAgent(!showAddAgent)}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline">
            <UserPlus className="w-3 h-3" /> {t("aiGroups.add")}
          </button>
        </div>

        {/* Add agent form */}
        {showAddAgent && (
          <div className="mb-3 p-2.5 rounded-lg bg-muted/50 space-y-2">
            <input value={newAgent.name} onChange={e => setNewAgent({ ...newAgent, name: e.target.value })} placeholder={t("aiGroups.agentNamePlaceholder")}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <select value={newAgent.role} onChange={e => setNewAgent({ ...newAgent, role: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs focus:outline-none">
              <option value="advisor">{t("aiGroups.roleAdvisor")}</option>
              <option value="executor">{t("aiGroups.roleExecutor")}</option>
              <option value="verifier">{t("aiGroups.roleVerifier")}</option>
            </select>
            <select value={newAgent.model} onChange={e => setNewAgent({ ...newAgent, model: e.target.value })}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs focus:outline-none">
              <option value="claude-opus">Claude Opus</option>
              <option value="claude-sonnet">Claude Sonnet</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o Mini</option>
              <option value="deepseek-r1">DeepSeek R1</option>
            </select>
            <div className="flex gap-1.5">
              <button onClick={addAgent} className="flex-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90">{t("aiGroups.add")}</button>
              <button onClick={() => setShowAddAgent(false)} className="px-2.5 py-1.5 bg-background border border-border rounded text-xs hover:bg-accent">{t("aiGroups.cancel")}</button>
            </div>
          </div>
        )}

        {/* Agent items */}
        <div className="space-y-1.5">
          {(selectedGroup.agents || []).map((agent, i) => {
            const Icon = ROLE_ICONS[agent.role] || Bot;
            const isExpanded = expandedAgent === agent.agent_id;
            const isEditing = editingAgent === agent.agent_id;
            return (
              <div key={agent.agent_id} className="rounded-lg border border-border overflow-hidden">
                <div className="flex items-center gap-2 p-2.5 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent.agent_id)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getAgentAvatarColor(i)}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs lg:text-sm font-medium truncate">{agent.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BG_COLORS[agent.role]} ${ROLE_COLORS[agent.role]}`}>
                        {agent.role}
                      </span>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">{agent.model}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-muted-foreground'}`} />
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-border p-2.5 bg-muted/30">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">{t("aiGroups.name")}</label>
                          <input value={editAgentData.name} onChange={e => setEditAgentData({ ...editAgentData, name: e.target.value })}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none" />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">{t("aiGroups.role")}</label>
                          <select value={editAgentData.role} onChange={e => setEditAgentData({ ...editAgentData, role: e.target.value })}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none">
                            <option value="advisor">Advisor</option>
                            <option value="executor">Executor</option>
                            <option value="verifier">Verifier</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">{t("aiGroups.model")}</label>
                          <select value={editAgentData.model} onChange={e => setEditAgentData({ ...editAgentData, model: e.target.value })}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none">
                            <option value="claude-opus">Claude Opus</option>
                            <option value="claude-sonnet">Claude Sonnet</option>
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                            <option value="deepseek-r1">DeepSeek R1</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground mb-0.5 block">Temperature: {editAgentData.temperature}</label>
                          <input type="range" min="0" max="2" step="0.1" value={editAgentData.temperature}
                            onChange={e => setEditAgentData({ ...editAgentData, temperature: parseFloat(e.target.value) })}
                            className="w-full" />
                        </div>
                        <div className="flex gap-1.5">
                          <button onClick={() => saveEditAgent(agent.agent_id)}
                            className="flex-1 px-2 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90">{t("aiGroups.save")}</button>
                          <button onClick={() => useAIGroupsStore.getState().setEditingAgent(null)}
                            className="px-2 py-1.5 bg-background border border-border rounded text-xs hover:bg-accent">{t("aiGroups.cancel")}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div><span className="text-muted-foreground">{t("aiGroups.model")}:</span> <span className="font-medium">{agent.model}</span></div>
                          <div><span className="text-muted-foreground">{t("aiGroups.status")}:</span> <span className={`font-medium ${agent.status === 'online' ? 'text-emerald-500' : 'text-muted-foreground'}`}>{agent.status || 'offline'}</span></div>
                          <div><span className="text-muted-foreground">{t("aiGroups.temperature")}:</span> <span className="font-medium">{agent.temperature || 0.7}</span></div>
                          <div><span className="text-muted-foreground">ID:</span> <span className="font-medium truncate">{agent.agent_id}</span></div>
                        </div>
                        {/* Capability Profile Section */}
                        <div className="pt-2 border-t border-border/50">
                          <div className="flex items-center gap-1.5 mb-2">
                            <TrendingUp className="w-3 h-3 text-primary" />
                            <span className="text-[11px] font-medium">能力档案</span>
                          </div>
                          {renderCapabilityProfile(agent.agent_id)}
                        </div>

                        <div className="flex gap-1.5 pt-1">
                          <button onClick={() => startEditAgent(agent)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-muted border border-border rounded text-xs hover:bg-accent transition-colors flex-1 justify-center">
                            <Edit3 className="w-3 h-3" /> {t("aiGroups.edit")}
                          </button>
                          <button onClick={() => removeAgent(agent.agent_id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-red-400 bg-red-500/10 rounded text-xs hover:bg-red-500/20 transition-colors">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {(selectedGroup.agents || []).length === 0 && (
          <div className="text-center py-3 lg:py-6 text-muted-foreground">
            <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="text-xs">{t("aiGroups.noAgents")}</p>
            <p className="text-[11px] mt-0.5">{t("aiGroups.addAgentHint")}</p>
          </div>
        )}
      </div>
    </>
  );
}

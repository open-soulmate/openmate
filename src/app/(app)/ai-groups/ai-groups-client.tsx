'use client';
import { useState, useEffect } from 'react';
import { Users, Plus, Play, CheckCircle, XCircle, Trash2, ChevronDown, ChevronRight, Bot, Shield, Zap, User } from 'lucide-react';

const API_BASE = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:8090` : '';

interface AgentRole {
  agent_id: string;
  name: string;
  role: string;
  model: string;
  status: string;
}

interface SubTask {
  id: string;
  goal: string;
  status: string;
  assigned_agent_id: string;
  result: string;
  quality_score: number;
  iteration: number;
}

interface AIGroup {
  id: string;
  name: string;
  description: string;
  status: string;
  agents: AgentRole[];
  tasks: any[];
  task_count: number;
}

const ROLE_ICONS: Record<string, any> = { advisor: Shield, executor: Zap, verifier: Bot, human: User };
const ROLE_COLORS: Record<string, string> = { advisor: 'text-yellow-400', executor: 'text-blue-400', verifier: 'text-green-400', human: 'text-purple-400' };
const STATUS_COLORS: Record<string, string> = {
  planning: 'bg-yellow-500/20 text-yellow-400', executing: 'bg-blue-500/20 text-blue-400',
  verifying: 'bg-green-500/20 text-green-400', reviewing: 'bg-purple-500/20 text-purple-400',
  completed: 'bg-emerald-500/20 text-emerald-400', failed: 'bg-red-500/20 text-red-400', pending: 'bg-zinc-500/20 text-zinc-400'
};

export default function AIGroupsPage() {
  const [groups, setGroups] = useState<AIGroup[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);
  const [taskGoal, setTaskGoal] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ai-groups`);
      const data = await res.json();
      setGroups(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchGroups(); }, []);

  const createGroup = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/ai-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc, agents: [
          { agent_id: 'advisor-1', name: 'Claude Opus', role: 'advisor', model: 'claude-opus' },
          { agent_id: 'executor-1', name: 'Claude Sonnet', role: 'executor', model: 'claude-sonnet' },
          { agent_id: 'verifier-1', name: 'GPT-4o', role: 'verifier', model: 'gpt-4o' },
        ]})
      });
      setNewName(''); setNewDesc(''); setShowCreate(false);
      fetchGroups();
    } finally { setLoading(false); }
  };

  const submitTask = async (groupId: string) => {
    if (!taskGoal.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/api/ai-groups/${groupId}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goal: taskGoal })
      });
      setTaskGoal('');
      fetchGroups();
    } finally { setLoading(false); }
  };

  const deleteGroup = async (id: string) => {
    await fetch(`${API_BASE}/api/ai-groups/${id}`, { method: 'DELETE' });
    fetchGroups();
  };

  const fetchGroupDetail = async (id: string) => {
    const res = await fetch(`${API_BASE}/api/ai-groups/${id}`);
    const data = await res.json();
    setGroups(prev => prev.map(g => g.id === id ? { ...g, ...data } : g));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-bold">AI群管理</h1>
          <p className="text-sm text-muted-foreground mt-1">多Agent协作 — advisor规划 → executor执行 → verifier验证</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
          <Plus className="w-4 h-4" /> 创建AI群
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="p-6 border-b border-border bg-card/50">
          <div className="max-w-xl space-y-3">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="AI群名称" className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="描述（可选）" className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
            <p className="text-xs text-muted-foreground">默认创建：advisor(Claude Opus) + executor(Claude Sonnet) + verifier(GPT-4o)</p>
            <div className="flex gap-2">
              <button onClick={createGroup} disabled={loading} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">{loading ? '创建中...' : '创建'}</button>
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 bg-muted border border-border rounded-lg text-sm hover:bg-accent">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Groups list */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {groups.length === 0 && (
          <div className="text-center py-20 text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>还没有AI群</p>
            <p className="text-sm mt-1">点击"创建AI群"开始多Agent协作</p>
          </div>
        )}

        {groups.map(group => (
          <div key={group.id} className="border border-border rounded-xl bg-card overflow-hidden">
            {/* Group header */}
            <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => {
              const next = expandedGroup === group.id ? null : group.id;
              setExpandedGroup(next);
              if (next) fetchGroupDetail(group.id);
            }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold">{group.name}</h3>
                  <p className="text-xs text-muted-foreground">{group.description || '无描述'} · {group.task_count || 0} 个任务</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-2">
                  {(group.agents || []).slice(0, 4).map((a, i) => {
                    const Icon = ROLE_ICONS[a.role] || Bot;
                    return <div key={i} className={`w-7 h-7 rounded-full bg-muted border-2 border-card flex items-center justify-center ${ROLE_COLORS[a.role]}`}><Icon className="w-3.5 h-3.5" /></div>;
                  })}
                </div>
                {expandedGroup === group.id ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
              </div>
            </div>

            {/* Group detail */}
            {expandedGroup === group.id && (
              <div className="border-t border-border">
                {/* Agents */}
                <div className="p-4 bg-muted/30">
                  <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">Agent角色</h4>
                  <div className="flex gap-3 flex-wrap">
                    {(group.agents || []).map((a, i) => {
                      const Icon = ROLE_ICONS[a.role] || Bot;
                      return (
                        <div key={i} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg">
                          <Icon className={`w-4 h-4 ${ROLE_COLORS[a.role]}`} />
                          <div>
                            <p className="text-sm font-medium">{a.name}</p>
                            <p className="text-[10px] text-muted-foreground">{a.role} · {a.model}</p>
                          </div>
                          <span className={`w-2 h-2 rounded-full ${a.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Submit task */}
                <div className="p-4 border-t border-border">
                  <div className="flex gap-2">
                    <input value={taskGoal} onChange={e => setTaskGoal(e.target.value)} placeholder="输入任务目标，自动分解为子任务..." className="flex-1 px-3 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" onKeyDown={e => e.key === 'Enter' && submitTask(group.id)} />
                    <button onClick={() => submitTask(group.id)} disabled={loading || !taskGoal.trim()} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 disabled:opacity-50">
                      <Play className="w-3.5 h-3.5" /> 提交任务
                    </button>
                  </div>
                </div>

                {/* Tasks */}
                <div className="p-4 border-t border-border space-y-2">
                  <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wider">任务列表</h4>
                  {(group.tasks || []).length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">暂无任务</p>}
                  {(group.tasks || []).map(task => (
                    <div key={task.id} className="border border-border rounded-lg overflow-hidden">
                      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}>
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${STATUS_COLORS[task.status] || ''}`}>{task.status}</span>
                          <span className="text-sm truncate">{task.goal}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {task.quality_score > 0 && <span>{task.quality_score}/10</span>}
                          {task.subtasks && <span>{task.subtasks.length} 子任务</span>}
                        </div>
                      </div>
                      {expandedTask === task.id && task.subtasks && (
                        <div className="border-t border-border p-3 space-y-2 bg-muted/20">
                          {task.subtasks.map((st: SubTask) => {
                            const Icon = ROLE_ICONS[st.goal.includes('规划') ? 'advisor' : st.goal.includes('验证') ? 'verifier' : 'executor'] || Bot;
                            return (
                              <div key={st.id} className="flex items-center gap-2 px-3 py-2 bg-card border border-border rounded-lg text-sm">
                                <Icon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 truncate">{st.goal}</span>
                                <span className={`px-2 py-0.5 rounded text-[10px] ${STATUS_COLORS[st.status] || ''}`}>{st.status}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Delete */}
                <div className="p-4 border-t border-border flex justify-end">
                  <button onClick={() => deleteGroup(group.id)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                    <Trash2 className="w-3.5 h-3.5" /> 删除群
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

'use client';
import { useTranslation } from 'react-i18next';
import { useState, useMemo } from 'react';
import { use } from 'react';
import Link from 'next/link';
import {
  useAppStore,
  type Team,
  type TeamMember,
  type TeamTask,
  type TaskStatus,
  type TaskPriority,
  type AgentNode,
} from '@/stores/app-store';
import { Dialog } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  Users, ArrowLeft, Plus, Trash2, Bot, Server, Plug, Crown,
} from 'lucide-react';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  soma: Server, ai: Bot, mcp: Plug,
};

const AGENT_COLORS: Record<string, string> = {
  soma: 'text-emerald-400', ai: 'text-violet-400', mcp: 'text-amber-400',
};

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-muted text-muted-foreground',
  in_progress: 'bg-blue-500/10 text-blue-500',
  done: 'bg-green-500/10 text-green-500',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '待办', in_progress: '进行中', done: '已完成',
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  low: 'text-muted-foreground',
  medium: 'text-blue-500',
  high: 'text-amber-500',
  urgent: 'text-destructive',
};

// ─── Add Task Dialog ─────────────────────────────────────────────────────

function AddTaskDialog({
  open, onClose, onSave, members,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (task: TeamTask) => void;
  members: TeamMember[];
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState('');

  function handleSubmit() {
    if (!title.trim()) return;
    const assignee = members.find(m => m.id === assigneeId);
    onSave({
      id: uid(),
      title: title.trim(),
      description: description.trim() || undefined,
      status: 'todo',
      priority,
      assigneeId: assignee?.id,
      assigneeName: assignee?.name,
      tags: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setTitle(''); setDescription(''); setPriority('medium'); setAssigneeId('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="创建任务" className="max-w-lg"
      footer={<>
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">取消</button>
        <button onClick={handleSubmit} disabled={!title.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">创建</button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">任务标题</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="任务描述..."
            className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">详细描述</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder="可选..."
            className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">优先级</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none">
              <option value="low">低</option><option value="medium">中</option>
              <option value="high">高</option><option value="urgent">紧急</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">指派给</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none">
              <option value="">未指派</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Add Member Dialog ───────────────────────────────────────────────────

function AddMemberDialog({
  open, onClose, onSave, agents, existingIds,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (member: TeamMember) => void;
  agents: AgentNode[];
  existingIds: string[];
}) {
  const available = agents.filter(a => !existingIds.includes(a.id));
  const [selected, setSelected] = useState('');

  function handleSubmit() {
    if (!selected) return;
    const agent = agents.find(a => a.id === selected);
    if (!agent) return;
    onSave({
      id: uid(),
      agentId: agent.id,
      name: agent.name,
      type: agent.type,
      role: 'member',
      status: 'online',
      capabilities: [],
      joinedAt: Date.now(),
    });
    setSelected('');
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="添加成员" className="max-w-md"
      footer={<>
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">取消</button>
        <button onClick={handleSubmit} disabled={!selected}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">添加</button>
      </>
    }>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">选择 Agent</label>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">所有 Agent 已在团队中</p>
        ) : (
          <div className="space-y-1 max-h-48 overflow-y-auto rounded-lg border p-2">
            {available.map(a => {
              const Icon = AGENT_ICONS[a.type] ?? Bot;
              return (
                <button key={a.id} onClick={() => setSelected(a.id)}
                  className={cn('flex items-center gap-3 w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                    selected === a.id ? 'bg-accent border' : 'hover:bg-accent/50 border border-transparent'
                  )}>
                  <Icon size={14} className={cn(AGENT_COLORS[a.type], 'shrink-0')} />
                  <span className="flex-1 truncate">{a.name}</span>
                  {selected === a.id && <Badge variant="default">已选</Badge>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Dialog>
  );
}

// ─── Task Board ──────────────────────────────────────────────────────────

function TaskBoard({
  tasks, members, onMove, onDelete,
}: {
  tasks: TeamTask[];
  members: TeamMember[];
  onMove: (taskId: string, status: TaskStatus) => void;
  onDelete: (taskId: string) => void;
}) {
  const columns: { status: TaskStatus; label: string }[] = [
    { status: 'todo', label: '待办' },
    { status: 'in_progress', label: '进行中' },
    { status: 'done', label: '已完成' },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {columns.map(col => {
        const colTasks = tasks.filter(t => t.status === col.status);
        return (
          <div key={col.status} className="rounded-lg border bg-card/50">
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="text-xs font-medium">{col.label}</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{colTasks.length}</span>
            </div>
            <div className="p-2 space-y-2 min-h-[100px]">
              {colTasks.map(task => (
                <div key={task.id} className="p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors group">
                  <div className="flex items-start justify-between mb-1">
                    <h4 className="text-sm font-medium flex-1">{task.title}</h4>
                    <button onClick={() => onDelete(task.id)}
                      className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-all">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {task.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-medium', PRIORITY_COLORS[task.priority])}>
                        {task.priority === 'urgent' ? '🔴' : task.priority === 'high' ? '🟠' : task.priority === 'medium' ? '🔵' : '⚪'}
                      </span>
                      {task.assigneeName && (
                        <span className="text-[10px] text-muted-foreground">{task.assigneeName}</span>
                      )}
                    </div>
                    <div className="flex gap-0.5">
                      {columns.filter(c => c.status !== col.status).map(c => (
                        <button key={c.status} onClick={() => onMove(task.id, c.status)}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-muted hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                          title={`移至${c.label}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">空</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────

export function TeamDetailClient({ paramsPromise }: { paramsPromise: Promise<{ id: string }> }) {
  const { id } = use(paramsPromise);
  const teams = useAppStore(s => s.teams);
  const updateTeam = useAppStore(s => s.updateTeam);
  const addTeamMember = useAppStore(s => s.addTeamMember);
  const removeTeamMember = useAppStore(s => s.removeTeamMember);
  const addTeamTask = useAppStore(s => s.addTeamTask);
  const updateTeamTask = useAppStore(s => s.updateTeamTask);
  const moveTeamTask = useAppStore(s => s.moveTeamTask);
  const deleteTeamTask = useAppStore(s => s.deleteTeamTask);
  const addTeamActivity = useAppStore(s => s.addTeamActivity);
  const agents = useAppStore(s => s.agentNodes);

  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [activeTab, setActiveTab] = useState<'tasks' | 'members' | 'activity'>('tasks');
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<TeamMember | null>(null);

  const team = useMemo(() => teams.find(t => t.id === id), [teams, id]);

  if (!team) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <Users className="w-12 h-12 text-muted-foreground opacity-50" />
        <p className="text-muted-foreground">团队未找到</p>
        <Link href="/team" className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">返回团队列表</Link>
      </div>
    );
  }

  // team is guaranteed non-null after the guard above
  const t = team!;
  const onlineCount = t.members.filter(m => m.status === 'online').length;
  const leader = t.members.find(m => m.role === 'leader');
  const pendingTasks = t.tasks.filter(tk => tk.status !== 'done').length;
  const doneTasks = t.tasks.filter(tk => tk.status === 'done').length;

  function handleAddTask(task: TeamTask) {
    addTeamTask(t.id, task);
    addTeamActivity(t.id, {
      id: uid(), type: 'task_created', actorId: 'user', actorName: '用户',
      description: `创建了任务「${task.title}」`, taskId: task.id, timestamp: Date.now(),
    });
  }

  function handleMoveTask(taskId: string, status: TaskStatus) {
    moveTeamTask(t.id, taskId, status);
    const task = t.tasks.find(t => t.id === taskId);
    if (task && status === 'done') {
      addTeamActivity(t.id, {
        id: uid(), type: 'task_completed', actorId: task.assigneeId || '', actorName: task.assigneeName || '系统',
        description: `完成了任务「${task.title}」`, taskId, timestamp: Date.now(),
      });
    }
  }

  function handleAddMember(member: TeamMember) {
    addTeamMember(t.id, member);
    addTeamActivity(t.id, {
      id: uid(), type: 'member_joined', actorId: member.agentId, actorName: member.name,
      description: `${member.name} 加入了团队`, timestamp: Date.now(),
    });
  }

  function handleRemoveMember() {
    if (!deleteMemberTarget) return;
    removeTeamMember(t.id, deleteMemberTarget.id);
    addTeamActivity(t.id, {
      id: uid(), type: 'member_left', actorId: deleteMemberTarget.agentId, actorName: deleteMemberTarget.name,
      description: `${deleteMemberTarget.name} 离开了团队`, timestamp: Date.now(),
    });
    setDeleteMemberTarget(null);
  }

  const tabs = [
    { key: 'tasks' as const, label: '任务看板', icon: CheckSquare, count: t.tasks.length },
    { key: 'members' as const, label: '团队成员', icon: Users, count: t.members.length },
    { key: 'activity' as const, label: '动态', icon: Activity, count: t.activities.length },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-6 py-4">
        <div className="flex items-center gap-3 mb-3">
          <Link href="/team" className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users size={18} />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{t.name}</h1>
            {t.description && <p className="text-sm text-muted-foreground">{t.description}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 ml-14">
          <div className="flex items-center gap-2 text-sm">
            <Users size={14} className="text-muted-foreground" />
            <span className="font-medium">{t.members.length}</span>
            <span className="text-xs text-muted-foreground">成员</span>
            <span className="text-xs text-emerald-400">{onlineCount}在线</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare size={14} className="text-muted-foreground" />
            <span className="font-medium">{pendingTasks}</span>
            <span className="text-xs text-muted-foreground">待办</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Circle size={14} className="text-green-500 fill-green-500" />
            <span className="font-medium">{doneTasks}</span>
            <span className="text-xs text-muted-foreground">已完成</span>
          </div>
          {leader && (
            <div className="flex items-center gap-2 text-sm">
              <Crown size={14} className="text-amber-500" />
              <span className="text-xs text-muted-foreground">Leader:</span>
              <span className="font-medium text-xs">{leader.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b px-6">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors',
                activeTab === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}>
              <Icon size={14} />
              {tab.label}
              <span className="text-[10px] px-1 rounded bg-muted">{tab.count}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">任务看板</h2>
              <button onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                <Plus size={14} /> 创建任务
              </button>
            </div>
            <TaskBoard
              tasks={t.tasks}
              members={t.members}
              onMove={handleMoveTask}
              onDelete={(taskId) => deleteTeamTask(t.id, taskId)}
            />
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">团队成员</h2>
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                <UserPlus size={14} /> 添加成员
              </button>
            </div>
            <div className="space-y-2">
              {t.members.map(member => {
                const Icon = AGENT_ICONS[member.type] ?? Bot;
                return (
                  <div key={member.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:border-primary/30 transition-colors group">
                    <div className={cn('flex h-9 w-9 items-center justify-center rounded-full border bg-muted',
                      member.status === 'online' ? 'ring-2 ring-emerald-500/50' :
                      member.status === 'busy' ? 'ring-2 ring-amber-500/50' : ''
                    )}>
                      <Icon size={16} className={AGENT_COLORS[member.type]} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{member.name}</span>
                        {member.role === 'leader' && (
                          <Badge variant="warning"><Crown size={10} className="mr-1" />Leader</Badge>
                        )}
                        <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full',
                          member.status === 'online' ? 'bg-emerald-500/10 text-emerald-500' :
                          member.status === 'busy' ? 'bg-amber-500/10 text-amber-500' :
                          'bg-muted text-muted-foreground'
                        )}>
                          {member.status === 'online' ? '在线' : member.status === 'busy' ? '忙碌' : '离线'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">{member.type}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">加入于 {formatTime(member.joinedAt)}</span>
                      </div>
                    </div>
                    {member.role !== 'leader' && (
                      <button onClick={() => setDeleteMemberTarget(member)}
                        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title="移除">
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && (
          <div>
            <h2 className="text-sm font-medium mb-4">团队动态</h2>
            {t.activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">暂无动态</p>
              </div>
            ) : (
              <div className="space-y-1">
                {[...t.activities].reverse().map(activity => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="mt-1 w-2 h-2 rounded-full bg-primary/50 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{formatTime(activity.timestamp)}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground capitalize">{activity.type.replace('_', ' ')}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      <AddTaskDialog open={showAddTask} onClose={() => setShowAddTask(false)} onSave={handleAddTask} members={t.members} />
      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} onSave={handleAddMember}
        agents={agents} existingIds={t.members.map(m => m.agentId)} />

      {/* Delete Member Confirmation */}
      <Dialog open={!!deleteMemberTarget} onClose={() => setDeleteMemberTarget(null)}
        title="移除成员" description={`确定要将「${deleteMemberTarget?.name}」移出团队吗？`}
        footer={<>
          <button onClick={() => setDeleteMemberTarget(null)}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">取消</button>
          <button onClick={handleRemoveMember}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/90">移除</button>
        </>
      }>
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">该成员将从团队中移除，但不会被删除。</p>
        </div>
      </Dialog>
    </div>
  );
}

'use client';
import { useState, useMemo } from 'react';
import { use } from 'react';
import Link from 'next/link';
import { useTranslation } from "react-i18next";
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
  Activity, CheckSquare, Clock, Circle, ChevronRight, UserPlus,
} from 'lucide-react';

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return t("teamDetail.justNow") || "Just now";
  if (diff < 3_600_000) return t("teamDetail.minutesAgo", { count: Math.floor(diff / 60_000) }) || `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return t("teamDetail.hoursAgo", { count: Math.floor(diff / 3_600_000) }) || `${Math.floor(diff / 3_600_000)}h ago`;
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
  const { t } = useTranslation();
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
    <Dialog open={open} onClose={onClose} title={t("teamDetail.createTask") || "Create Task"} className="max-w-lg"
      footer={<>
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">{t("teamDetail.cancel") || "Cancel"}</button>
        <button onClick={handleSubmit} disabled={!title.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("teamDetail.create") || "Create"}</button>
      </>
    }>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("teamDetail.taskTitle") || "Task Title"}</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("teamDetail.taskTitlePlaceholder") || "Task description..."}
            className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("teamDetail.detailedDescription") || "Detailed Description"}</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} placeholder={t("teamDetail.optionalPlaceholder") || "Optional..."}
            className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("teamDetail.priority") || "Priority"}</label>
            <select value={priority} onChange={e => setPriority(e.target.value as TaskPriority)}
              className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none">
              <option value="low">{t("teamDetail.low") || "Low"}</option><option value="medium">{t("teamDetail.medium") || "Medium"}</option>
              <option value="high">{t("teamDetail.high") || "High"}</option><option value="urgent">{t("teamDetail.urgent") || "Urgent"}</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("teamDetail.assignTo") || "Assign To"}</label>
            <select value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
              className="w-full rounded-md border bg-muted/50 px-3 py-2 text-sm outline-none">
              <option value="">{t("teamDetail.unassigned") || "Unassigned"}</option>
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
  const { t } = useTranslation();
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
    <Dialog open={open} onClose={onClose} title={t("teamDetail.addMember") || "Add Member"} className="max-w-md"
      footer={<>
        <button onClick={onClose} className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">{t("teamDetail.cancel") || "Cancel"}</button>
        <button onClick={handleSubmit} disabled={!selected}
          className="rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50">{t("teamDetail.add") || "Add"}</button>
      </>
    }>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("teamDetail.selectAgent") || "Select Agent"}</label>
        {available.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">{t("teamDetail.allAgentsInTeam") || "All agents are already in the team"}</p>
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
                  {selected === a.id && <Badge variant="default">{t("teamDetail.selected") || "Selected"}</Badge>}
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
  const { t } = useTranslation();
  const columns: { status: TaskStatus; label: string }[] = [
    { status: 'todo', label: t("teamDetail.todo") || "To Do" },
    { status: 'in_progress', label: t("teamDetail.inProgress") || "In Progress" },
    { status: 'done', label: t("teamDetail.done") || "Done" },
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
                          title={t("teamDetail.moveTo", { label: c.label }) || `Move to ${c.label}`}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {colTasks.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6">{t("teamDetail.empty") || "Empty"}</p>
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
  const { t } = useTranslation();
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
        <p className="text-muted-foreground">{t("teamDetail.teamNotFound") || "Team not found"}</p>
        <Link href="/team" className="px-4 py-2 rounded-lg border text-sm hover:bg-muted">{t("teamDetail.backToTeamList") || "Back to Team List"}</Link>
      </div>
    );
  }

  // team is guaranteed non-null after the guard above
  const cur = team!;
  const onlineCount = cur.members.filter(m => m.status === 'online').length;
  const leader = cur.members.find(m => m.role === 'leader');
  const pendingTasks = cur.tasks.filter(tk => tk.status !== 'done').length;
  const doneTasks = cur.tasks.filter(tk => tk.status === 'done').length;

  function handleAddTask(task: TeamTask) {
    addTeamTask(cur.id, task);
    addTeamActivity(cur.id, {
      id: uid(), type: 'task_created', actorId: 'user', actorName: t("teamDetail.user") || "User",
      description: t("teamDetail.taskCreatedDesc", { title: task.title }) || `Created task "${task.title}"`, taskId: task.id, timestamp: Date.now(),
    });
  }

  function handleMoveTask(taskId: string, status: TaskStatus) {
    moveTeamTask(cur.id, taskId, status);
    const task = cur.tasks.find(tk => tk.id === taskId);
    if (task && status === 'done') {
      addTeamActivity(cur.id, {
        id: uid(), type: 'task_completed', actorId: task.assigneeId || '', actorName: task.assigneeName || (t("teamDetail.system") || "System"),
        description: t("teamDetail.taskCompletedDesc", { title: task.title }) || `Completed task "${task.title}"`, taskId, timestamp: Date.now(),
      });
    }
  }

  function handleAddMember(member: TeamMember) {
    addTeamMember(cur.id, member);
    addTeamActivity(cur.id, {
      id: uid(), type: 'member_joined', actorId: member.agentId, actorName: member.name,
      description: t("teamDetail.memberJoinedDesc", { name: member.name }) || `${member.name} joined the team`, timestamp: Date.now(),
    });
  }

  function handleRemoveMember() {
    if (!deleteMemberTarget) return;
    removeTeamMember(cur.id, deleteMemberTarget.id);
    addTeamActivity(cur.id, {
      id: uid(), type: 'member_left', actorId: deleteMemberTarget.agentId, actorName: deleteMemberTarget.name,
      description: t("teamDetail.memberLeftDesc", { name: deleteMemberTarget.name }) || `${deleteMemberTarget.name} left the team`, timestamp: Date.now(),
    });
    setDeleteMemberTarget(null);
  }

  const tabs = [
    { key: 'tasks' as const, label: t("teamDetail.taskBoard") || "Task Board", icon: CheckSquare, count: cur.tasks.length },
    { key: 'members' as const, label: t("teamDetail.teamMembers") || "Team Members", icon: Users, count: cur.members.length },
    { key: 'activity' as const, label: t("teamDetail.activity") || "Activity", icon: Activity, count: cur.activities.length },
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
            <h1 className="text-xl font-bold">{cur.name}</h1>
            {cur.description && <p className="text-sm text-muted-foreground">{cur.description}</p>}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 ml-14">
          <div className="flex items-center gap-2 text-sm">
            <Users size={14} className="text-muted-foreground" />
            <span className="font-medium">{cur.members.length}</span>
            <span className="text-xs text-muted-foreground">{t("teamDetail.members") || "Members"}</span>
            <span className="text-xs text-emerald-400">{t("teamDetail.onlineWithCount", { count: onlineCount }) || `${onlineCount} online`}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <CheckSquare size={14} className="text-muted-foreground" />
            <span className="font-medium">{pendingTasks}</span>
            <span className="text-xs text-muted-foreground">{t("teamDetail.todo") || "To Do"}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Circle size={14} className="text-green-500 fill-green-500" />
            <span className="font-medium">{doneTasks}</span>
            <span className="text-xs text-muted-foreground">{t("teamDetail.done") || "Done"}</span>
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
              <h2 className="text-sm font-medium">{t("teamDetail.taskBoard") || "Task Board"}</h2>
              <button onClick={() => setShowAddTask(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                <Plus size={14} /> {t("teamDetail.createTask") || "Create Task"}
              </button>
            </div>
            <TaskBoard
              tasks={cur.tasks}
              members={cur.members}
              onMove={handleMoveTask}
              onDelete={(taskId) => deleteTeamTask(cur.id, taskId)}
            />
          </div>
        )}

        {/* Members Tab */}
        {activeTab === 'members' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium">{t("teamDetail.teamMembers") || "Team Members"}</h2>
              <button onClick={() => setShowAddMember(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
                <UserPlus size={14} /> {t("teamDetail.addMember") || "Add Member"}
              </button>
            </div>
            <div className="space-y-2">
              {cur.members.map(member => {
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
                          {member.status === 'online' ? (t("teamDetail.online") || "Online") : member.status === 'busy' ? (t("teamDetail.busy") || "Busy") : (t("teamDetail.offline") || "Offline")}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground capitalize">{member.type}</span>
                        <span className="text-[10px] text-muted-foreground">·</span>
                        <span className="text-[10px] text-muted-foreground">{t("teamDetail.joinedAt", { time: formatTime(member.joinedAt, t) }) || `Joined ${formatTime(member.joinedAt, t)}`}</span>
                      </div>
                    </div>
                    {member.role !== 'leader' && (
                      <button onClick={() => setDeleteMemberTarget(member)}
                        className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all"
                        title={t("teamDetail.remove") || "Remove"}>
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
            <h2 className="text-sm font-medium mb-4">{t("teamDetail.teamActivity") || "Team Activity"}</h2>
            {cur.activities.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">{t("teamDetail.noActivity") || "No activity yet"}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {[...cur.activities].reverse().map(activity => (
                  <div key={activity.id} className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/30 transition-colors">
                    <div className="mt-1 w-2 h-2 rounded-full bg-primary/50 shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm">{activity.description}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">{formatTime(activity.timestamp, t)}</span>
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
      <AddTaskDialog open={showAddTask} onClose={() => setShowAddTask(false)} onSave={handleAddTask} members={cur.members} />
      <AddMemberDialog open={showAddMember} onClose={() => setShowAddMember(false)} onSave={handleAddMember}
        agents={agents} existingIds={cur.members.map(m => m.agentId)} />

      {/* Delete Member Confirmation */}
      <Dialog open={!!deleteMemberTarget} onClose={() => setDeleteMemberTarget(null)}
        title={t("teamDetail.removeMember") || "Remove Member"} description={t("teamDetail.confirmRemove", { name: deleteMemberTarget?.name }) || `Remove ${deleteMemberTarget?.name} from the team?`}
        footer={<>
          <button onClick={() => setDeleteMemberTarget(null)}
            className="rounded-md border px-3 py-1.5 text-xs text-muted-foreground hover:bg-accent">{t("teamDetail.cancel") || "Cancel"}</button>
          <button onClick={handleRemoveMember}
            className="rounded-md bg-destructive px-3 py-1.5 text-xs text-destructive-foreground hover:bg-destructive/90">{t("teamDetail.remove") || "Remove"}</button>
        </>
      }>
        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-sm text-muted-foreground">{t("teamDetail.removeMemberNote") || "This member will be removed from the team but will not be deleted."}</p>
        </div>
      </Dialog>
    </div>
  );
}

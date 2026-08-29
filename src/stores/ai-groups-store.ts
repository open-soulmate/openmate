import { create } from 'zustand';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

// ── Types ────────────────────────────────────────────────────────

export interface AgentRole {
  agent_id: string;
  name: string;
  role: string;
  model: string;
  status: string;
  temperature?: number;
  system_prompt?: string;
}

export interface GroupMessage {
  id: string;
  role: 'user' | 'agent';
  agent_id?: string;
  agent_name?: string;
  agent_role?: string;
  content: string;
  timestamp: Date;
  target?: string;
  intent?: 'claim' | 'suggest' | 'refer' | 'comment' | 'result' | 'score';
}

export interface AIGroup {
  id: string;
  name: string;
  description: string;
  status: string;
  agents: AgentRole[];
  tasks: any[];
  task_count: number;
}

export interface DiscussionMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  intent: 'claim' | 'suggest' | 'refer' | 'comment' | 'result' | 'score';
  content: string;
  metadata: Record<string, any>;
  round_num: number;
  created_at: string;
}

export interface AgentCapability {
  capability: string;
  avg_score: number;
  task_count: number;
  trend: 'up' | 'down' | 'stable';
}

export interface AgentProfile {
  agent_id: string;
  overall_rank: number;
  capabilities: AgentCapability[];
  strengths: string[];
  weaknesses: string[];
}

export interface ScoringEntry {
  scorer_agent_id: string;
  scorer_name: string;
  score: number;
  reason: string;
  capability: string;
}

export interface TaskReview {
  task_id: string;
  result: string;
  status: 'discussing' | 'assigned' | 'executing' | 'reviewing' | 'scored';
  round: number;
  assignments: { agent_id: string; subgoal: string }[];
  scores: ScoringEntry[];
  avg_score: number;
  discussion_messages: DiscussionMessage[];
}

// ── Helpers ──────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Store ────────────────────────────────────────────────────────

interface AIGroupsState {
  // Groups
  groups: AIGroup[];
  selectedGroup: AIGroup | null;
  messages: GroupMessage[];
  loading: boolean;
  sendingMessage: boolean;

  // Create group
  showCreate: boolean;
  newName: string;
  newDesc: string;

  // Edit group name inline
  editingGroupId: string | null;
  editingName: string;

  // @mention
  selectedTarget: string;

  // Agent management
  expandedAgent: string | null;
  showAddAgent: boolean;
  newAgent: { name: string; role: string; model: string };

  // Edit agent
  editingAgent: string | null;
  editAgentData: { name: string; model: string; temperature: number; role: string };

  // Group settings
  showGroupSettings: boolean;
  editGroupName: string;
  editGroupDesc: string;

  // Discussion flow
  activeTaskReview: TaskReview | null;
  discussionLoading: boolean;
  currentDiscussionId: string | null;

  // Agent capability profiles
  agentProfiles: Record<string, AgentProfile>;
  loadingProfile: string | null;

  // Scoring
  scoringTaskId: string | null;
  scoreValue: number;
  scoreReason: string;
  scoreCapability: string;
  scorerAgentId: string;

  // ── Actions ──────────────────────────────────────────────────────

  setGroups: (groups: AIGroup[]) => void;
  setSelectedGroup: (group: AIGroup | null) => void;
  setMessages: (msgs: GroupMessage[] | ((prev: GroupMessage[]) => GroupMessage[])) => void;
  setLoading: (loading: boolean) => void;
  setSendingMessage: (sending: boolean) => void;
  setShowCreate: (show: boolean) => void;
  setNewName: (name: string) => void;
  setNewDesc: (desc: string) => void;
  setEditingGroupId: (id: string | null) => void;
  setEditingName: (name: string) => void;
  setSelectedTarget: (target: string) => void;
  setExpandedAgent: (id: string | null) => void;
  setShowAddAgent: (show: boolean) => void;
  setNewAgent: (agent: { name: string; role: string; model: string }) => void;
  setEditingAgent: (id: string | null) => void;
  setEditAgentData: (data: { name: string; model: string; temperature: number; role: string }) => void;
  setShowGroupSettings: (show: boolean) => void;
  setEditGroupName: (name: string) => void;
  setEditGroupDesc: (desc: string) => void;
  setActiveTaskReview: (review: TaskReview | null) => void;
  setDiscussionLoading: (loading: boolean) => void;
  setCurrentDiscussionId: (id: string | null) => void;
  setAgentProfiles: (profiles: Record<string, AgentProfile> | ((prev: Record<string, AgentProfile>) => Record<string, AgentProfile>)) => void;
  setLoadingProfile: (id: string | null) => void;
  setScoringTaskId: (id: string | null) => void;
  setScoreValue: (value: number) => void;
  setScoreReason: (reason: string) => void;
  setScoreCapability: (capability: string) => void;
  setScorerAgentId: (id: string) => void;

  // API actions
  fetchGroups: () => Promise<void>;
  selectGroup: (group: AIGroup) => Promise<void>;
  createGroup: () => Promise<void>;
  deleteGroup: (id: string, e: React.MouseEvent) => Promise<void>;
  renameGroup: (id: string) => Promise<void>;
  saveGroupSettings: () => Promise<void>;
  addAgent: () => Promise<void>;
  removeAgent: (agentId: string) => Promise<void>;
  startEditAgent: (agent: AgentRole) => void;
  saveEditAgent: (agentId: string) => Promise<void>;
  fetchAgentProfile: (agentId: string) => Promise<void>;
}

export const useAIGroupsStore = create<AIGroupsState>((set, get) => ({
  // Initial state
  groups: [],
  selectedGroup: null,
  messages: [],
  loading: false,
  sendingMessage: false,
  showCreate: false,
  newName: '',
  newDesc: '',
  editingGroupId: null,
  editingName: '',
  selectedTarget: 'all',
  expandedAgent: null,
  showAddAgent: false,
  newAgent: { name: '', role: 'executor', model: 'claude-sonnet' },
  editingAgent: null,
  editAgentData: { name: '', model: '', temperature: 0.7, role: '' },
  showGroupSettings: false,
  editGroupName: '',
  editGroupDesc: '',
  activeTaskReview: null,
  discussionLoading: false,
  currentDiscussionId: null,
  agentProfiles: {},
  loadingProfile: null,
  scoringTaskId: null,
  scoreValue: 7,
  scoreReason: '',
  scoreCapability: '',
  scorerAgentId: '',

  // Simple setters
  setGroups: (groups) => set({ groups }),
  setSelectedGroup: (group) => set({ selectedGroup: group }),
  setMessages: (msgs) => set((s) => ({ messages: typeof msgs === 'function' ? msgs(s.messages) : msgs })),
  setLoading: (loading) => set({ loading }),
  setSendingMessage: (sending) => set({ sendingMessage: sending }),
  setShowCreate: (show) => set({ showCreate: show }),
  setNewName: (name) => set({ newName: name }),
  setNewDesc: (desc) => set({ newDesc: desc }),
  setEditingGroupId: (id) => set({ editingGroupId: id }),
  setEditingName: (name) => set({ editingName: name }),
  setSelectedTarget: (target) => set({ selectedTarget: target }),
  setExpandedAgent: (id) => set({ expandedAgent: id }),
  setShowAddAgent: (show) => set({ showAddAgent: show }),
  setNewAgent: (agent) => set({ newAgent: agent }),
  setEditingAgent: (id) => set({ editingAgent: id }),
  setEditAgentData: (data) => set({ editAgentData: data }),
  setShowGroupSettings: (show) => set({ showGroupSettings: show }),
  setEditGroupName: (name) => set({ editGroupName: name }),
  setEditGroupDesc: (desc) => set({ editGroupDesc: desc }),
  setActiveTaskReview: (review) => set({ activeTaskReview: review }),
  setDiscussionLoading: (loading) => set({ discussionLoading: loading }),
  setCurrentDiscussionId: (id) => set({ currentDiscussionId: id }),
  setAgentProfiles: (profiles) => set((s) => ({ agentProfiles: typeof profiles === 'function' ? profiles(s.agentProfiles) : profiles })),
  setLoadingProfile: (id) => set({ loadingProfile: id }),
  setScoringTaskId: (id) => set({ scoringTaskId: id }),
  setScoreValue: (value) => set({ scoreValue: value }),
  setScoreReason: (reason) => set({ scoreReason: reason }),
  setScoreCapability: (capability) => set({ scoreCapability: capability }),
  setScorerAgentId: (id) => set({ scorerAgentId: id }),

  // API actions
  fetchGroups: async () => {
    const { selectedGroup } = get();
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups`, { headers: authHeaders() });
      const data = await res.json();
      set({ groups: data });
      // Sync selectedGroup with latest data
      if (selectedGroup) {
        const updated = data.find((g: AIGroup) => g.id === selectedGroup.id);
        if (updated) set({ selectedGroup: updated });
      }
      if (!selectedGroup && data.length > 0) {
        get().selectGroup(data[0]);
      }
    } catch (e) { console.error(e); }
  },

  selectGroup: async (group: AIGroup) => {
    set({ selectedGroup: group, messages: [] });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${group.id}`, { headers: authHeaders() });
      const data = await res.json();
      const updated = { ...group, ...data };
      set((s) => ({
        selectedGroup: updated,
        groups: s.groups.map(g => g.id === group.id ? updated : g),
      }));
      // Generate demo messages from tasks
      const msgs: GroupMessage[] = [];
      (data.tasks || []).forEach((task: any, i: number) => {
        msgs.push({
          id: `task-${task.id || i}`, role: 'user', content: task.goal || '',
          timestamp: new Date(task.created_at || Date.now()), target: 'all',
        });
        (task.subtasks || []).forEach((st: any, j: number) => {
          const agent = (data.agents || []).find((a: AgentRole) => a.agent_id === st.assigned_agent_id);
          msgs.push({
            id: `st-${st.id || j}`, role: 'agent', agent_id: st.assigned_agent_id,
            agent_name: agent?.name || st.assigned_agent_id, agent_role: agent?.role || 'executor',
            content: st.result || st.goal || '', timestamp: new Date(),
          });
        });
      });
      set({ messages: msgs });
    } catch (e) { console.error(e); }
  },

  createGroup: async () => {
    const { newName, newDesc } = get();
    if (!newName.trim()) return;
    set({ loading: true });
    try {
      await fetch(`${getApiBaseUrl()}/api/ai-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ name: newName, description: newDesc, agents: [] }),
      });
      set({ newName: '', newDesc: '', showCreate: false });
      get().fetchGroups();
    } finally { set({ loading: false }); }
  },

  deleteGroup: async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${id}`, { method: 'DELETE', headers: authHeaders() });
    const { selectedGroup } = get();
    if (selectedGroup?.id === id) set({ selectedGroup: null, messages: [] });
    get().fetchGroups();
  },

  renameGroup: async (id: string) => {
    const { editingName, selectedGroup } = get();
    if (!editingName.trim()) { set({ editingGroupId: null }); return; }
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: editingName }),
    });
    set({ editingGroupId: null });
    if (selectedGroup?.id === id) {
      set((s) => ({ selectedGroup: s.selectedGroup ? { ...s.selectedGroup, name: editingName } : s.selectedGroup }));
    }
    get().fetchGroups();
  },

  saveGroupSettings: async () => {
    const { selectedGroup, editGroupName, editGroupDesc } = get();
    if (!selectedGroup) return;
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: editGroupName, description: editGroupDesc }),
    });
    set((s) => ({
      showGroupSettings: false,
      selectedGroup: s.selectedGroup ? { ...s.selectedGroup, name: editGroupName, description: editGroupDesc } : s.selectedGroup,
    }));
    get().fetchGroups();
  },

  addAgent: async () => {
    const { selectedGroup, newAgent } = get();
    if (!selectedGroup || !newAgent.name.trim()) return;
    const agent: AgentRole = {
      agent_id: `agent-${Date.now()}`, name: newAgent.name,
      role: newAgent.role, model: newAgent.model, status: 'online',
    };
    const updated = [...(selectedGroup.agents || []), agent];
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agents: updated }),
    });
    set({ newAgent: { name: '', role: 'executor', model: 'claude-sonnet' }, showAddAgent: false });
    get().selectGroup(selectedGroup);
  },

  removeAgent: async (agentId: string) => {
    const { selectedGroup } = get();
    if (!selectedGroup) return;
    const updated = (selectedGroup.agents || []).filter(a => a.agent_id !== agentId);
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agents: updated }),
    });
    get().selectGroup(selectedGroup);
  },

  startEditAgent: (agent: AgentRole) => {
    set({
      editingAgent: agent.agent_id,
      editAgentData: { name: agent.name, model: agent.model, temperature: agent.temperature || 0.7, role: agent.role },
    });
  },

  saveEditAgent: async (agentId: string) => {
    const { selectedGroup, editAgentData } = get();
    if (!selectedGroup) return;
    const updated = (selectedGroup.agents || []).map(a =>
      a.agent_id === agentId ? { ...a, name: editAgentData.name, model: editAgentData.model, temperature: editAgentData.temperature, role: editAgentData.role } : a
    );
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agents: updated }),
    });
    set({ editingAgent: null });
    get().selectGroup(selectedGroup);
  },

  fetchAgentProfile: async (agentId: string) => {
    const { selectedGroup } = get();
    if (!selectedGroup) return;
    set({ loadingProfile: agentId });
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/agents/${agentId}/capabilities`, { headers: authHeaders() });
      const data = await res.json();
      set((s) => ({ agentProfiles: { ...s.agentProfiles, [agentId]: data } }));
    } catch (e) {
      console.error('Failed to fetch agent profile:', e);
    }
    set({ loadingProfile: null });
  },
}));

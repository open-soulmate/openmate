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

  // WebSocket 连接管理
  wsGroup: WebSocket | null;        // 当前群组的 WebSocket 连接实例
  wsConnected: boolean;             // WebSocket 连接状态
  wsTypingUsers: string[];          // 正在输入的用户列表

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

  // WebSocket 连接管理 actions
  connectGroupWS: (groupId: string) => void;         // 建立群组 WS 连接
  disconnectGroupWS: () => void;                      // 断开群组 WS 连接
  sendGroupMessage: (content: string, intent?: string) => void; // 通过 WS 发送消息
  addMessage: (msg: GroupMessage) => void;            // 添加单条消息到列表

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
  wsGroup: null,              // 初始无 WebSocket 连接
  wsConnected: false,         // 初始未连接
  wsTypingUsers: [],          // 初始无输入用户
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

  // ── WebSocket 连接管理 ──────────────────────────────────────────
  
  /**
   * 建立群组 WebSocket 连接
   * @param groupId 要连接的群组 ID
   */
  connectGroupWS: (groupId: string) => {
    const { disconnectGroupWS } = get();
    
    // 先断开已有连接（切换群组时）
    disconnectGroupWS();

    // 构建 WebSocket URL：从 API base URL 替换协议和端口
    const apiBase = getApiBaseUrl();                    // e.g. http://localhost:8090
    const wsBase = apiBase
      .replace(/^http/, 'ws')                          // http → ws，https → wss
      .replace(/:8090/, ':8092');                      // 8090 → 8092（ACP Proxy 端口）
    const token = getToken() || '';
    const wsUrl = `${wsBase}/ws/group/${groupId}?token=${token}`;

    console.log('[WS] 正在连接群组 WebSocket:', wsUrl);
    const ws = new WebSocket(wsUrl);

    // 连接建立成功
    ws.onopen = () => {
      console.log('[WS] 群组 WebSocket 已连接，群组:', groupId);
      set({ wsConnected: true });
    };

    // 接收服务端消息
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const { type, data } = msg;
        console.log('[WS] 收到消息:', type, data);

        switch (type) {
          // 用户消息（其他用户或自己发送后回显）
          case 'user_message': {
            const newMsg: GroupMessage = {
              id: data.id || `ws-user-${Date.now()}`,
              role: 'user',
              content: data.content || '',
              timestamp: new Date(data.timestamp || Date.now()),
              agent_id: data.agent_id,
              agent_name: data.agent_name || data.agent_id,
              target: data.target || 'all',
              intent: data.intent as GroupMessage['intent'],
            };
            get().addMessage(newMsg);
            break;
          }

          // Agent 回复消息
          case 'agent_message': {
            const agentMsg: GroupMessage = {
              id: data.id || `ws-agent-${Date.now()}`,
              role: 'agent',
              agent_id: data.agent_id,
              agent_name: data.agent_name || data.agent_id,
              agent_role: data.agent_role || 'executor',
              content: data.content || '',
              timestamp: new Date(data.timestamp || Date.now()),
              intent: data.intent as GroupMessage['intent'],
            };
            get().addMessage(agentMsg);
            break;
          }

          // 系统消息（任务状态变更、讨论轮次等）
          case 'system_message': {
            const sysMsg: GroupMessage = {
              id: data.id || `ws-sys-${Date.now()}`,
              role: 'system' as any,
              content: data.content || data.message || '',
              timestamp: new Date(data.timestamp || Date.now()),
            };
            get().addMessage(sysMsg);
            break;
          }

          // 讨论轮次更新
          case 'discussion_round': {
            const roundMsg: GroupMessage = {
              id: data.id || `ws-round-${Date.now()}`,
              role: 'system' as any,
              content: `🔄 讨论第 ${data.round_num || '?'} 轮 — ${data.summary || ''}`,
              timestamp: new Date(data.timestamp || Date.now()),
            };
            get().addMessage(roundMsg);
            break;
          }

          // 任务状态更新
          case 'task_update': {
            const taskMsg: GroupMessage = {
              id: data.id || `ws-task-${Date.now()}`,
              role: 'system' as any,
              content: `📋 任务更新: ${data.status || ''} — ${data.message || ''}`,
              timestamp: new Date(data.timestamp || Date.now()),
            };
            get().addMessage(taskMsg);
            break;
          }

          // 正在输入指示器
          case 'typing': {
            const userId = data.agent_id || data.user_id || '';
            if (userId) {
              set((s) => {
                // 防止重复添加
                if (s.wsTypingUsers.includes(userId)) return s;
                return { wsTypingUsers: [...s.wsTypingUsers, userId] };
              });
              // 3 秒后自动移除输入状态
              setTimeout(() => {
                set((s) => ({
                  wsTypingUsers: s.wsTypingUsers.filter((u) => u !== userId),
                }));
              }, 3000);
            }
            break;
          }

          // 连接确认
          case 'connected': {
            console.log('[WS] 服务端确认连接:', data);
            set({ wsConnected: true });
            break;
          }

          // 消息确认回执（可忽略或用于更新消息状态）
          case 'message_ack': {
            console.log('[WS] 消息已确认:', data);
            break;
          }

          default:
            console.log('[WS] 未知消息类型:', type, data);
        }
      } catch (e) {
        console.error('[WS] 解析消息失败:', e, event.data);
      }
    };

    // 连接关闭
    ws.onclose = (event) => {
      console.log('[WS] WebSocket 已关闭:', event.code, event.reason);
      set({ wsGroup: null, wsConnected: false });
    };

    // 连接错误
    ws.onerror = (event) => {
      console.error('[WS] WebSocket 错误:', event);
      set({ wsGroup: null, wsConnected: false });
    };

    // 保存连接实例
    set({ wsGroup: ws });
  },

  /**
   * 断开群组 WebSocket 连接
   */
  disconnectGroupWS: () => {
    const { wsGroup } = get();
    if (wsGroup) {
      console.log('[WS] 正在断开 WebSocket 连接');
      wsGroup.close(1000, '用户切换群组或离开页面');
    }
    set({ wsGroup: null, wsConnected: false, wsTypingUsers: [] });
  },

  /**
   * 通过 WebSocket 发送群组消息
   * @param content 消息内容
   * @param intent 消息意图（可选，如 claim/suggest/refer 等）
   */
  sendGroupMessage: (content: string, intent?: string) => {
    const { wsGroup, wsConnected } = get();
    if (!wsGroup || !wsConnected) {
      console.error('[WS] 无法发送消息：WebSocket 未连接');
      return;
    }
    // 构建发送消息体
    const payload = {
      type: 'message',
      content,
      intent: intent || 'comment',
      agent_id: 'user',      // 标识消息来自人类用户
    };
    console.log('[WS] 发送消息:', payload);
    wsGroup.send(JSON.stringify(payload));
  },

  /**
   * 添加单条消息到消息列表（供 WebSocket 回调使用）
   * @param msg 要添加的消息对象
   */
  addMessage: (msg: GroupMessage) => {
    set((s) => ({ messages: [...s.messages, msg] }));
  },

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

      // 建立该群组的 WebSocket 实时连接
      get().connectGroupWS(group.id);
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
    // 删除当前选中群组时断开 WebSocket
    const { selectedGroup } = get();
    if (selectedGroup?.id === id) get().disconnectGroupWS();
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${id}`, { method: 'DELETE', headers: authHeaders() });
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
    // 生成唯一 agent_id
    const agentId = `agent-${Date.now()}`;
    const agent: AgentRole = {
      agent_id: agentId, name: newAgent.name,
      role: newAgent.role, model: newAgent.model, status: 'online',
    };
    // 使用 POST /{group_id}/agents 独立端点添加成员
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/agents`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(agent),
    });
    set({ newAgent: { name: '', role: 'executor', model: 'claude-sonnet' }, showAddAgent: false });
    get().selectGroup(selectedGroup);
  },

  removeAgent: async (agentId: string) => {
    const { selectedGroup } = get();
    if (!selectedGroup) return;
    // 使用 DELETE /{group_id}/agents/{agent_id} 独立端点删除成员
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/agents/${agentId}`, {
      method: 'DELETE', headers: authHeaders(),
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
    // 使用 PATCH /{group_id}/agents/{agent_id} 独立端点更新成员
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/agents/${agentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ model: editAgentData.model, temperature: editAgentData.temperature, role: editAgentData.role }),
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

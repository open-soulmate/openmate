'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useMediaQuery } from '@/hooks/use-mobile';
import {
  Users, Plus, Send, Bot, Shield, Zap, User, Trash2, ChevronDown,
  ChevronRight, ChevronLeft, Settings, X, Loader2, Search, UserPlus, Edit3, Check,
  MessageSquare, AtSign, PanelRightClose, PanelRightOpen,
  ArrowUp, ArrowRight, ArrowDown, Star, Trophy, Target, Lightbulb,
  MessageCircle, Hand, FileText, Award, TrendingUp, PanelLeft,
} from 'lucide-react';

interface AgentRole {
  agent_id: string;
  name: string;
  role: string;
  model: string;
  status: string;
  temperature?: number;
  system_prompt?: string;
}

interface GroupMessage {
  id: string;
  role: 'user' | 'agent';
  agent_id?: string;
  agent_name?: string;
  agent_role?: string;
  content: string;
  timestamp: Date;
  target?: string; // @agent_id or @all
  intent?: 'claim' | 'suggest' | 'refer' | 'comment' | 'result' | 'score';
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

interface DiscussionMessage {
  id: string;
  agent_id: string;
  agent_name: string;
  intent: 'claim' | 'suggest' | 'refer' | 'comment' | 'result' | 'score';
  content: string;
  metadata: Record<string, any>;
  round_num: number;
  created_at: string;
}

interface AgentCapability {
  capability: string;
  avg_score: number;
  task_count: number;
  trend: 'up' | 'down' | 'stable';
}

interface AgentProfile {
  agent_id: string;
  overall_rank: number;
  capabilities: AgentCapability[];
  strengths: string[];
  weaknesses: string[];
}

interface ScoringEntry {
  scorer_agent_id: string;
  scorer_name: string;
  score: number;
  reason: string;
  capability: string;
}

interface TaskReview {
  task_id: string;
  result: string;
  status: 'discussing' | 'assigned' | 'executing' | 'reviewing' | 'scored';
  round: number;
  assignments: { agent_id: string; subgoal: string }[];
  scores: ScoringEntry[];
  avg_score: number;
  discussion_messages: DiscussionMessage[];
}

const ROLE_ICONS: Record<string, any> = { advisor: Shield, executor: Zap, verifier: Bot, human: User };
const ROLE_COLORS: Record<string, string> = { advisor: 'text-yellow-400', executor: 'text-blue-400', verifier: 'text-green-400', human: 'text-purple-400' };
const ROLE_BG_COLORS: Record<string, string> = { advisor: 'bg-yellow-500/20', executor: 'bg-blue-500/20', verifier: 'bg-green-500/20', human: 'bg-purple-500/20' };

// Discussion intent badge config
const INTENT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  claim: { label: '认领', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: Hand },
  suggest: { label: '建议', color: 'text-sky-400', bg: 'bg-sky-500/20', icon: Lightbulb },
  refer: { label: '推荐', color: 'text-amber-400', bg: 'bg-amber-500/20', icon: Target },
  comment: { label: '评论', color: 'text-zinc-400', bg: 'bg-zinc-500/20', icon: MessageCircle },
  result: { label: '结果', color: 'text-violet-400', bg: 'bg-violet-500/20', icon: FileText },
  score: { label: '评分', color: 'text-orange-400', bg: 'bg-orange-500/20', icon: Star },
};
const AGENT_AVATAR_COLORS = [
  'bg-rose-500/20 text-rose-400', 'bg-sky-500/20 text-sky-400', 'bg-emerald-500/20 text-emerald-400',
  'bg-amber-500/20 text-amber-400', 'bg-violet-500/20 text-violet-400', 'bg-pink-500/20 text-pink-400',
  'bg-teal-500/20 text-teal-400', 'bg-orange-500/20 text-orange-400',
];

function getAgentAvatarColor(index: number) {
  return AGENT_AVATAR_COLORS[index % AGENT_AVATAR_COLORS.length];
}

export default function AIGroupsPage() {
  const { t } = useTranslation();
  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };
  const [groups, setGroups] = useState<AIGroup[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<AIGroup | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const isMobile = useMediaQuery("(max-width: 1023px)");

  // Create group
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Edit group name inline
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // @mention
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);
  const [selectedTarget, setSelectedTarget] = useState<string>('all');

  // Agent management
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [newAgent, setNewAgent] = useState({ name: '', role: 'executor', model: 'claude-sonnet' });

  // Edit agent
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [editAgentData, setEditAgentData] = useState({ name: '', model: '', temperature: 0.7, role: '' });

  // Group settings
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupDesc, setEditGroupDesc] = useState('');

  // Discussion flow
  const [activeTaskReview, setActiveTaskReview] = useState<TaskReview | null>(null);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [currentDiscussionId, setCurrentDiscussionId] = useState<string | null>(null);

  // Agent capability profiles
  const [agentProfiles, setAgentProfiles] = useState<Record<string, AgentProfile>>({});
  const [loadingProfile, setLoadingProfile] = useState<string | null>(null);
  const [showCapabilityPanel, setShowCapabilityPanel] = useState<string | null>(null);

  // Scoring
  const [scoringTaskId, setScoringTaskId] = useState<string | null>(null);
  const [scoreValue, setScoreValue] = useState(7);
  const [scoreReason, setScoreReason] = useState('');
  const [scoreCapability, setScoreCapability] = useState('');
  const [scorerAgentId, setScorerAgentId] = useState('');

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const fetchGroups = async () => {
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups`, { headers: authHeaders() });
      const data = await res.json();
      setGroups(data);
      // Sync selectedGroup with latest data
      if (selectedGroup) {
        const updated = data.find((g: AIGroup) => g.id === selectedGroup.id);
        if (updated) setSelectedGroup(updated);
      }
      if (!selectedGroup && data.length > 0) {
        selectGroup(data[0]);
      }
    } catch (e) { console.error(e); }
  };

  const selectGroup = async (group: AIGroup) => {
    setSelectedGroup(group);
    setShowSidebar(false); // close sidebar sheet on mobile
    setShowRightPanel(true); // show right panel on desktop
    setMessages([]);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${group.id}`, { headers: authHeaders() });
      const data = await res.json();
      const updated = { ...group, ...data };
      setSelectedGroup(updated);
      setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
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
      setMessages(msgs);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { fetchGroups(); }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const createGroup = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      await fetch(`${getApiBaseUrl()}/api/ai-groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          name: newName, description: newDesc, agents: []
        })
      });
      setNewName(''); setNewDesc(''); setShowCreate(false);
      fetchGroups();
    } finally { setLoading(false); }
  };

  const deleteGroup = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${id}`, { method: 'DELETE', headers: authHeaders() });
    if (selectedGroup?.id === id) { setSelectedGroup(null); setMessages([]); }
    fetchGroups();
  };

  const renameGroup = async (id: string) => {
    if (!editingName.trim()) { setEditingGroupId(null); return; }
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: editingName }),
    });
    setEditingGroupId(null);
    // Update selectedGroup immediately
    if (selectedGroup?.id === id) {
      setSelectedGroup(prev => prev ? { ...prev, name: editingName } : prev);
    }
    fetchGroups();
  };

  const saveGroupSettings = async () => {
    if (!selectedGroup) return;
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ name: editGroupName, description: editGroupDesc }),
    });
    setShowGroupSettings(false);
    // Update selectedGroup immediately
    setSelectedGroup(prev => prev ? { ...prev, name: editGroupName, description: editGroupDesc } : prev);
    fetchGroups();
  };

  const addAgent = async () => {
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
    setNewAgent({ name: '', role: 'executor', model: 'claude-sonnet' });
    setShowAddAgent(false);
    selectGroup(selectedGroup);
  };

  const removeAgent = async (agentId: string) => {
    if (!selectedGroup) return;
    const updated = (selectedGroup.agents || []).filter(a => a.agent_id !== agentId);
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agents: updated }),
    });
    selectGroup(selectedGroup);
  };

  const startEditAgent = (agent: AgentRole) => {
    setEditingAgent(agent.agent_id);
    setEditAgentData({ name: agent.name, model: agent.model, temperature: agent.temperature || 0.7, role: agent.role });
  };

  const saveEditAgent = async (agentId: string) => {
    if (!selectedGroup) return;
    const updated = (selectedGroup.agents || []).map(a =>
      a.agent_id === agentId ? { ...a, name: editAgentData.name, model: editAgentData.model, temperature: editAgentData.temperature, role: editAgentData.role } : a
    );
    await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ agents: updated }),
    });
    setEditingAgent(null);
    selectGroup(selectedGroup);
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedGroup || sendingMessage || discussionLoading) return;
    const text = input.trim();

    // Parse @mentions
    let target = selectedTarget;
    const mentionMatch = text.match(/^@(\S+)\s/);
    if (mentionMatch) {
      const mention = mentionMatch[1];
      if (mention === 'all') target = 'all';
      else {
        const agent = (selectedGroup.agents || []).find(a => a.name.toLowerCase().includes(mention.toLowerCase()) || a.agent_id === mention);
        if (agent) target = agent.agent_id;
      }
    }

    const userMsg: GroupMessage = {
      id: `msg-${Date.now()}`, role: 'user', content: text,
      timestamp: new Date(), target,
    };
    setMessages(prev => [...prev, userMsg]);
    setInput(''); setSelectedTarget('all');

    // Check if this looks like a task → trigger discussion flow
    if (target === 'all' && isTaskLikeMessage(text)) {
      await runDiscussionFlow(text);
      return;
    }

    // Otherwise, send as a regular message (existing behavior)
    setSendingMessage(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ goal: text, target_agent: target }),
      });
      const data = await res.json();

      // Add agent response
      if (data.response) {
        const targetAgent = target === 'all'
          ? (selectedGroup.agents || [])[0]
          : (selectedGroup.agents || []).find(a => a.agent_id === target);
        setMessages(prev => [...prev, {
          id: `resp-${Date.now()}`, role: 'agent',
          agent_id: targetAgent?.agent_id, agent_name: targetAgent?.name || 'Agent',
          agent_role: targetAgent?.role || 'executor',
          content: data.response, timestamp: new Date(),
        }]);
      }
      selectGroup(selectedGroup);
    } catch (e) {
      setMessages(prev => [...prev, {
        id: `err-${Date.now()}`, role: 'agent', agent_name: 'System',
        agent_role: 'executor', content: t('aiGroups.sendFailed'), timestamp: new Date(),
      }]);
    }
    setSendingMessage(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setInput(val);
    // Detect @ trigger
    const cursorPos = e.target.selectionStart;
    const textBeforeCursor = val.slice(0, cursorPos);
    const atMatch = textBeforeCursor.match(/@(\w*)$/);
    if (atMatch) {
      setShowMention(true);
      setMentionFilter(atMatch[1].toLowerCase());
      setMentionIndex(0);
    } else {
      setShowMention(false);
    }
  };

  const insertMention = (agent: AgentRole | { name: string; agent_id: string }) => {
    const cursorPos = inputRef.current?.selectionStart || input.length;
    const textBeforeCursor = input.slice(0, cursorPos);
    const atIndex = textBeforeCursor.lastIndexOf('@');
    const before = input.slice(0, atIndex);
    const after = input.slice(cursorPos);
    setInput(`${before}@${agent.name} ${after}`);
    setSelectedTarget(agent.agent_id);
    setShowMention(false);
    inputRef.current?.focus();
  };

  const filteredAgents = (selectedGroup?.agents || []).filter(a =>
    a.name.toLowerCase().includes(mentionFilter) || a.agent_id.toLowerCase().includes(mentionFilter)
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMention) {
      const items = [{ name: 'all', agent_id: 'all' }, ...filteredAgents];
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + items.length) % items.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(items[mentionIndex]); }
      else if (e.key === 'Escape') { setShowMention(false); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const getAgentById = (id?: string) => (selectedGroup?.agents || []).find(a => a.agent_id === id);

  // Check if a message looks like a task (heuristic)
  const isTaskLikeMessage = (text: string): boolean => {
    const taskPatterns = [
      /^(请|帮我|帮忙|实现|编写|创建|设计|分析|优化|修复|检查|部署|开发|构建|写一个|做一个)/,
      /^(please|help|implement|create|design|analyze|optimize|fix|check|deploy|develop|build|write|make)/i,
      /任务|需求|功能|task|requirement|feature/i,
    ];
    return taskPatterns.some(p => p.test(text.trim()));
  };

  // Start a discussion flow for a task
  const startDiscussion = async (goal: string) => {
    if (!selectedGroup) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/discuss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          goal,
          constraints: [],
          completion_criteria: [],
        }),
      });
      const data = await res.json();
      return data.task_id as string;
    } catch (e) {
      console.error('Failed to start discussion:', e);
      return null;
    }
  };

  // Fetch discussion messages
  const fetchDiscussionMessages = async (taskId: string): Promise<DiscussionMessage[]> => {
    if (!selectedGroup) return [];
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/discuss/${taskId}/messages`, { headers: authHeaders() });
      return await res.json();
    } catch (e) {
      console.error('Failed to fetch discussion messages:', e);
      return [];
    }
  };

  // Submit agent discussion response
  const submitDiscussionResponse = async (taskId: string, agentId: string, agentName: string, intent: string, content: string) => {
    if (!selectedGroup) return;
    try {
      await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/discuss/${taskId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent_id: agentId, agent_name: agentName, intent, content }),
      });
    } catch (e) {
      console.error('Failed to submit discussion response:', e);
    }
  };

  // Finalize discussion and assign tasks
  const finalizeDiscussion = async (taskId: string, assignments: { agent_id: string; subgoal: string }[]) => {
    if (!selectedGroup) return;
    try {
      await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/discuss/${taskId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ assignments }),
      });
    } catch (e) {
      console.error('Failed to finalize discussion:', e);
    }
  };

  // Submit task result for review
  const submitTaskResult = async (taskId: string, result: string) => {
    if (!selectedGroup) return;
    try {
      await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ result }),
      });
    } catch (e) {
      console.error('Failed to submit task result:', e);
    }
  };

  // Submit a score for a task
  const submitScore = async (taskId: string, scorerAgentId: string, score: number, reason: string, capability: string) => {
    if (!selectedGroup) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks/${taskId}/score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ scorer_agent_id: scorerAgentId, score, reason, capability }),
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to submit score:', e);
      return null;
    }
  };

  // Fetch agent capability profile
  const fetchAgentProfile = async (agentId: string) => {
    if (!selectedGroup) return;
    setLoadingProfile(agentId);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/agents/${agentId}/capabilities`, { headers: authHeaders() });
      const data = await res.json();
      setAgentProfiles(prev => ({ ...prev, [agentId]: data }));
    } catch (e) {
      console.error('Failed to fetch agent profile:', e);
    }
    setLoadingProfile(null);
  };

  // Execute a task via real agent (calls backend execute endpoint)
  const executeAgentTask = async (taskId: string, agentId: string, goal: string) => {
    if (!selectedGroup) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks/${taskId}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ agent_id: agentId, goal }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('Failed to execute agent task:', e);
      return null;
    }
  };

  // Auto-evaluate task result (closes the feedback loop)
  const autoEvaluateTask = async (taskId: string, success: boolean, capability?: string) => {
    if (!selectedGroup) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks/${taskId}/auto-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ success, capability: capability || '' }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error('Auto-evaluate failed:', e);
      return null;
    }
  };

  // Run the full discussion flow for a task-like message
  const runDiscussionFlow = async (goal: string) => {
    if (!selectedGroup) return;
    setDiscussionLoading(true);

    // Step 1: Start discussion
    const taskId = await startDiscussion(goal);
    if (!taskId) {
      setDiscussionLoading(false);
      return;
    }
    setCurrentDiscussionId(taskId);

    // Add system message about discussion starting
    setMessages(prev => [...prev, {
      id: `discuss-start-${Date.now()}`, role: 'agent',
      agent_name: 'System', agent_role: 'executor',
      content: `📋 讨论已启动 (Task: ${taskId.slice(0, 8)})`,
      timestamp: new Date(),
      intent: 'comment' as const,
    }]);

    // Step 2: Each advisor/verifier agent gives input via real LLM call
    const agents = selectedGroup.agents || [];
    const discussAgents = agents.filter(a => a.role !== 'executor');
    const executors = agents.filter(a => a.role === 'executor');

    // If no non-executor agents, use all agents for discussion
    const discussPool = discussAgents.length > 0 ? discussAgents : agents;

    for (const agent of discussPool) {
      const discussPrompt = `你是AI群组中的${agent.role}角色"${agent.name}"。群组正在讨论以下任务目标：\n\n"${goal}"\n\n请从你的角色角度给出简短建议（100字以内），说明你认为应该如何完成这个任务。`;
      const result = await executeAgentTask(taskId, agent.agent_id, discussPrompt);
      const content = result?.response || `${agent.name}(${agent.role}): 建议按标准流程执行此任务。`;
      const intent = agent.role === 'advisor' ? 'suggest' as const : 'comment' as const;

      await submitDiscussionResponse(taskId, agent.agent_id, agent.name, intent, content);

      setMessages(prev => [...prev, {
        id: `discuss-${agent.agent_id}-${Date.now()}`, role: 'agent',
        agent_id: agent.agent_id, agent_name: agent.name, agent_role: agent.role,
        content, timestamp: new Date(),
        intent,
      }]);
    }

    // Step 3: Smart assignment based on capability scores
    let assignments: { agent_id: string; subgoal: string }[] = [];
    let assignReasoning: string[] = [];
    try {
      const smartRes = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/smart-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ goal, constraints: [] }),
      });
      if (smartRes.ok) {
        const smartData = await smartRes.json();
        assignments = (smartData.assignments || []).map((a: any) => ({
          agent_id: a.agent_id,
          subgoal: a.subgoal,
        }));
        assignReasoning = smartData.reasoning || [];

        // Show smart assignment info
        if (smartData.task_tags?.length) {
          setMessages(prev => [...prev, {
            id: `smart-tags-${Date.now()}`, role: 'agent',
            agent_name: 'System', agent_role: 'executor',
            content: `🏷️ 任务标签: ${smartData.task_tags.join(', ')} | 智能分配: ${assignReasoning.join(' → ')}`,
            timestamp: new Date(),
            intent: 'comment' as const,
          }]);
        }
      }
    } catch (e) {
      console.warn('Smart assign failed, falling back to all executors:', e);
    }

    // Fallback: if smart-assign returned nothing, assign to all executors
    if (assignments.length === 0) {
      const execAgents = executors.length > 0 ? executors : agents;
      assignments = execAgents.map(a => ({
        agent_id: a.agent_id,
        subgoal: `完成任务中与${a.name}(${a.role})相关的部分`,
      }));
    }

    await finalizeDiscussion(taskId, assignments);

    setMessages(prev => [...prev, {
      id: `assign-${Date.now()}`, role: 'agent',
      agent_name: 'System', agent_role: 'executor',
      content: `✅ 讨论结束，${assignments.length}个Agent开始执行任务...`,
      timestamp: new Date(),
      intent: 'comment' as const,
    }]);

    // Step 4: Execute tasks via real agents
    const results: string[] = [];
    const agentScores: { agent_id: string; name: string; score: number; capability: string; success: boolean }[] = [];
    for (const assignment of assignments) {
      const agentInfo = getAgentById(assignment.agent_id);
      setMessages(prev => [...prev, {
        id: `executing-${assignment.agent_id}-${Date.now()}`, role: 'agent',
        agent_id: assignment.agent_id, agent_name: agentInfo?.name || assignment.agent_id,
        agent_role: agentInfo?.role || 'executor',
        content: `⏳ 正在执行: ${assignment.subgoal}...`,
        timestamp: new Date(),
        intent: 'comment' as const,
      }]);

      const execResult = await executeAgentTask(taskId, assignment.agent_id, goal);
      const responseText = execResult?.response || '(无响应)';
      const execSuccess = execResult?.success ?? false;
      results.push(`${agentInfo?.name || assignment.agent_id}: ${responseText}`);

      // Collect inline auto-score from execute response
      if (execResult?.auto_score != null) {
        agentScores.push({
          agent_id: assignment.agent_id,
          name: agentInfo?.name || assignment.agent_id,
          score: execResult.auto_score,
          capability: execResult.capability || '',
          success: execSuccess,
        });
      }

      // Update the "executing" message with real result + score badge
      const scoreBadge = execResult?.auto_score != null ? ` [${execResult.auto_score}/10]` : '';
      setMessages(prev => {
        const updated = [...prev];
        const idx = updated.findIndex(m => m.id === `executing-${assignment.agent_id}-${Date.now()}`);
        if (idx >= 0) {
          updated[idx] = { ...updated[idx], content: responseText + scoreBadge, intent: 'result' as const };
        } else {
          updated.push({
            id: `result-${assignment.agent_id}-${Date.now()}`, role: 'agent',
            agent_id: assignment.agent_id, agent_name: agentInfo?.name || assignment.agent_id,
            agent_role: agentInfo?.role || 'executor',
            content: responseText + scoreBadge, timestamp: new Date(),
            intent: 'result' as const,
          });
        }
        return updated;
      });
    }

    // Step 5: Submit combined result for review
    const resultContent = results.join('\n\n---\n\n');
    await submitTaskResult(taskId, resultContent);

    // Step 6: Show inline auto-scores (already calculated by backend during execute)
    if (agentScores.length > 0) {
      const avgScore = Math.round(agentScores.reduce((s, a) => s + a.score, 0) / agentScores.length);
      const scoreLines = agentScores.map(a => `${a.name}: ${a.score}/10 (${a.capability})`).join('\n');

      setMessages(prev => [...prev, {
        id: `auto-eval-${Date.now()}`, role: 'agent',
        agent_name: 'Auto-Evaluator', agent_role: 'verifier',
        content: `📊 自动评分 (平均 ${avgScore}/10)\n${scoreLines}\n能力画像已自动更新`,
        timestamp: new Date(),
        intent: 'score' as const,
      }]);

      setActiveTaskReview({
        task_id: taskId,
        result: resultContent,
        status: 'scored',
        round: 1,
        assignments,
        scores: agentScores.map(a => ({
          scorer_agent_id: 'auto-scorer',
          scorer_name: a.name,
          score: a.score,
          reason: `自动评分: ${a.success ? '执行成功' : '执行失败'}`,
          capability: a.capability,
        })),
        avg_score: avgScore,
        discussion_messages: await fetchDiscussionMessages(taskId),
      });
    } else {
      // Fallback: no auto-score available
      setActiveTaskReview({
        task_id: taskId,
        result: resultContent,
        status: 'reviewing',
        round: 1,
        assignments,
        scores: [],
        avg_score: 0,
        discussion_messages: await fetchDiscussionMessages(taskId),
      });
    }

    setDiscussionLoading(false);
    setScoringTaskId(taskId);
  };

  // Handle score submission
  const handleSubmitScore = async () => {
    if (!scoringTaskId || !scorerAgentId || !selectedGroup) return;

    const scorer = getAgentById(scorerAgentId);
    const result = await submitScore(scoringTaskId, scorerAgentId, scoreValue, scoreReason, scoreCapability);

    if (result) {
      // Add score message to chat
      setMessages(prev => [...prev, {
        id: `score-${scorerAgentId}-${Date.now()}`, role: 'agent',
        agent_id: scorerAgentId, agent_name: scorer?.name || scorerAgentId,
        agent_role: scorer?.role || 'verifier',
        content: `评分: ${scoreValue}/10\n能力维度: ${scoreCapability}\n理由: ${scoreReason}`,
        timestamp: new Date(),
        intent: 'score' as const,
      }]);

      // Update active task review
      if (activeTaskReview) {
        const newScores = [...activeTaskReview.scores, {
          scorer_agent_id: scorerAgentId,
          scorer_name: scorer?.name || scorerAgentId,
          score: scoreValue,
          reason: scoreReason,
          capability: scoreCapability,
        }];
        setActiveTaskReview({
          ...activeTaskReview,
          scores: newScores,
          avg_score: result.avg_score || (newScores.reduce((s, e) => s + e.score, 0) / newScores.length),
          status: newScores.length >= (selectedGroup.agents?.length || 0) ? 'scored' : 'reviewing',
        });
      }

      // Reset scoring form
      setScoreReason('');
      setScoreCapability('');
      setScorerAgentId('');

      // If all agents scored, mark as done
      if (activeTaskReview && activeTaskReview.scores.length + 1 >= (selectedGroup.agents?.length || 0)) {
        setScoringTaskId(null);
      }
    }
  };

  const TrendIcon = ({ trend }: { trend: 'up' | 'down' | 'stable' }) => {
    if (trend === 'up') return <ArrowUp className="w-3 h-3 text-emerald-400" />;
    if (trend === 'down') return <ArrowDown className="w-3 h-3 text-red-400" />;
    return <ArrowRight className="w-3 h-3 text-zinc-400" />;
  };

  // Render capability profile for an agent
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
            <span className="text-sm font-bold text-amber-400">{profile.overall_rank.toFixed(1)}</span>
          </div>
        </div>
        {/* Capability bars */}
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
        {/* Strengths */}
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
        {/* Weaknesses */}
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


  // Shared group list content (used by both mobile Sheet and desktop inline)
  const renderGroupList = () => (
    <>
      <div className="p-3 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium flex items-center gap-1.5">
            <Users className="w-4 h-4" /> {t("aiGroups.title")}
          </span>
          <button onClick={() => setShowCreate(!showCreate)}
            className="p-1 rounded hover:bg-muted transition-colors" title={t("aiGroups.createGroup")}>
            <Plus className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        {showCreate && (
          <div className="space-y-2 mt-2 p-2 rounded-lg bg-muted/50">
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder={t("aiGroups.groupNamePlaceholder")}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder={t("aiGroups.descriptionOptional")}
              className="w-full px-2.5 py-1.5 bg-background border border-border rounded text-xs focus:outline-none focus:ring-1 focus:ring-primary/50" />
            <div className="flex gap-1.5">
              <button onClick={createGroup} disabled={loading}
                className="flex-1 px-2.5 py-1.5 bg-primary text-primary-foreground rounded text-xs hover:bg-primary/90 disabled:opacity-50">
                {loading ? t('aiGroups.creating') : t('aiGroups.create')}
              </button>
              <button onClick={() => setShowCreate(false)}
                className="px-2.5 py-1.5 bg-muted border border-border rounded text-xs hover:bg-accent">{t("aiGroups.cancel")}</button>
            </div>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 text-muted-foreground">
            <Users className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-xs">{t("aiGroups.noGroups")}</p>
          </div>
        )}
        {groups.map(group => (
          <div key={group.id}
            className={`group px-3 py-2.5 cursor-pointer hover:bg-muted/80 transition-colors border-b border-border/30 ${selectedGroup?.id === group.id ? 'bg-[rgba(124,58,237,0.12)] text-[#7c3aed]' : ''}`}
            onClick={() => selectGroup(group)}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {editingGroupId === group.id ? (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input value={editingName} onChange={e => setEditingName(e.target.value)}
                        className="w-full px-1.5 py-0.5 bg-background border border-border rounded text-xs focus:outline-none"
                        onKeyDown={e => { if (e.key === 'Enter') renameGroup(group.id); if (e.key === 'Escape') setEditingGroupId(null); }}
                        autoFocus />
                      <button onClick={() => renameGroup(group.id)} className="p-0.5 rounded hover:bg-muted"><Check className="w-3 h-3 text-primary" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-medium truncate">{group.name}</span>
                      <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted/50 transition-opacity"
                        onClick={e => { e.stopPropagation(); setEditingGroupId(group.id); setEditingName(group.name); }}>
                        <Edit3 className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground truncate">
                    {group.description || t('aiGroups.agentCount', { count: group.agents?.length || 0 })}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex -space-x-1.5 mr-1">
                  {(group.agents || []).slice(0, 3).map((a, i) => {
                    const Icon = ROLE_ICONS[a.role] || Bot;
                    return <div key={i} className={`w-5 h-5 rounded-full flex items-center justify-center border border-card ${getAgentAvatarColor(i)}`}><Icon className="w-2.5 h-2.5" /></div>;
                  })}
                </div>
                <button className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-500/10 text-red-500 transition-opacity"
                  onClick={(e) => deleteGroup(group.id, e)} title={t("aiGroups.delete")}>
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );


  return (
    <div className="flex h-full relative">
      {/* Left: Group List — Sheet on mobile, inline on desktop */}
      {isMobile ? (
        <Sheet open={showSidebar} onOpenChange={(open) => { setShowSidebar(open); if (open) setShowRightPanel(false); }}>
          <SheetContent side="left" showCloseButton={false} className="w-72 p-0 flex flex-col">
            <div className="shrink-0 flex flex-col h-full border-r-0 bg-card">
              {renderGroupList()}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        <div className="w-64 shrink-0 flex-col border-r border-border bg-card hidden lg:flex">
          {renderGroupList()}
        </div>
      )}

      {/* Center: Chat Messages (flex-1) */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Chat header */}
        <div className="h-12 border-b border-border flex items-center px-4 justify-between shrink-0">
          <div className="flex items-center gap-2">
            <button onClick={() => setShowSidebar(true)} className="lg:hidden mr-2 p-1 rounded hover:bg-muted">
              <PanelLeft className="w-4 h-4" />
            </button>
            <Users className="w-4 h-4 text-primary" />
            <span className="font-medium text-sm">{selectedGroup?.name || t('aiGroups.selectGroup')}</span>
            {selectedGroup && (
              <span className="text-xs text-muted-foreground px-1.5 py-0.5 rounded bg-muted">
                {selectedGroup.agents?.length || 0} Agent
              </span>
            )}
            {selectedTarget !== 'all' && selectedGroup && (
              <span className="text-xs text-primary px-1.5 py-0.5 rounded bg-primary/10">
                @{getAgentById(selectedTarget)?.name || selectedTarget}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowRightPanel(!showRightPanel)} className="p-1 rounded hover:bg-muted">
              {showRightPanel ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-4">
          {!selectedGroup && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <MessageSquare className="w-12 h-12 mb-4 opacity-40" />
              <p className="text-sm">{t("aiGroups.selectOrCreateGroup")}</p>
            </div>
          )}
          {selectedGroup && messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{selectedGroup.name}</h3>
              <p className="text-sm text-muted-foreground mb-4">{selectedGroup.description || t('aiGroups.multiAgentGroup')}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {(selectedGroup.agents || []).map((a, i) => {
                  const Icon = ROLE_ICONS[a.role] || Bot;
                  return (
                    <div key={i} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${ROLE_BG_COLORS[a.role] || 'bg-muted'}`}>
                      <Icon className={`w-3.5 h-3.5 ${ROLE_COLORS[a.role]}`} />
                      <span className="text-xs font-medium">{a.name}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground mt-6">{t("aiGroups.inputHint")}</p>
            </div>
          )}
          {messages.map(msg => {
            const agent = msg.role === 'agent' ? getAgentById(msg.agent_id) : null;
            const agentIndex = (selectedGroup?.agents || []).findIndex(a => a.agent_id === msg.agent_id);
            return (
              <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                {msg.role === 'agent' && (
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${getAgentAvatarColor(agentIndex >= 0 ? agentIndex : 0)}`}>
                    {(() => { const Icon = ROLE_ICONS[msg.agent_role || 'executor'] || Bot; return <Icon className="w-4 h-4" />; })()}
                  </div>
                )}
                <div className={`max-w-[70%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  {msg.role === 'agent' && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium">{msg.agent_name || 'Agent'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BG_COLORS[msg.agent_role || 'executor']} ${ROLE_COLORS[msg.agent_role || 'executor']}`}>
                        {msg.agent_role || 'executor'}
                      </span>
                      {/* Intent badge for discussion messages */}
                      {msg.intent && INTENT_CONFIG[msg.intent] && (() => {
                        const ic = INTENT_CONFIG[msg.intent];
                        const IntentIcon = ic.icon;
                        return (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded flex items-center gap-0.5 ${ic.bg} ${ic.color}`}>
                            <IntentIcon className="w-2.5 h-2.5" />
                            {ic.label}
                          </span>
                        );
                      })()}
                      {msg.target && msg.target !== 'all' && (
                        <span className="text-[10px] text-muted-foreground">{t("aiGroups.replyTo")} @{msg.target}</span>
                      )}
                    </div>
                  )}
                  <div className={`rounded-xl px-4 py-2.5 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <div className="text-[10px] mt-1.5 opacity-60">
                      {msg.timestamp.toLocaleTimeString()}
                      {msg.role === 'user' && msg.target && msg.target !== 'all' && (
                        <span className="ml-1.5">@{getAgentById(msg.target)?.name || msg.target}</span>
                      )}
                    </div>
                  </div>
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-primary-foreground" />
                  </div>
                )}
              </div>
            );
          })}
          {sendingMessage && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
              <div className="bg-muted rounded-xl px-4 py-2.5"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
            </div>
          )}
          {discussionLoading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-violet-400" /></div>
              <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  <span className="text-sm text-violet-400">讨论中...</span>
                </div>
              </div>
            </div>
          )}

          {/* Scoring UI */}
          {scoringTaskId && activeTaskReview && (
            <div className="mx-auto max-w-lg bg-muted/50 border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium">任务评审</span>
                {activeTaskReview.avg_score > 0 && (
                  <span className="ml-auto text-sm font-bold text-amber-400">
                    平均分: {activeTaskReview.avg_score.toFixed(1)}/10
                  </span>
                )}
              </div>

              {/* Score breakdown */}
              {activeTaskReview.scores.length > 0 && (
                <div className="space-y-1.5">
                  {activeTaskReview.scores.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-20 truncate">{s.scorer_name}</span>
                      <div className="flex-1 h-1.5 bg-background rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full" style={{ width: `${s.score * 10}%` }} />
                      </div>
                      <span className="font-medium w-8 text-right">{s.score}</span>
                      <span className="text-muted-foreground flex-1 truncate">{s.reason}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Scoring form */}
              {activeTaskReview.status !== 'scored' && (
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground w-16">评分者</label>
                    <select value={scorerAgentId} onChange={e => setScorerAgentId(e.target.value)}
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none">
                      <option value="">选择Agent...</option>
                      {(selectedGroup?.agents || []).map(a => (
                        <option key={a.agent_id} value={a.agent_id}>{a.name} ({a.role})</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground w-16">分数</label>
                    <input type="range" min="1" max="10" value={scoreValue}
                      onChange={e => setScoreValue(parseInt(e.target.value))}
                      className="flex-1" />
                    <span className="text-sm font-bold w-6 text-center">{scoreValue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground w-16">能力维度</label>
                    <input value={scoreCapability} onChange={e => setScoreCapability(e.target.value)}
                      placeholder="如：代码、设计、分析..."
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none" />
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-muted-foreground w-16">理由</label>
                    <input value={scoreReason} onChange={e => setScoreReason(e.target.value)}
                      placeholder="评分理由..."
                      className="flex-1 px-2 py-1 bg-background border border-border rounded text-xs focus:outline-none" />
                  </div>
                  <button onClick={handleSubmitScore}
                    disabled={!scorerAgentId || !scoreReason.trim() || !scoreCapability.trim()}
                    className="w-full px-3 py-1.5 bg-amber-500 text-white rounded text-xs hover:bg-amber-600 disabled:opacity-50 transition-colors">
                    提交评分
                  </button>
                </div>
              )}
              {activeTaskReview.status === 'scored' && (
                <div className="text-center text-xs text-emerald-400 pt-1">
                  ✅ 所有评分已完成
                </div>
              )}
            </div>
          )}
        </div>

        {/* Input area */}
        {selectedGroup && (
          <div className="border-t border-border p-4 shrink-0">
            {/* Target selector */}
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="text-[11px] text-muted-foreground">{t("aiGroups.sendTo")}:</span>
              <button onClick={() => setSelectedTarget('all')}
                className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${selectedTarget === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}>
                @{t("aiGroups.allMembers")}
              </button>
              {(selectedGroup.agents || []).map((a, i) => {
                const Icon = ROLE_ICONS[a.role] || Bot;
                return (
                  <button key={a.agent_id} onClick={() => setSelectedTarget(a.agent_id)}
                    className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full transition-colors ${selectedTarget === a.agent_id ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}>
                    <Icon className="w-3 h-3" /> {a.name}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-2 items-end relative">
              <div className="flex-1 relative">
                <textarea ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
                  placeholder={selectedTarget === 'all' ? t('aiGroups.inputPlaceholder') : `@${getAgentById(selectedTarget)?.name || 'Agent'} ...`}
                  rows={1}
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />

                {/* @mention dropdown */}
                {showMention && (
                  <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="p-1">
                      <button onClick={() => insertMention({ name: 'all', agent_id: 'all' })}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm hover:bg-muted transition-colors ${mentionIndex === 0 ? 'bg-muted' : ''}`}>
                        <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{t("aiGroups.everyone")}</span>
                      </button>
                      {filteredAgents.map((a, i) => {
                        const Icon = ROLE_ICONS[a.role] || Bot;
                        return (
                          <button key={a.agent_id} onClick={() => insertMention(a)}
                            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-sm hover:bg-muted transition-colors ${mentionIndex === i + 1 ? 'bg-muted' : ''}`}>
                            <Icon className={`w-3.5 h-3.5 ${ROLE_COLORS[a.role]}`} />
                            <span className="flex-1 text-left">{a.name}</span>
                            <span className="text-[10px] text-muted-foreground">{a.role}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <button onClick={handleSend} disabled={sendingMessage || !input.trim()}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right: Agent Management Panel — Sheet on mobile, inline on desktop */}
      {isMobile ? (
        <Sheet open={showRightPanel && !!selectedGroup} onOpenChange={(open) => { if (!open) setShowRightPanel(false); else setShowSidebar(false); }}>
          <SheetContent side="right" className="w-80 p-0">
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5"><Settings className="w-4 h-4" />{t("aiGroups.groupManagement")}</span>
            </div>
            <div className="flex-1 overflow-y-auto">
              {/* Group info */}
              {selectedGroup && (
                <>
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
                        <p className="text-sm font-medium">{selectedGroup.name}</p>
                        {selectedGroup.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedGroup.description}</p>}
                      </div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs text-muted-foreground">{t("aiGroups.participatingAgents")} ({selectedGroup.agents?.length || 0})</span>
                      <button onClick={() => setShowAddAgent(!showAddAgent)}
                        className="flex items-center gap-1 text-[11px] text-primary hover:underline">
                        <UserPlus className="w-3 h-3" /> {t("aiGroups.add")}
                      </button>
                    </div>
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
                    <div className="space-y-1.5">
                      {(selectedGroup.agents || []).map((agent, i) => {
                        const Icon = ROLE_ICONS[agent.role] || Bot;
                        return (
                          <div key={agent.agent_id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${getAgentAvatarColor(i)}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium truncate">{agent.name}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded ml-1 ${ROLE_BG_COLORS[agent.role]} ${ROLE_COLORS[agent.role]}`}>{agent.role}</span>
                            </div>
                            <button onClick={() => removeAgent(agent.agent_id)}
                              className="p-1 rounded hover:bg-red-500/10 text-red-400 transition-colors">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {(selectedGroup.agents || []).length === 0 && (
                      <div className="text-center py-6 text-muted-foreground">
                        <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
                        <p className="text-xs">{t("aiGroups.noAgents")}</p>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        showRightPanel && selectedGroup && (
        <div className="w-72 shrink-0 border-l border-border bg-card flex flex-col">
          <div className="p-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button className="hidden p-1 rounded hover:bg-muted"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium flex items-center gap-1.5"><Settings className="w-4 h-4" />{t("aiGroups.groupManagement")}</span>
            </div>
            <button onClick={() => { setShowRightPanel(false); }} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
          </div>

          <div className="flex-1 overflow-y-auto">
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
                  <p className="text-sm font-medium">{selectedGroup.name}</p>
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
                            <span className="text-sm font-medium truncate">{agent.name}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BG_COLORS[agent.role]} ${ROLE_COLORS[agent.role]}`}>
                              {agent.role}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate">{agent.model}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${agent.status === 'online' ? 'bg-emerald-500' : 'bg-zinc-500'}`} />
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
                                <button onClick={() => setEditingAgent(null)}
                                  className="px-2 py-1.5 bg-background border border-border rounded text-xs hover:bg-accent">{t("aiGroups.cancel")}</button>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                <div><span className="text-muted-foreground">{t("aiGroups.model")}:</span> <span className="font-medium">{agent.model}</span></div>
                                <div><span className="text-muted-foreground">{t("aiGroups.status")}:</span> <span className={`font-medium ${agent.status === 'online' ? 'text-emerald-500' : 'text-zinc-500'}`}>{agent.status || 'offline'}</span></div>
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
                <div className="text-center py-6 text-muted-foreground">
                  <Bot className="w-8 h-8 mx-auto mb-2 opacity-40" />
                  <p className="text-xs">{t("aiGroups.noAgents")}</p>
                  <p className="text-[11px] mt-0.5">{t("aiGroups.addAgentHint")}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
      {/* Scoring Modal */}
      {scoringTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" /> 任务评分
              </h3>
              <button onClick={() => setScoringTaskId(null)} className="p-1 rounded hover:bg-muted">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {/* Scorer selection */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">评分Agent</label>
              <select value={scorerAgentId} onChange={e => setScorerAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">选择评分者...</option>
                {(selectedGroup?.agents || []).map(a => (
                  <option key={a.agent_id} value={a.agent_id}>{a.name} ({a.role})</option>
                ))}
              </select>
            </div>

            {/* Score slider */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                分数: <span className="font-bold text-primary">{scoreValue}/10</span>
              </label>
              <input type="range" min="1" max="10" step="1" value={scoreValue}
                onChange={e => setScoreValue(parseInt(e.target.value))}
                className="w-full accent-primary" />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-0.5">
                <span>1 - 差</span><span>5 - 中</span><span>10 - 优</span>
              </div>
            </div>

            {/* Capability dimension */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">能力维度</label>
              <input value={scoreCapability} onChange={e => setScoreCapability(e.target.value)}
                placeholder="e.g. coding, reasoning, collaboration"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            {/* Reason */}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">评分理由</label>
              <textarea value={scoreReason} onChange={e => setScoreReason(e.target.value)}
                placeholder="说明评分依据..."
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>

            {/* Current scores */}
            {activeTaskReview && activeTaskReview.scores.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-xs text-muted-foreground">已有评分:</span>
                {activeTaskReview.scores.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs p-2 bg-muted/50 rounded-lg">
                    <span className="font-medium flex-1">{s.scorer_name || s.scorer_agent_id}</span>
                    <span className="text-amber-400 font-bold">{s.score}/10</span>
                    {s.capability && <span className="text-muted-foreground">({s.capability})</span>}
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs pt-1">
                  <span className="text-muted-foreground">平均分:</span>
                  <span className="font-bold text-primary">{activeTaskReview.avg_score.toFixed(1)}</span>
                </div>
              </div>
            )}

            <button onClick={handleSubmitScore} disabled={!scorerAgentId}
              className="w-full px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              提交评分
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

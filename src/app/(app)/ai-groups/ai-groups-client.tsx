'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { getApiBaseUrl, getToken } from '@/lib/api-client';
import { useSidebar } from '@/components/ui/sidebar';
import { useAppStore } from '@/stores/app-store';
import { AIGroupsWorkspace } from '@/components/ai-groups-workspace';
import {
  Users, Send, Bot, Shield, Zap, User, Loader2, Search,
  MessageSquare, AtSign,
  Star, Trophy, Award,
  MessageCircle, Hand, FileText, Lightbulb,
  Target, ArrowUp, ArrowRight, ArrowDown,
  PanelLeft, Settings, X,
  PanelRightOpen,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAIGroupsStore, type AgentRole, type GroupMessage, type AIGroup, type DiscussionMessage, type TaskReview } from '@/stores/ai-groups-store';

const ROLE_ICONS: Record<string, any> = { advisor: Shield, executor: Zap, verifier: Bot, human: User };
const ROLE_COLORS: Record<string, string> = { advisor: 'text-yellow-400', executor: 'text-blue-400', verifier: 'text-green-400', human: 'text-purple-400' };
const ROLE_BG_COLORS: Record<string, string> = { advisor: 'bg-yellow-500/20', executor: 'bg-blue-500/20', verifier: 'bg-green-500/20', human: 'bg-purple-500/20' };

const INTENT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  claim: { label: '认领', color: 'text-emerald-400', bg: 'bg-emerald-500/20', icon: Hand },
  suggest: { label: '建议', color: 'text-sky-400', bg: 'bg-sky-500/20', icon: Lightbulb },
  refer: { label: '推荐', color: 'text-amber-400', bg: 'bg-amber-500/20', icon: Target },
  comment: { label: '评论', color: 'text-muted-foreground', bg: 'bg-muted/20', icon: MessageCircle },
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
  const { toggleSidebar } = useSidebar();
  const toggleRightPanel = useAppStore((s) => s.toggleRightPanel);
  const isMobile = useIsMobile();

  const authHeaders = (): Record<string, string> => {
    const token = getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  // Read state from store
  const groups = useAIGroupsStore((s) => s.groups);
  const selectedGroup = useAIGroupsStore((s) => s.selectedGroup);
  const messages = useAIGroupsStore((s) => s.messages);
  const sendingMessage = useAIGroupsStore((s) => s.sendingMessage);
  const selectedTarget = useAIGroupsStore((s) => s.selectedTarget);
  const setSelectedTarget = useAIGroupsStore((s) => s.setSelectedTarget);
  const setMessages = useAIGroupsStore((s) => s.setMessages);
  const setSendingMessage = useAIGroupsStore((s) => s.setSendingMessage);
  const selectGroup = useAIGroupsStore((s) => s.selectGroup);
  const activeTaskReview = useAIGroupsStore((s) => s.activeTaskReview);
  const setActiveTaskReview = useAIGroupsStore((s) => s.setActiveTaskReview);
  const discussionLoading = useAIGroupsStore((s) => s.discussionLoading);
  const setDiscussionLoading = useAIGroupsStore((s) => s.setDiscussionLoading);
  const currentDiscussionId = useAIGroupsStore((s) => s.currentDiscussionId);
  const setCurrentDiscussionId = useAIGroupsStore((s) => s.setCurrentDiscussionId);
  const scoringTaskId = useAIGroupsStore((s) => s.scoringTaskId);
  const setScoringTaskId = useAIGroupsStore((s) => s.setScoringTaskId);
  const scoreValue = useAIGroupsStore((s) => s.scoreValue);
  const setScoreValue = useAIGroupsStore((s) => s.setScoreValue);
  const scoreReason = useAIGroupsStore((s) => s.scoreReason);
  const setScoreReason = useAIGroupsStore((s) => s.setScoreReason);
  const scoreCapability = useAIGroupsStore((s) => s.scoreCapability);
  const setScoreCapability = useAIGroupsStore((s) => s.setScoreCapability);
  const scorerAgentId = useAIGroupsStore((s) => s.scorerAgentId);
  const setScorerAgentId = useAIGroupsStore((s) => s.setScorerAgentId);

  // Local UI state
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [input, setInput] = useState('');
  const [showMention, setShowMention] = useState(false);
  const [mentionFilter, setMentionFilter] = useState('');
  const [mentionIndex, setMentionIndex] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight }); }, [messages]);

  const getAgentById = (id?: string) => (selectedGroup?.agents || []).find(a => a.agent_id === id);

  // Discussion API helpers
  const startDiscussion = async (goal: string) => {
    if (!selectedGroup) return null;
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/discuss`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ goal, constraints: [], completion_criteria: [] }),
      });
      const data = await res.json();
      return data.task_id as string;
    } catch (e) {
      console.error('Failed to start discussion:', e);
      return null;
    }
  };

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

  const isTaskLikeMessage = (text: string): boolean => {
    const taskPatterns = [
      /^(请|帮我|帮忙|实现|编写|创建|设计|分析|优化|修复|检查|部署|开发|构建|写一个|做一个)/,
      /^(please|help|implement|create|design|analyze|optimize|fix|check|deploy|develop|build|write|make)/i,
      /任务|需求|功能|task|requirement|feature/i,
    ];
    return taskPatterns.some(p => p.test(text.trim()));
  };

  const runDiscussionFlow = async (goal: string) => {
    if (!selectedGroup) return;
    setDiscussionLoading(true);

    const taskId = await startDiscussion(goal);
    if (!taskId) {
      setDiscussionLoading(false);
      return;
    }
    setCurrentDiscussionId(taskId);

    setMessages(prev => [...prev, {
      id: `discuss-start-${Date.now()}`, role: 'agent',
      agent_name: 'System', agent_role: 'executor',
      content: `📋 讨论已启动 (Task: ${taskId.slice(0, 8)})`,
      timestamp: new Date(),
      intent: 'comment' as const,
    }]);

    const agents = selectedGroup.agents || [];
    const discussAgents = agents.filter(a => a.role !== 'executor');
    const executors = agents.filter(a => a.role === 'executor');
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

      if (execResult?.auto_score != null) {
        agentScores.push({
          agent_id: assignment.agent_id,
          name: agentInfo?.name || assignment.agent_id,
          score: execResult.auto_score,
          capability: execResult.capability || '',
          success: execSuccess,
        });
      }

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

    const resultContent = results.join('\n\n---\n\n');
    await submitTaskResult(taskId, resultContent);

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

  const handleSubmitScore = async () => {
    if (!scoringTaskId || !scorerAgentId || !selectedGroup) return;

    const scorer = getAgentById(scorerAgentId);
    const result = await submitScore(scoringTaskId, scorerAgentId, scoreValue, scoreReason, scoreCapability);

    if (result) {
      setMessages(prev => [...prev, {
        id: `score-${scorerAgentId}-${Date.now()}`, role: 'agent',
        agent_id: scorerAgentId, agent_name: scorer?.name || scorerAgentId,
        agent_role: scorer?.role || 'verifier',
        content: `评分: ${scoreValue}/10\n能力维度: ${scoreCapability}\n理由: ${scoreReason}`,
        timestamp: new Date(),
        intent: 'score' as const,
      }]);

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

      setScoreReason('');
      setScoreCapability('');
      setScorerAgentId('');

      if (activeTaskReview && activeTaskReview.scores.length + 1 >= (selectedGroup.agents?.length || 0)) {
        setScoringTaskId(null);
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !selectedGroup || sendingMessage || discussionLoading) return;
    const text = input.trim();

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

    if (target === 'all' && isTaskLikeMessage(text)) {
      await runDiscussionFlow(text);
      return;
    }

    setSendingMessage(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/api/ai-groups/${selectedGroup.id}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ goal: text, target_agent: target }),
      });
      const data = await res.json();

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

  const filteredAgentsForMention = (selectedGroup?.agents || []).filter(a =>
    a.name.toLowerCase().includes(mentionFilter) || a.agent_id.toLowerCase().includes(mentionFilter)
  );

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showMention) {
      const items = [{ name: 'all', agent_id: 'all' }, ...filteredAgentsForMention];
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => (i + 1) % items.length); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => (i - 1 + items.length) % items.length); }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(items[mentionIndex]); }
      else if (e.key === 'Escape') { setShowMention(false); }
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // Auto-select first group if none selected
  useEffect(() => {
    if (!selectedGroup && groups.length > 0) {
      selectGroup(groups[0]);
    }
  }, [selectedGroup, groups, selectGroup]);

  return (
    <div className="flex flex-1 flex-col min-h-0 relative">
      {/* Chat header */}
      <div className="h-12 border-b border-border flex items-center px-2 lg:px-4 justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={(e) => { e.stopPropagation(); toggleSidebar(); }} className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation" aria-label="Toggle Sidebar">
            <PanelLeft className="w-4 h-4" />
          </button>
          <Users className="w-4 h-4 text-primary" />
          <span className="font-medium text-xs lg:text-sm">{selectedGroup?.name || t('aiGroups.selectGroup')}</span>
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
          {selectedGroup && (
            <button onClick={(e) => { e.stopPropagation(); setShowGroupPanel(true); }} className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation" aria-label="Group Settings">
              <Settings className="w-4 h-4" />
            </button>
          )}
          <button onClick={(e) => { e.stopPropagation(); toggleRightPanel(); }} className="shrink-0 p-2 hover:bg-muted/50 active:bg-muted transition-colors text-muted-foreground touch-manipulation" aria-label="Toggle Workspace">
            <PanelRightOpen className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 lg:px-6 py-4 space-y-4">
        {!selectedGroup && (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-4 opacity-40" />
            <p className="text-xs lg:text-sm">{t("aiGroups.selectOrCreateGroup")}</p>
          </div>
        )}
        {selectedGroup && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-primary" />
            </div>
            <h3 className="text-lg font-semibold mb-2">{selectedGroup.name}</h3>
            <p className="text-xs lg:text-sm text-muted-foreground mb-4">{selectedGroup.description || t('aiGroups.multiAgentGroup')}</p>
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
              <div className={`max-w-[85%] lg:max-w-[70%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                {msg.role === 'agent' && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium">{msg.agent_name || 'Agent'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${ROLE_BG_COLORS[msg.agent_role || 'executor']} ${ROLE_COLORS[msg.agent_role || 'executor']}`}>
                      {msg.agent_role || 'executor'}
                    </span>
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
                <div className={`rounded-xl px-2 lg:px-4 py-2.5 text-xs lg:text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground rounded-tr-sm' : 'bg-muted rounded-tl-sm'}`}>
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
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><Bot className="w-4 h-4 text-primary" /></div>
            <div className="bg-muted rounded-xl px-2 lg:px-4 py-2.5"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          </div>
        )}
        {discussionLoading && (
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="w-8 h-8 rounded-full bg-violet-500/10 flex items-center justify-center"><MessageCircle className="w-4 h-4 text-violet-400" /></div>
            <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl px-2 lg:px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                <span className="text-xs lg:text-sm text-violet-400">讨论中...</span>
              </div>
            </div>
          </div>
        )}

        {/* Scoring UI */}
        {scoringTaskId && activeTaskReview && (
          <div className="mx-auto max-w-lg bg-muted/50 border border-border rounded-xl p-3 lg:p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Award className="w-4 h-4 text-amber-400" />
              <span className="text-xs lg:text-sm font-medium">任务评审</span>
              {activeTaskReview.avg_score > 0 && (
                <span className="ml-auto text-xs lg:text-sm font-bold text-amber-400">
                  平均分: {activeTaskReview.avg_score.toFixed(1)}/10
                </span>
              )}
            </div>

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
                  <span className="text-xs lg:text-sm font-bold w-6 text-center">{scoreValue}</span>
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
        <div className="border-t border-border p-3 lg:p-4 shrink-0">
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
                className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-xs lg:text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />

              {/* @mention dropdown */}
              {showMention && (
                <div className="absolute bottom-full left-0 mb-1 w-56 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-50">
                  <div className="p-1">
                    <button onClick={() => insertMention({ name: 'all', agent_id: 'all' })}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs lg:text-sm hover:bg-muted transition-colors ${mentionIndex === 0 ? 'bg-muted' : ''}`}>
                      <AtSign className="w-3.5 h-3.5 text-muted-foreground" />
                      <span>{t("aiGroups.everyone")}</span>
                    </button>
                    {filteredAgentsForMention.map((a, i) => {
                      const Icon = ROLE_ICONS[a.role] || Bot;
                      return (
                        <button key={a.agent_id} onClick={() => insertMention(a)}
                          className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs lg:text-sm hover:bg-muted transition-colors ${mentionIndex === i + 1 ? 'bg-muted' : ''}`}>
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
              className="px-3 lg:px-4 py-2.5 lg:py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 touch-manipulation">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Scoring Modal */}
      {scoringTaskId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs lg:text-sm font-semibold flex items-center gap-2">
                <Star className="w-4 h-4 text-amber-400" /> 任务评分
              </h3>
              <button onClick={() => setScoringTaskId(null)} className="p-1 rounded hover:bg-muted">
                <span className="text-muted-foreground">✕</span>
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">评分Agent</label>
              <select value={scorerAgentId} onChange={e => setScorerAgentId(e.target.value)}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="">选择评分者...</option>
                {(selectedGroup?.agents || []).map(a => (
                  <option key={a.agent_id} value={a.agent_id}>{a.name} ({a.role})</option>
                ))}
              </select>
            </div>

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

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">能力维度</label>
              <input value={scoreCapability} onChange={e => setScoreCapability(e.target.value)}
                placeholder="e.g. coding, reasoning, collaboration"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary" />
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">评分理由</label>
              <textarea value={scoreReason} onChange={e => setScoreReason(e.target.value)}
                placeholder="说明评分依据..."
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-xs lg:text-sm focus:outline-none focus:ring-1 focus:ring-primary resize-none" />
            </div>

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
              className="w-full px-2 lg:px-4 py-2.5 bg-primary text-primary-foreground rounded-lg text-xs lg:text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
              提交评分
            </button>
          </div>
        </div>
      )}

      {/* Group Management — Sheet on mobile, modal on desktop */}
      {isMobile ? (
        <Sheet open={showGroupPanel && !!selectedGroup} onOpenChange={setShowGroupPanel}>
          <SheetContent side="right" size="md" className="p-0 flex flex-col">
            <SheetHeader className="h-12 shrink-0 flex flex-row items-center px-3 border-b border-border">
              <SheetTitle className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4" />
                {t("aiGroups.groupManagement", "群组管理")}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-4">
              <AIGroupsWorkspace />
            </div>
          </SheetContent>
        </Sheet>
      ) : (
        showGroupPanel && selectedGroup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Settings className="w-4 h-4" /> {t("aiGroups.groupManagement", "群组管理")}
                </h3>
                <button onClick={() => setShowGroupPanel(false)} className="p-1 rounded hover:bg-muted">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                <AIGroupsWorkspace />
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}

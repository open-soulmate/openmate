"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  GitBranch, RefreshCw, Play, Trash2, ChevronRight,
  Clock, Cpu, Hash, Filter, Search, XCircle, CheckCircle,
  Loader2, Copy, Eye, ArrowLeft, Layers,
} from "lucide-react";

interface TrajectorySession {
  id: string;
  agent_id: string;
  task_description: string;
  status: string;
  forked_from: string | null;
  total_events: number;
  total_tokens: number;
  total_duration_ms: number;
  tags: string[];
  created_at: string;
  ended_at: string | null;
}

interface TrajectoryStep {
  step: number;
  event_id: string;
  type: string;
  agent_id: string;
  content: string;
  metadata: Record<string, unknown>;
  token_usage: number;
  duration_ms: number;
  status: string;
  timestamp: string;
}

interface ReplayData {
  session_id: string;
  session: TrajectorySession;
  steps: TrajectoryStep[];
  total_steps: number;
}

const EVENT_COLORS: Record<string, string> = {
  session_start: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  session_end: "bg-slate-500/10 text-slate-400 border-slate-500/20",
  user_input: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  llm_call: "bg-violet-500/10 text-violet-500 border-violet-500/20",
  llm_response: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  tool_call: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  tool_result: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  agent_dispatch: "bg-cyan-500/10 text-cyan-500 border-cyan-500/20",
  agent_result: "bg-teal-500/10 text-teal-500 border-teal-500/20",
  error: "bg-red-500/10 text-red-500 border-red-500/20",
  checkpoint: "bg-green-500/10 text-green-500 border-green-500/20",
  branch: "bg-pink-500/10 text-pink-500 border-pink-500/20",
  custom: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  running: { bg: "bg-blue-500/10", text: "text-blue-500" },
  completed: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  failed: { bg: "bg-red-500/10", text: "text-red-500" },
  forked: { bg: "bg-pink-500/10", text: "text-pink-500" },
};

export function TrajectoryClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();

  // ── State ──
  const [sessions, setSessions] = useState<TrajectorySession[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterAgent, setFilterAgent] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");

  // Detail view
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [replayData, setReplayData] = useState<ReplayData | null>(null);
  const [replayStep, setReplayStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);

  // New session form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newAgentId, setNewAgentId] = useState("");
  const [newTask, setNewTask] = useState("");
  const [newTags, setNewTags] = useState("");

  // Fork
  const [forkEventId, setForkEventId] = useState<string | null>(null);

  // ── Fetch ──
  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set("status", filterStatus);
      if (filterAgent) params.set("agent_id", filterAgent);
      const res = await fetch(`${apiBase}/api/trajectory/sessions?${params}`);
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions || []);
      }
    } catch {} finally {
      setLoading(false);
    }
  }, [apiBase, filterStatus, filterAgent]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/trajectory/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchReplay = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/trajectory/sessions/${sessionId}/replay`);
      if (res.ok) setReplayData(await res.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchSessions();
    fetchStats();
  }, [fetchSessions, fetchStats]);

  useEffect(() => {
    if (selectedSession) fetchReplay(selectedSession);
  }, [selectedSession, fetchReplay]);

  // Auto-play
  useEffect(() => {
    if (!autoPlay || !replayData) return;
    if (replayStep >= replayData.total_steps - 1) {
      setAutoPlay(false);
      return;
    }
    const timer = setTimeout(() => setReplayStep((s) => s + 1), 1500);
    return () => clearTimeout(timer);
  }, [autoPlay, replayStep, replayData]);

  // ── Actions ──
  const handleCreateSession = async () => {
    try {
      const res = await fetch(`${apiBase}/api/trajectory/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent_id: newAgentId,
          task_description: newTask,
          tags: newTags.split(",").map((t) => t.trim()).filter(Boolean),
        }),
      });
      if (res.ok) {
        setShowNewForm(false);
        setNewAgentId("");
        setNewTask("");
        setNewTags("");
        fetchSessions();
        fetchStats();
      }
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this session and all its events?")) return;
    try {
      await fetch(`${apiBase}/api/trajectory/sessions/${id}`, { method: "DELETE" });
      if (selectedSession === id) {
        setSelectedSession(null);
        setReplayData(null);
      }
      fetchSessions();
      fetchStats();
    } catch {}
  };

  const handleFork = async (sessionId: string, eventId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/trajectory/sessions/${sessionId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fork_point_event_id: eventId }),
      });
      if (res.ok) {
        const data = await res.json();
        setForkEventId(null);
        setSelectedSession(data.id);
        fetchSessions();
        fetchStats();
      }
    } catch {}
  };

  const handleEndSession = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/trajectory/sessions/${id}/end?status=completed`, { method: "POST" });
      fetchSessions();
    } catch {}
  };

  // ── Views ──
  if (selectedSession && replayData) {
    const session = replayData.session;
    const currentStep = replayData.steps[replayStep];
    const badge = STATUS_BADGES[session.status] || STATUS_BADGES.running;

    return (
      <div className="flex h-full flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <button onClick={() => { setSelectedSession(null); setReplayData(null); setReplayStep(0); setAutoPlay(false); }}
              className="rounded-lg p-1.5 hover:bg-muted">
              <ArrowLeft size={18} />
            </button>
            <GitBranch size={20} className="text-indigo-500" />
            <h1 className="text-lg font-semibold truncate max-w-md">{session.task_description || session.id}</h1>
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.bg, badge.text)}>
              {session.status}
            </span>
            {session.forked_from && (
              <span className="rounded-full bg-pink-500/10 px-2 py-0.5 text-xs text-pink-500">Fork</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              Step {replayStep + 1} / {replayData.total_steps}
            </span>
            <button onClick={() => setReplayStep(Math.max(0, replayStep - 1))}
              disabled={replayStep === 0}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30">
              ← Prev
            </button>
            <button onClick={() => setAutoPlay(!autoPlay)}
              className={cn("rounded-lg border px-2 py-1 text-xs",
                autoPlay ? "border-red-500 bg-red-500/10 text-red-500" : "border-border hover:bg-muted")}>
              {autoPlay ? "⏸ Pause" : "▶ Play"}
            </button>
            <button onClick={() => setReplayStep(Math.min(replayData.total_steps - 1, replayStep + 1))}
              disabled={replayStep >= replayData.total_steps - 1}
              className="rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted disabled:opacity-30">
              Next →
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Timeline sidebar */}
          <div className="w-64 border-r border-border overflow-y-auto p-3 space-y-1">
            {replayData.steps.map((step, i) => {
              const color = EVENT_COLORS[step.type] || EVENT_COLORS.custom;
              return (
                <button key={step.event_id}
                  onClick={() => setReplayStep(i)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                    i === replayStep ? "bg-indigo-500/10 border border-indigo-500/30" : "hover:bg-muted",
                  )}>
                  <span className="w-5 text-right text-muted-foreground font-mono">{step.step}</span>
                  <span className={cn("rounded px-1.5 py-0.5 text-[10px] border", color)}>
                    {step.type}
                  </span>
                  <span className="truncate flex-1 text-muted-foreground">
                    {step.content?.slice(0, 30) || "—"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          <div className="flex-1 overflow-y-auto p-6">
            {currentStep ? (
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-muted-foreground">#{currentStep.step}</span>
                  <span className={cn("rounded-lg px-2 py-1 text-sm border",
                    EVENT_COLORS[currentStep.type] || EVENT_COLORS.custom)}>
                    {currentStep.type}
                  </span>
                  {currentStep.agent_id && (
                    <span className="text-xs text-muted-foreground">Agent: {currentStep.agent_id}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    <Clock size={12} className="inline mr-1" />
                    {new Date(currentStep.timestamp).toLocaleString("zh-CN")}
                  </span>
                </div>

                {currentStep.content && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">Content</h3>
                    <pre className="whitespace-pre-wrap text-sm font-mono">{currentStep.content}</pre>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-4">
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs text-muted-foreground">Tokens</span>
                    <p className="text-lg font-bold">{currentStep.token_usage.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs text-muted-foreground">Duration</span>
                    <p className="text-lg font-bold">{currentStep.duration_ms.toFixed(0)}ms</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card p-3">
                    <span className="text-xs text-muted-foreground">Status</span>
                    <p className={cn("text-lg font-bold",
                      currentStep.status === "ok" ? "text-emerald-500" : "text-red-500")}>
                      {currentStep.status}
                    </p>
                  </div>
                </div>

                {Object.keys(currentStep.metadata).length > 0 && (
                  <div className="rounded-xl border border-border bg-card p-5">
                    <h3 className="text-xs font-medium text-muted-foreground mb-2">Metadata</h3>
                    <pre className="whitespace-pre-wrap text-xs font-mono text-muted-foreground">
                      {JSON.stringify(currentStep.metadata, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Fork button */}
                <button onClick={() => handleFork(session.id, currentStep.event_id)}
                  className="flex items-center gap-2 rounded-lg border border-pink-500/30 bg-pink-500/5 px-4 py-2 text-sm text-pink-500 hover:bg-pink-500/10">
                  <GitBranch size={14} /> Fork from this step
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Layers size={40} className="mb-3 opacity-30" />
                <p className="text-sm">No events in this session</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Session List View ──
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <GitBranch size={20} className="text-indigo-500" />
          <h1 className="text-lg font-semibold">{t("trajectory.title") || "轨迹 · Agent执行追踪"}</h1>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
            {t("trajectory.subtitle") || "全链路追踪 · 回放 · 分叉"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { fetchSessions(); fetchStats(); }}
            className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
            <RefreshCw size={14} /> {t("common.refresh") || "刷新"}
          </button>
          <button onClick={() => setShowNewForm(!showNewForm)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-1.5 text-sm text-white hover:bg-indigo-600">
            + {t("trajectory.newSession") || "新建会话"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: t("trajectory.totalSessions") || "总会话", value: stats.total_sessions || 0, icon: Layers },
            { label: t("trajectory.running") || "运行中", value: stats.running_sessions || 0, icon: Loader2 },
            { label: t("trajectory.totalEvents") || "总事件", value: stats.total_events || 0, icon: Hash },
            { label: t("trajectory.totalTokens") || "总Token", value: stats.total_tokens || 0, icon: Cpu },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <stat.icon size={14} className="text-indigo-500" />
                <span className="text-xs text-muted-foreground">{stat.label}</span>
              </div>
              <p className="text-xl font-bold">{stat.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm">
            <option value="">{t("trajectory.allStatus") || "所有状态"}</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>
          <input value={filterAgent} onChange={(e) => setFilterAgent(e.target.value)}
            placeholder={t("trajectory.filterAgent") || "Filter by agent..."}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm w-48" />
        </div>

        {/* New session form */}
        {showNewForm && (
          <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-5 space-y-3">
            <h3 className="text-sm font-medium">{t("trajectory.createSession") || "创建轨迹会话"}</h3>
            <div className="grid grid-cols-2 gap-3">
              <input value={newAgentId} onChange={(e) => setNewAgentId(e.target.value)}
                placeholder={t("trajectory.agentId") || "Agent ID"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={newTags} onChange={(e) => setNewTags(e.target.value)}
                placeholder={t("trajectory.tags") || "Tags (comma separated)"} className="rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <input value={newTask} onChange={(e) => setNewTask(e.target.value)}
              placeholder={t("trajectory.taskDesc") || "Task description"} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={handleCreateSession}
                className="rounded-lg bg-indigo-500 px-4 py-2 text-sm text-white hover:bg-indigo-600">
                {t("common.create") || "创建"}
              </button>
              <button onClick={() => setShowNewForm(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
                {t("common.cancel") || "取消"}
              </button>
            </div>
          </div>
        )}

        {/* Sessions table */}
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("trajectory.task") || "任务"}</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("trajectory.agent") || "Agent"}</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("trajectory.status") || "状态"}</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">{t("trajectory.events") || "事件"}</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">{t("trajectory.tokens") || "Token"}</th>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t("trajectory.createdAt") || "创建时间"}</th>
                <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">{t("common.actions") || "操作"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 size={20} className="animate-spin inline mr-2" /> Loading...
                </td></tr>
              ) : sessions.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                  {t("trajectory.noSessions") || "暂无轨迹会话"}
                </td></tr>
              ) : sessions.map((s) => {
                const badge = STATUS_BADGES[s.status] || STATUS_BADGES.running;
                return (
                  <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <button onClick={() => setSelectedSession(s.id)} className="text-left hover:text-indigo-500 transition-colors">
                        <div className="font-medium truncate max-w-xs">{s.task_description || s.id}</div>
                        {s.tags.length > 0 && (
                          <div className="flex gap-1 mt-0.5">
                            {s.tags.slice(0, 3).map((tag) => (
                              <span key={tag} className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{tag}</span>
                            ))}
                          </div>
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono">{s.agent_id || "—"}</td>
                    <td className="px-4 py-2.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", badge.bg, badge.text)}>
                        {s.status}
                      </span>
                      {s.forked_from && (
                        <span className="ml-1 rounded bg-pink-500/10 px-1 py-0.5 text-[10px] text-pink-500">fork</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{s.total_events}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-xs">{s.total_tokens.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">
                      {new Date(s.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => setSelectedSession(s.id)}
                          className="rounded p-1.5 hover:bg-muted" title="Replay">
                          <Play size={14} />
                        </button>
                        {s.status === "running" && (
                          <button onClick={() => handleEndSession(s.id)}
                            className="rounded p-1.5 hover:bg-muted" title="End session">
                            <CheckCircle size={14} />
                          </button>
                        )}
                        <button onClick={() => handleDelete(s.id)}
                          className="rounded p-1.5 hover:bg-muted text-red-500" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

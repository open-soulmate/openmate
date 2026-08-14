"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Activity, RefreshCw, GitBranch, Play, ChevronRight,
  Clock, Zap, AlertCircle, CheckCircle, Loader2,
  ArrowRight, RotateCcw, Eye, Layers,
} from "lucide-react";

interface TrajectorySession {
  id: string;
  agent_id: string;
  task_description: string;
  status: string;
  total_events: number;
  total_tokens: number;
  created_at: string;
  ended_at: string | null;
}

interface TrajectoryEvent {
  id: number;
  session_id: string;
  agent_id: string;
  event_type: string;
  content: string;
  metadata: string | null;
  timestamp: string;
}

const EVENT_COLORS: Record<string, { bg: string; border: string; text: string; icon: React.ElementType }> = {
  input:      { bg: "bg-blue-500/5",    border: "border-l-blue-500",    text: "text-blue-500",    icon: ArrowRight },
  thinking:   { bg: "bg-yellow-500/5",  border: "border-l-yellow-500",  text: "text-yellow-500",  icon: Loader2 },
  tool_call:  { bg: "bg-purple-500/5",  border: "border-l-purple-500",  text: "text-purple-500",  icon: Zap },
  tool_result:{ bg: "bg-cyan-500/5",    border: "border-l-cyan-500",    text: "text-cyan-500",    icon: CheckCircle },
  output:     { bg: "bg-green-500/5",   border: "border-l-green-500",   text: "text-green-500",   icon: CheckCircle },
  error:      { bg: "bg-red-500/5",     border: "border-l-red-500",     text: "text-red-500",     icon: AlertCircle },
};

const STATUS_STYLES: Record<string, string> = {
  running:   "bg-primary/10 text-primary",
  completed: "bg-green-500/10 text-green-500",
  failed:    "bg-red-500/10 text-red-500",
  forked:    "bg-purple-500/10 text-purple-500",
};

export function TrajectoryClient() {
  const apiBase = getApiBaseUrl();
  const [sessions, setSessions] = useState<TrajectorySession[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [events, setEvents] = useState<TrajectoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [eventsLoading, setEventsLoading] = useState(false);
  const [forking, setForking] = useState(false);
  const [forkResult, setForkResult] = useState<string | null>(null);
  const [replayFrom, setReplayFrom] = useState<number | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/trajectory/sessions`);
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [apiBase]);

  const fetchEvents = useCallback(async (sessionId: string, fromEvent?: number) => {
    setEventsLoading(true);
    try {
      let url = `${apiBase}/api/trajectory/sessions/${sessionId}`;
      if (fromEvent !== undefined) {
        url = `${apiBase}/api/trajectory/sessions/${sessionId}/replay?from=${fromEvent}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setEvents(data.events || []);
    } catch { /* ignore */ }
    setEventsLoading(false);
  }, [apiBase]);

  const handleFork = useCallback(async (sessionId: string, eventId: number) => {
    setForking(true);
    setForkResult(null);
    try {
      const res = await fetch(`${apiBase}/api/trajectory/sessions/${sessionId}/fork`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fork_point_event_id: String(eventId) }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setForkResult(`已创建分叉会话: ${data.new_session_id || data.id || "success"}`);
      fetchSessions();
    } catch (e: any) {
      setForkResult(`分叉失败: ${e.message}`);
    } finally {
      setForking(false);
    }
  }, [apiBase, fetchSessions]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  useEffect(() => {
    if (selectedSession) fetchEvents(selectedSession, replayFrom ?? undefined);
  }, [selectedSession, replayFrom, fetchEvents]);

  const selectedMeta = sessions.find(s => s.id === selectedSession);

  return (
    <div className="flex h-full overflow-hidden">
      {/* ── Left: Session List ─────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Activity size={17} className="text-primary" />
            轨迹追踪
          </h2>
          <button
            onClick={fetchSessions}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
          >
            <RefreshCw size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={20} className="animate-spin text-primary" />
            </div>
          ) : sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
              <Activity size={32} className="mb-3 opacity-40" />
              <p className="text-sm">暂无轨迹会话</p>
            </div>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => { setSelectedSession(s.id); setReplayFrom(null); setForkResult(null); }}
                className={cn(
                  "w-full text-left rounded-lg p-3 transition-colors border",
                  selectedSession === s.id
                    ? "border-primary/30 bg-primary/5"
                    : "border-transparent hover:bg-muted/50"
                )}
              >
                <p className="text-sm font-medium truncate">{s.task_description || s.agent_id}</p>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", STATUS_STYLES[s.status] || "bg-muted text-muted-foreground")}>
                    {s.status}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{s.total_events} 事件</span>
                  {s.total_tokens > 0 && (
                    <span className="text-[11px] text-muted-foreground">{(s.total_tokens / 1000).toFixed(1)}k tok</span>
                  )}
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(s.created_at).toLocaleString()}
                </p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Right: Event Timeline ──────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!selectedSession ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground">
            <Layers size={40} className="mb-3 opacity-30" />
            <p className="text-sm">选择左侧会话查看轨迹</p>
          </div>
        ) : (
          <>
            {/* Session header */}
            <div className="border-b border-border px-6 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium">{selectedMeta?.task_description || selectedMeta?.agent_id || selectedSession}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {selectedMeta?.agent_id && <span className="mr-3">Agent: {selectedMeta.agent_id}</span>}
                    {selectedMeta?.total_events} 事件 · {selectedMeta?.total_tokens ? `${(selectedMeta.total_tokens / 1000).toFixed(1)}k tokens` : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {replayFrom !== null && (
                    <button
                      onClick={() => setReplayFrom(null)}
                      className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <RotateCcw size={12} />
                      完整视图
                    </button>
                  )}
                  <button
                    onClick={() => fetchEvents(selectedSession!, replayFrom ?? undefined)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw size={12} />
                    刷新
                  </button>
                </div>
              </div>
              {forkResult && (
                <div className={cn("mt-2 rounded-lg px-3 py-2 text-xs", forkResult.includes("失败") ? "bg-red-500/10 text-red-500" : "bg-green-500/10 text-green-500")}>
                  {forkResult}
                </div>
              )}
            </div>

            {/* Events */}
            <div className="flex-1 overflow-y-auto p-6">
              {eventsLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-primary" />
                </div>
              ) : events.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
                  <Activity size={32} className="mb-3 opacity-40" />
                  <p className="text-sm">无事件记录</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev, idx) => {
                    const style = EVENT_COLORS[ev.event_type] || EVENT_COLORS.output;
                    const Icon = style.icon;
                    return (
                      <div
                        key={ev.id || idx}
                        className={cn("rounded-lg border-l-[3px] p-4 group", style.bg, style.border)}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={14} className={cn(style.text, ev.event_type === "thinking" && "animate-spin")} />
                          <span className={cn("rounded px-2 py-0.5 text-[11px] font-medium border", style.text, `border-current/30`)}>
                            {ev.event_type}
                          </span>
                          <span className="text-[11px] text-muted-foreground ml-auto flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(ev.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <pre className="whitespace-pre-wrap break-words text-xs leading-relaxed max-h-40 overflow-auto font-mono text-foreground/90">
                          {ev.content}
                        </pre>
                        {/* Actions per event */}
                        <div className="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => handleFork(selectedSession!, ev.id)}
                            disabled={forking}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors disabled:opacity-50"
                          >
                            <GitBranch size={11} />
                            分叉从此处
                          </button>
                          <button
                            onClick={() => setReplayFrom(ev.id)}
                            className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                          >
                            <Eye size={11} />
                            从此回放
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

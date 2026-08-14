"use client";
import { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Brain, GitBranch, Users, Lightbulb, Loader2,
  ChevronRight, Play, RotateCcw, Zap, Target,
  ArrowDown, CheckCircle2, Circle, AlertCircle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────

interface TaskItem {
  index: number;
  description: string;
  dependencies: number[];
  priority: number;
}

interface PlanResult {
  goal: string;
  tasks: TaskItem[];
}

interface AgentStep {
  role: string;
  output: string;
}

interface AgentResult {
  topic: string;
  steps: AgentStep[];
  final_output: string;
}

interface ThinkResult {
  question: string;
  reasoning_steps: string[];
  answer: string;
  confidence: number;
}

type TabId = "plan" | "agent" | "think";

const PRIORITY_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: "高", color: "text-red-500 bg-red-500/10" },
  2: { label: "中", color: "text-yellow-500 bg-yellow-500/10" },
  3: { label: "低", color: "text-green-500 bg-green-500/10" },
};

// ── Component ────────────────────────────────────────────

export function CortexClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const [tab, setTab] = useState<TabId>("plan");

  // Plan state
  const [planGoal, setPlanGoal] = useState("");
  const [planResult, setPlanResult] = useState<PlanResult | null>(null);
  const [planLoading, setPlanLoading] = useState(false);

  // Agent state
  const [agentTopic, setAgentTopic] = useState("");
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);

  // Think state
  const [thinkQuestion, setThinkQuestion] = useState("");
  const [thinkContext, setThinkContext] = useState("");
  const [thinkResult, setThinkResult] = useState<ThinkResult | null>(null);
  const [thinkLoading, setThinkLoading] = useState(false);

  const [error, setError] = useState("");

  // ── API calls ────────────────────────────────────────

  const handlePlan = useCallback(async () => {
    if (!planGoal.trim()) return;
    setPlanLoading(true);
    setError("");
    setPlanResult(null);
    try {
      const res = await fetch(`${apiBase}/api/cortex/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ goal: planGoal }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setPlanResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlanLoading(false);
    }
  }, [planGoal, apiBase]);

  const handleAgent = useCallback(async () => {
    if (!agentTopic.trim()) return;
    setAgentLoading(true);
    setError("");
    setAgentResult(null);
    try {
      const res = await fetch(`${apiBase}/api/cortex/agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: agentTopic }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setAgentResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAgentLoading(false);
    }
  }, [agentTopic, apiBase]);

  const handleThink = useCallback(async () => {
    if (!thinkQuestion.trim()) return;
    setThinkLoading(true);
    setError("");
    setThinkResult(null);
    try {
      const res = await fetch(`${apiBase}/api/cortex/think`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: thinkQuestion, context: thinkContext }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `HTTP ${res.status}`);
      }
      setThinkResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setThinkLoading(false);
    }
  }, [thinkQuestion, thinkContext, apiBase]);

  // ── Tab config ───────────────────────────────────────

  const tabs: { id: TabId; label: string; icon: React.ElementType; desc: string }[] = [
    { id: "plan", label: "任务规划", icon: GitBranch, desc: "将复杂目标分解为子任务" },
    { id: "agent", label: "多Agent协作", icon: Users, desc: "研究→分析→写作流水线" },
    { id: "think", label: "链式推理", icon: Lightbulb, desc: "深度思考与自我反思" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Brain size={18} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">OpenCortex</h1>
          <p className="text-xs text-muted-foreground">大脑皮层 · 高级认知、任务规划、多Agent协作推理</p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border px-6 py-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => { setTab(t.id); setError(""); }}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-sm transition-colors",
              tab === t.id
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            <t.icon size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-500">
            <AlertCircle size={16} />
            {error}
          </div>
        )}

        {/* ── Plan Tab ───────────────────────────────── */}
        {tab === "plan" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Target size={15} className="text-primary" />
                输入目标
              </h3>
              <textarea
                value={planGoal}
                onChange={(e) => setPlanGoal(e.target.value)}
                placeholder="描述一个复杂目标，例如：搭建一个企业知识管理系统..."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={3}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handlePlan}
                  disabled={planLoading || !planGoal.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {planLoading ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                  {planLoading ? "规划中..." : "开始规划"}
                </button>
                {planResult && (
                  <button
                    onClick={() => { setPlanResult(null); setPlanGoal(""); }}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw size={15} />
                    清除
                  </button>
                )}
              </div>
            </div>

            {planResult && (
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
                  <GitBranch size={15} className="text-primary" />
                  任务分解 · {planResult.tasks.length} 个子任务
                </h3>
                <div className="space-y-3">
                  {planResult.tasks.map((task, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 rounded-lg border border-border bg-background p-4"
                    >
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {task.index + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{task.description}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", PRIORITY_LABEL[task.priority]?.color)}>
                            {PRIORITY_LABEL[task.priority]?.label || `P${task.priority}`}
                          </span>
                          {task.dependencies.length > 0 && (
                            <span className="text-[11px] text-muted-foreground">
                              依赖: {task.dependencies.map(d => `#${d + 1}`).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {/* Dependency graph visualization */}
                {planResult.tasks.some(t => t.dependencies.length > 0) && (
                  <div className="mt-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
                    <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">依赖关系</p>
                    <div className="flex flex-wrap gap-3">
                      {planResult.tasks.map((task, i) => (
                        task.dependencies.length > 0 && (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {task.dependencies.map((dep) => (
                              <span key={dep} className="flex items-center gap-1">
                                <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-mono">#{dep + 1}</span>
                                <ChevronRight size={12} />
                              </span>
                            ))}
                            <span className="rounded bg-foreground/10 px-1.5 py-0.5 font-mono">#{i + 1}</span>
                          </div>
                        )
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Agent Tab ──────────────────────────────── */}
        {tab === "agent" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Users size={15} className="text-primary" />
                输入研究主题
              </h3>
              <textarea
                value={agentTopic}
                onChange={(e) => setAgentTopic(e.target.value)}
                placeholder="输入一个研究主题，例如：大语言模型在企业中的应用趋势..."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={3}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleAgent}
                  disabled={agentLoading || !agentTopic.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {agentLoading ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {agentLoading ? "Agent协作中..." : "启动流水线"}
                </button>
                {agentResult && (
                  <button
                    onClick={() => { setAgentResult(null); setAgentTopic(""); }}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw size={15} />
                    清除
                  </button>
                )}
              </div>
            </div>

            {agentResult && (
              <div className="space-y-4">
                <h3 className="flex items-center gap-2 text-sm font-medium">
                  <Zap size={15} className="text-primary" />
                  Agent流水线结果 · {agentResult.steps?.length || 0} 个步骤
                </h3>
                {/* Pipeline steps */}
                {agentResult.steps?.map((step, i) => {
                  const roleColors: Record<string, string> = {
                    researcher: "bg-blue-500/10 text-blue-500 border-blue-500/30",
                    analyzer: "bg-purple-500/10 text-purple-500 border-purple-500/30",
                    writer: "bg-green-500/10 text-green-500 border-green-500/30",
                  };
                  const colorClass = roleColors[step.role?.toLowerCase()] || "bg-muted text-foreground border-border";
                  return (
                    <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
                      <div className={cn("flex items-center gap-2 border-b px-5 py-3", colorClass)}>
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-current/10 text-xs font-bold">
                          {i + 1}
                        </div>
                        <span className="text-sm font-medium capitalize">{step.role || `Step ${i + 1}`}</span>
                      </div>
                      <div className="px-5 py-4">
                        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{step.output}</p>
                      </div>
                    </div>
                  );
                })}
                {/* Final output */}
                {agentResult.final_output && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                    <h4 className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                      <CheckCircle2 size={15} />
                      最终输出
                    </h4>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed">{agentResult.final_output}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── Think Tab ──────────────────────────────── */}
        {tab === "think" && (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
                <Lightbulb size={15} className="text-primary" />
                输入问题
              </h3>
              <textarea
                value={thinkQuestion}
                onChange={(e) => setThinkQuestion(e.target.value)}
                placeholder="输入一个需要深度思考的问题..."
                className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={2}
              />
              <textarea
                value={thinkContext}
                onChange={(e) => setThinkContext(e.target.value)}
                placeholder="可选：提供额外上下文信息..."
                className="mt-2 w-full rounded-lg border border-border bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                rows={2}
              />
              <div className="mt-3 flex gap-2">
                <button
                  onClick={handleThink}
                  disabled={thinkLoading || !thinkQuestion.trim()}
                  className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                >
                  {thinkLoading ? <Loader2 size={15} className="animate-spin" /> : <Lightbulb size={15} />}
                  {thinkLoading ? "思考中..." : "深度推理"}
                </button>
                {thinkResult && (
                  <button
                    onClick={() => { setThinkResult(null); setThinkQuestion(""); setThinkContext(""); }}
                    className="flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RotateCcw size={15} />
                    清除
                  </button>
                )}
              </div>
            </div>

            {thinkResult && (
              <div className="space-y-4">
                {/* Reasoning chain */}
                <div className="rounded-xl border border-border bg-card p-5">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-medium">
                    <Lightbulb size={15} className="text-primary" />
                    推理链 · {thinkResult.reasoning_steps?.length || 0} 步
                  </h3>
                  <div className="space-y-3">
                    {thinkResult.reasoning_steps?.map((step, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="flex flex-col items-center">
                          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                            {i + 1}
                          </div>
                          {i < (thinkResult.reasoning_steps?.length || 0) - 1 && (
                            <div className="w-px h-6 bg-border mt-1" />
                          )}
                        </div>
                        <p className="flex-1 pt-0.5 text-sm leading-relaxed text-foreground/90">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Final answer */}
                <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="flex items-center gap-2 text-sm font-medium text-primary">
                      <CheckCircle2 size={15} />
                      结论
                    </h4>
                    {thinkResult.confidence !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">置信度</span>
                        <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${Math.round(thinkResult.confidence * 100)}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium text-primary">{Math.round(thinkResult.confidence * 100)}%</span>
                      </div>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{thinkResult.answer}</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

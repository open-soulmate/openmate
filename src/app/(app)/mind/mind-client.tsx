"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Smile, Brain, RefreshCw, Plus, Trash2, Check, Zap,
  Heart, Shield, Sparkles, Loader2, ChevronDown,
  MessageSquare, Frown, Laugh, Meh, AlertTriangle,
} from "lucide-react";

interface EmotionResult {
  primary_emotion: string;
  confidence: number;
  emotions: Record<string, number>;
  valence: number;
  arousal: number;
  sentiment: string;
  keywords: string[];
  elapsed_ms: number;
}

interface Personality {
  personality_id: string;
  name: string;
  description: string;
  tone: string;
  language_style: string;
  emoji_usage: string;
  response_length: string;
  traits: string[];
  builtin: boolean;
  usage_count: number;
}

const EMOTION_ICONS: Record<string, string> = {
  joy: "😊", sadness: "😢", anger: "😠", fear: "😨",
  surprise: "😲", trust: "🤝", anticipation: "期待", confusion: "困惑", neutral: "😐",
};

const EMOTION_COLORS: Record<string, string> = {
  joy: "text-emerald-500", sadness: "text-blue-500", anger: "text-red-500",
  fear: "text-amber-500", surprise: "text-purple-500", trust: "text-teal-500",
  anticipation: "text-orange-500", confusion: "text-gray-500", neutral: "text-slate-500",
};

export function MindClient() {
  const [tab, setTab] = useState<"emotion" | "personality">("emotion");
  const [loading, setLoading] = useState(false);

  // Emotion
  const [emotionText, setEmotionText] = useState("");
  const [emotionResult, setEmotionResult] = useState<EmotionResult | null>(null);

  // Personality
  const [personalities, setPersonalities] = useState<Personality[]>([]);
  const [activeId, setActiveId] = useState("default");
  const [showCreate, setShowCreate] = useState(false);
  const [newP, setNewP] = useState({ name: "", description: "", tone: "neutral",
    traits: "", system_prompt_suffix: "" });

  const apiBase = getApiBaseUrl();

  const fetchPersonalities = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/mind/personalities`);
      if (res.ok) {
        const data = await res.json();
        setPersonalities(data.personalities || []);
        setActiveId(data.active || "default");
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    if (tab === "personality") fetchPersonalities();
  }, [tab, fetchPersonalities]);

  const handleAnalyze = async () => {
    if (!emotionText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/mind/emotion/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: emotionText }),
      });
      if (res.ok) setEmotionResult(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const handleSetActive = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/mind/personalities/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ personality_id: id }),
      });
      setActiveId(id);
    } catch {}
  };

  const handleCreate = async () => {
    try {
      await fetch(`${apiBase}/api/mind/personalities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newP.name, description: newP.description, tone: newP.tone,
          traits: newP.traits.split(",").map(s => s.trim()).filter(Boolean),
          system_prompt_suffix: newP.system_prompt_suffix,
        }),
      });
      setShowCreate(false);
      setNewP({ name: "", description: "", tone: "neutral", traits: "", system_prompt_suffix: "" });
      fetchPersonalities();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/mind/personalities/${id}`, { method: "DELETE" });
      fetchPersonalities();
    } catch {}
  };

  const sentimentIcon = (s: string) => {
    if (s === "positive") return <Laugh size={16} className="text-emerald-500" />;
    if (s === "negative") return <Frown size={16} className="text-red-500" />;
    return <Meh size={16} className="text-gray-500" />;
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Brain size={20} className="text-violet-500" />
          <h1 className="text-lg font-semibold">心智 · 情绪与人格</h1>
          <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-500">
            识别 · 调节
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="flex gap-2">
          {[
            { id: "emotion" as const, label: "情绪识别", icon: Smile },
            { id: "personality" as const, label: "人格库", icon: Sparkles },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === t.id ? "bg-violet-500/10 text-violet-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Emotion Tab */}
        {tab === "emotion" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm">输入文本</h3>
                <textarea value={emotionText} onChange={(e) => setEmotionText(e.target.value)}
                  placeholder="输入要分析情绪的文本..."
                  rows={6} className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm resize-none" />
                <div className="flex justify-between">
                  <span className="text-xs text-muted-foreground">{emotionText.length} 字符</span>
                </div>
                <button onClick={handleAnalyze} disabled={loading || !emotionText.trim()}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm text-white hover:bg-violet-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  分析情绪
                </button>
              </div>

              {/* Quick samples */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-2">
                <h3 className="font-semibold text-sm">快速测试</h3>
                {[
                  "太棒了！这个功能终于实现了，我好开心！",
                  "这个bug让我非常头疼，已经折腾了一整天。",
                  "期待明天的发布会，希望一切顺利。",
                  "这个问题我不太理解，能再解释一下吗？",
                  "Thank you so much, this is amazing work!",
                ].map((s, i) => (
                  <button key={i} onClick={() => setEmotionText(s)}
                    className="w-full text-left rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted truncate">
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Result */}
            <div className="space-y-4">
              {emotionResult ? (
                <>
                  <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">主要情绪</h3>
                      <div className="flex items-center gap-2">
                        {sentimentIcon(emotionResult.sentiment)}
                        <span className="text-xs text-muted-foreground">{emotionResult.sentiment}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-4xl">{EMOTION_ICONS[emotionResult.primary_emotion] || "😐"}</span>
                      <div>
                        <p className={cn("text-lg font-bold", EMOTION_COLORS[emotionResult.primary_emotion] || "text-gray-500")}>
                          {emotionResult.primary_emotion}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          置信度 {(emotionResult.confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    </div>

                    {/* Emotion breakdown */}
                    <div className="space-y-2">
                      {Object.entries(emotionResult.emotions).slice(0, 6).map(([emotion, score]) => (
                        <div key={emotion} className="flex items-center gap-2">
                          <span className="text-sm w-4">{EMOTION_ICONS[emotion] || "•"}</span>
                          <span className="text-xs w-20 truncate">{emotion}</span>
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full bg-violet-500 transition-all"
                              style={{ width: `${score * 100}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-right">
                            {(score * 100).toFixed(0)}%
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Valence & Arousal */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <span className="text-xs text-muted-foreground">效价 (Valence)</span>
                        <p className={cn("text-lg font-bold", emotionResult.valence > 0 ? "text-emerald-500" : "text-red-500")}>
                          {emotionResult.valence > 0 ? "+" : ""}{emotionResult.valence.toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <span className="text-xs text-muted-foreground">唤醒度 (Arousal)</span>
                        <p className="text-lg font-bold text-amber-500">{emotionResult.arousal.toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Keywords */}
                    {emotionResult.keywords.length > 0 && (
                      <div>
                        <span className="text-xs text-muted-foreground">触发词</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {emotionResult.keywords.map((kw, i) => (
                            <span key={i} className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-600">
                              {kw}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Smile size={40} className="mb-3 opacity-30" />
                    <p className="text-sm">输入文本后点击分析</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Personality Tab */}
        {tab === "personality" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">当前人格: <strong>{activeId}</strong></span>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-sm text-white hover:bg-violet-600">
                <Plus size={14} /> 创建人格
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {personalities.map((p) => (
                <div key={p.personality_id}
                  className={cn(
                    "rounded-xl border bg-card p-5 space-y-3 transition-all hover:shadow-md",
                    activeId === p.personality_id ? "border-violet-500 ring-1 ring-violet-500" : "border-border"
                  )}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                    {activeId === p.personality_id && (
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-600">当前</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {p.traits.map((trait) => (
                      <span key={trait} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{trait}</span>
                    ))}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between"><span>语气</span><span>{p.tone}</span></div>
                    <div className="flex justify-between"><span>长度</span><span>{p.response_length}</span></div>
                    <div className="flex justify-between"><span>Emoji</span><span>{p.emoji_usage}</span></div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleSetActive(p.personality_id)}
                      className={cn("flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors",
                        activeId === p.personality_id
                          ? "bg-violet-500 text-white"
                          : "bg-violet-500/10 text-violet-600 hover:bg-violet-500/20")}>
                      {activeId === p.personality_id ? <Check size={12} /> : <Zap size={12} />}
                      {activeId === p.personality_id ? "使用中" : "切换"}
                    </button>
                    {!p.builtin && (
                      <button onClick={() => handleDelete(p.personality_id)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Personality Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold">创建人格</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">名称</label>
                <input value={newP.name} onChange={(e) => setNewP({ ...newP, name: e.target.value })}
                  placeholder="如：学术风格" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">描述</label>
                <input value={newP.description} onChange={(e) => setNewP({ ...newP, description: e.target.value })}
                  placeholder="这个人格的特点" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">语气</label>
                <select value={newP.tone} onChange={(e) => setNewP({ ...newP, tone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                  <option value="neutral">中性</option>
                  <option value="friendly">友善</option>
                  <option value="professional">专业</option>
                  <option value="humorous">幽默</option>
                  <option value="empathetic">共情</option>
                  <option value="assertive">坚定</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">特质 (逗号分隔)</label>
                <input value={newP.traits} onChange={(e) => setNewP({ ...newP, traits: e.target.value })}
                  placeholder="耐心,专业,严谨" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">补充指令</label>
                <textarea value={newP.system_prompt_suffix} onChange={(e) => setNewP({ ...newP, system_prompt_suffix: e.target.value })}
                  placeholder="额外的系统提示词"
                  rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">取消</button>
              <button onClick={handleCreate} disabled={!newP.name}
                className="rounded-lg bg-violet-500 px-4 py-2 text-sm text-white hover:bg-violet-600 disabled:opacity-50">创建</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

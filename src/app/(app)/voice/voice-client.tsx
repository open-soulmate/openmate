"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Mic, Play, Pause, Square, Volume2, RefreshCw,
  Plus, Trash2, Settings, Download, Copy, Loader2,
  CheckCircle, Zap, FileAudio, ChevronDown, Languages,
} from "lucide-react";

interface VoiceProfile {
  profile_id: string;
  name: string;
  description: string;
  engine: string;
  voice_id: string;
  language: string;
  rate: string;
  pitch: string;
  volume: string;
  tags: string[];
  builtin: boolean;
  usage_count: number;
}

interface VoiceStats {
  backends: Record<string, boolean>;
  preferred_backend: string;
  total_synthesized: number;
  total_characters: number;
  cache_hits: number;
  errors: number;
  cache: { entries: number; size_bytes: number; max_size_bytes: number };
  total_profiles: number;
  builtin_count: number;
  user_count: number;
}

interface OutputFile {
  filename: string;
  size_bytes: number;
  created_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

const LANGUAGES = [
  { code: '', label: t('voice.allLanguages') },
  { code: 'zh', label: t('voice.chinese') },
  { code: "en", label: "English" },
  { code: 'ja', label: t('voice.t89176') },
  { code: "ko", label: "한국어" },
];

export function VoiceClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"synthesize" | "profiles" | "outputs">("synthesize");
  const [stats, setStats] = useState<VoiceStats | null>(null);
  const [profiles, setProfiles] = useState<VoiceProfile[]>([]);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Synthesis form
  const [text, setText] = useState("");
  const [selectedProfile, setSelectedProfile] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [rate, setRate] = useState("+0%");
  const [pitch, setPitch] = useState("+0Hz");
  const [saveOutput, setSaveOutput] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Create profile form
  const [showCreate, setShowCreate] = useState(false);
  const [newProfile, setNewProfile] = useState({
    name: "", description: "", voice_id: "zh-CN-XiaoxiaoNeural",
    language: "zh-CN", rate: "+0%", pitch: "+0Hz", tags: [] as string[],
  });

  // Language filter
  const [langFilter, setLangFilter] = useState("");
  const [showLangMenu, setShowLangMenu] = useState(false);

  const apiBase = getApiBaseUrl();

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/voice/health`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchProfiles = useCallback(async () => {
    try {
      const params = langFilter ? `?language=${langFilter}` : "";
      const res = await fetch(`${apiBase}/api/voice/profiles${params}`);
      if (res.ok) {
        const data = await res.json();
        setProfiles(data.profiles || []);
      }
    } catch {}
  }, [apiBase, langFilter]);

  const fetchOutputs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/voice/outputs`);
      if (res.ok) {
        const data = await res.json();
        setOutputs(data.outputs || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStats(); fetchProfiles();
  }, [fetchStats, fetchProfiles]);

  useEffect(() => {
    if (tab === "outputs") fetchOutputs();
    if (tab === "profiles") fetchProfiles();
  }, [tab, fetchOutputs, fetchProfiles]);

  const handleSynthesize = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/api/voice/synthesize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          profile_id: selectedProfile,
          voice_id: voiceId || undefined,
          rate,
          pitch,
          save_output: saveOutput,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Synthesis failed" }));
        setError(err.detail || "Synthesis failed");
        return;
      }

      // Read metadata from headers
      const meta = {
        engine: res.headers.get("X-TTS-Engine") || "",
        voice: res.headers.get("X-TTS-Voice") || "",
        duration: res.headers.get("X-TTS-Duration") || "0",
        cached: res.headers.get("X-TTS-Cached") === "true",
        elapsed_ms: res.headers.get("X-TTS-Elapsed-Ms") || "0",
        output_file: res.headers.get("X-TTS-Output-File") || "",
      };
      setLastResult(meta);

      // Create audio blob
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(url);

      fetchStats();
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handlePlay = () => {
    if (!audioRef.current || !audioUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  const handleStop = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
  };

  const handleCreateProfile = async () => {
    try {
      const res = await fetch(`${apiBase}/api/voice/profiles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newProfile),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewProfile({ name: "", description: "", voice_id: "zh-CN-XiaoxiaoNeural", language: "zh-CN", rate: "+0%", pitch: "+0Hz", tags: [] });
        fetchProfiles();
      }
    } catch {}
  };

  const handleDeleteProfile = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/voice/profiles/${id}`, { method: "DELETE" });
      fetchProfiles();
    } catch {}
  };

  const handleDeleteOutput = async (filename: string) => {
    try {
      await fetch(`${apiBase}/api/voice/outputs/${filename}`, { method: "DELETE" });
      fetchOutputs();
    } catch {}
  };

  const tabs = [
    { id: "synthesize" as const, label: t('voice.speechSynthesis'), icon: Mic },
    { id: "profiles" as const, label: t('voice.voiceProfile'), icon: Settings },
    { id: "outputs" as const, label: t('voice.outputFiles1'), icon: FileAudio },
  ];

  const selectedProfileData = profiles.find(p => p.profile_id === selectedProfile);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Volume2 size={20} className="text-rose-500" />
          <h1 className="text-lg font-semibold">{t('voice.speechSynthesis1')}</h1>
          <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs font-medium text-rose-500">
            {t('voice.textToSpeech')}
          </span>
        </div>
        <button onClick={() => { fetchStats(); fetchProfiles(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
          <RefreshCw size={14} />
          {t('voice.refresh')}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard label={t('voice.times1')} value={String(stats.total_synthesized)} color="text-rose-500" />
            <StatCard label={t('voice.characters')} value={String(stats.total_characters)} color="text-blue-500" />
            <StatCard label={t('voice.cachehits1')} value={String(stats.cache_hits)} color="text-emerald-500" />
            <StatCard label={t('voice.engine2')} value={stats.preferred_backend} color="text-violet-500" />
            <StatCard label={t('voice.voiceProfile1')} value={String(stats.total_profiles)} color="text-amber-500" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === tabItem.id ? "bg-rose-500/10 text-rose-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Synthesize Tab */}
        {tab === "synthesize" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Input */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm">{t('voice.inputText1')}</h3>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t('voice.input1')}
                  rows={6}
                  className="w-full rounded-lg border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-500/20 resize-none"
                />
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{text.length} / 10000 {t('voice.characters1')}</span>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <input type="checkbox" checked={saveOutput} onChange={(e) => setSaveOutput(e.target.checked)}
                        className="rounded border-border" />
                      {t('voice.saveFile')}
                    </label>
                  </div>
                </div>
              </div>

              {/* Voice selector */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm">{t('voice.select')}</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {profiles.slice(0, 8).map((p) => (
                    <button key={p.profile_id}
                      onClick={() => { setSelectedProfile(p.profile_id); setVoiceId(""); }}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-all hover:shadow-sm",
                        selectedProfile === p.profile_id
                          ? "border-rose-500 bg-rose-500/5 ring-1 ring-rose-500"
                          : "border-border hover:border-rose-500/30"
                      )}>
                      <div className="text-xs font-medium truncate">{p.name}</div>
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.language}</div>
                      {p.usage_count > 0 && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{t('voice.usedTimes', { count: p.usage_count })}</div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Custom voice_id */}
                <div className="flex gap-2">
                  <input
                    value={voiceId}
                    onChange={(e) => { setVoiceId(e.target.value); setSelectedProfile(""); }}
                    placeholder={t('voice.input2')}
                    className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-rose-500/20"
                  />
                </div>
              </div>

              {/* Speed & Pitch controls */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm">{t('voice.t79207')}</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-muted-foreground">{t('voice.t69116')}</label>
                    <select value={rate} onChange={(e) => setRate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="-30%">{t('voice.t46095')}</option>
                      <option value="-15%">{t('voice.t68279')}</option>
                      <option value="+0%">{t('voice.t72596')}</option>
                      <option value="+15%">{t('voice.t61601')}</option>
                      <option value="+30%">{t('voice.t79620')}</option>
                      <option value="+50%">{t('voice.t69766')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">{t('voice.t31129')}</label>
                    <select value={pitch} onChange={(e) => setPitch(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                      <option value="-10Hz">{t('voice.low2')}</option>
                      <option value="+0Hz">{t('voice.t72596')}</option>
                      <option value="+10Hz">{t('voice.high3')}</option>
                      <option value="+20Hz">{t('voice.high4')}</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-500">
                  {error}
                </div>
              )}

              {/* Synthesize button */}
              <button
                onClick={handleSynthesize}
                disabled={loading || !text.trim()}
                className="flex items-center justify-center gap-2 w-full rounded-xl bg-rose-500 px-4 py-3 text-sm font-medium text-white hover:bg-rose-600 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {loading ? t('voice.synthesizing') : t('voice.start3')}
              </button>
            </div>

            {/* Right: Result */}
            <div className="space-y-4">
              {/* Audio Player */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-4">
                <h3 className="font-semibold text-sm">{t('voice.play1')}</h3>
                {audioUrl ? (
                  <>
                    <audio ref={audioRef} src={audioUrl} onEnded={() => setIsPlaying(false)} />
                    <div className="flex items-center justify-center gap-4">
                      <button onClick={handlePlay}
                        className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-500 text-white hover:bg-rose-600 transition-colors">
                        {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                      </button>
                      <button onClick={handleStop}
                        className="flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-muted transition-colors">
                        <Square size={16} />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                    <Volume2 size={32} className="mb-2 opacity-30" />
                    <p className="text-xs">{t('voice.play2')}</p>
                  </div>
                )}
              </div>

              {/* Result info */}
              {lastResult && (
                <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                  <h3 className="font-semibold text-sm">{t('voice.result1')}</h3>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('voice.engine3')}</span>
                      <span className="font-mono">{lastResult.engine}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('voice.t52066')}</span>
                      <span className="font-mono text-[10px]">{lastResult.voice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('voice.t50018')}</span>
                      <span>{lastResult.duration}s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('voice.t80534')}</span>
                      <span>{lastResult.elapsed_ms}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('voice.cache1')}</span>
                      <span>{lastResult.cached ? t('voice.hit') : t('voice.hitsnot')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Quick presets */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm">{t('voice.test1')}</h3>
                <div className="space-y-2">
                  {[
                    t('voice.t30470'),
                    t('voice.t61946'),
                    "The quick brown fox jumps over the lazy dog.",
                  ].map((sample, i) => (
                    <button key={i} onClick={() => setText(sample)}
                      className="w-full text-left rounded-lg border border-border px-3 py-2 text-xs hover:bg-muted transition-colors truncate">
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Profiles Tab */}
        {tab === "profiles" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {/* Language filter */}
                <div className="relative">
                  <button onClick={() => setShowLangMenu(!showLangMenu)}
                    className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted">
                    <Languages size={14} />
                    {LANGUAGES.find(l => l.code === langFilter)?.label || t('voice.allLanguages1')}
                    <ChevronDown size={12} />
                  </button>
                  {showLangMenu && (
                    <div className="absolute top-full mt-1 z-10 w-40 rounded-lg border border-border bg-card shadow-lg">
                      {LANGUAGES.map((l) => (
                        <button key={l.code}
                          onClick={() => { setLangFilter(l.code); setShowLangMenu(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted transition-colors">
                          {l.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{profiles.length} {t('voice.profiles1')}</span>
              </div>
              <button onClick={() => setShowCreate(true)}
                className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-sm text-white hover:bg-rose-600 transition-colors">
                <Plus size={14} /> {t('voice.createprofile')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {profiles.map((p) => (
                <div key={p.profile_id}
                  className="rounded-xl border border-border bg-card p-5 space-y-3 hover:shadow-md transition-all">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-sm">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                    </div>
                    {p.builtin && (
                      <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] text-rose-500">{t('voice.t72236')}</span>
                    )}
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Voice ID</span>
                      <span className="font-mono text-[10px]">{p.voice_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('voice.language1')}</span>
                      <span>{p.language}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>{t('voice.t18963')}</span>
                      <span>{p.rate} / {p.pitch}</span>
                    </div>
                    {p.usage_count > 0 && (
                      <div className="flex justify-between">
                        <span>{t('voice.times2')}</span>
                        <span>{p.usage_count}</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 flex-wrap">
                    {p.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{tag}</span>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setSelectedProfile(p.profile_id); setTab("synthesize"); }}
                      className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-rose-500 px-3 py-1.5 text-xs text-white hover:bg-rose-600 transition-colors">
                      <Mic size={12} /> {t('voice.t89452')}
                    </button>
                    {!p.builtin && (
                      <button onClick={() => handleDeleteProfile(p.profile_id)}
                        className="rounded-lg border border-border px-2.5 py-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Outputs Tab */}
        {tab === "outputs" && (
          <div className="space-y-4">
            {outputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileAudio size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t('voice.outputFilesnoData')}</p>
                <p className="text-xs mt-1">{t('voice.t61022')}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('voice.file2')}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-24">{t('voice.size2')}</th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-36">{t('voice.createtime')}</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground w-24">{t('voice.action1')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outputs.map((f) => (
                      <tr key={f.filename} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{f.filename}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatBytes(f.size_bytes)}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{formatTime(f.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button onClick={() => {
                              const a = document.createElement("a");
                              a.href = `${apiBase}/api/vein/files/download?name=${f.filename}`;
                              a.download = f.filename;
                              a.click();
                            }}
                              className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
                              <Download size={14} />
                            </button>
                            <button onClick={() => handleDeleteOutput(f.filename)}
                              className="rounded-md p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Profile Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
            <h3 className="font-semibold">{t('voice.voiceProfilecreate')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t('voice.name1')}</label>
                <input value={newProfile.name} onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                  placeholder={t('voice.t84292')}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('voice.description2')}</label>
                <input value={newProfile.description} onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                  placeholder={t('voice.description3')}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Voice ID</label>
                <input value={newProfile.voice_id} onChange={(e) => setNewProfile({ ...newProfile, voice_id: e.target.value })}
                  placeholder="zh-CN-XiaoxiaoNeural"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">{t('voice.t69116')}</label>
                  <select value={newProfile.rate} onChange={(e) => setNewProfile({ ...newProfile, rate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="-30%">{t('voice.t31491')}</option>
                    <option value="+0%">{t('voice.t72596')}</option>
                    <option value="+30%">{t('voice.t17538')}</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('voice.t31129')}</label>
                  <select value={newProfile.pitch} onChange={(e) => setNewProfile({ ...newProfile, pitch: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="-10Hz">{t('voice.low3')}</option>
                    <option value="+0Hz">{t('voice.t72596')}</option>
                    <option value="+10Hz">{t('voice.high5')}</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">{t('voice.cancel1')}</button>
              <button onClick={handleCreateProfile} disabled={!newProfile.name}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-50">
                {t('voice.create1')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className={cn("text-2xl font-bold", color)}>{value}</p>
    </div>
  );
}

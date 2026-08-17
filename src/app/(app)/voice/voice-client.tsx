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
  { code: "", label: t('voice.t69656') },
  { code: "zh", label: t('voice.t36896') },
  { code: "en", label: "English" },
  { code: "ja", label: t('voice.t33558') },
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
      await fetch(`${apiBase}/api/voice/outputs/${filename}t('voice.t29494')${apiBase}/api/vein/files/download?name=${f.filename}`;
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
            <h3 className="font-semibold">{t('voice.t55850')}<h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">{t('gland.name')}<label>
                <input value={newProfile.name} onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })}
                  placeholder=t('voice.t79794')
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">{t('marrow.description')}<label>
                <input value={newProfile.description} onChange={(e) => setNewProfile({ ...newProfile, description: e.target.value })}
                  placeholder=t('voice.t76860')
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
                  <label className="text-xs text-muted-foreground">{t('voice.rate')}<label>
                  <select value={newProfile.rate} onChange={(e) => setNewProfile({ ...newProfile, rate: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="-30%">{t('voice.t27256')}<option>
                    <option value="+0%">{t('common.normal')}<option>
                    <option value="+30%">{t('voice.t97687')}<option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">{t('voice.pitch')}<label>
                  <select value={newProfile.pitch} onChange={(e) => setNewProfile({ ...newProfile, pitch: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <option value="-10Hz">{t('voice.t67603')}<option>
                    <option value="+0Hz">{t('common.normal')}<option>
                    <option value="+10Hz">{t('voice.t03245')}<option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowCreate(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">{t('common.cancel')}<button>
              <button onClick={handleCreateProfile} disabled={!newProfile.name}
                className="rounded-lg bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-50">
                {t('common.create')}
              <button>
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

"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
import { useTranslation } from 'react-i18next';

  Upload, RefreshCw, Loader2, CheckCircle, XCircle, AlertTriangle,
  Shield, Eye, Brain, Droplets, Play, Clock, FileText, Zap,
  ChevronRight, ChevronDown, History, Settings, ArrowRight,
} from "lucide-react";

interface PipelineStep {
  step: string;
  status: string;
  [key: string]: unknown;
}

interface PipelineResult {
  pipeline_id: string;
  status: string;
  file_id?: string;
  pipeline_type: string;
  steps: PipelineStep[];
  started_at: number;
  finished_at: number;
  elapsed_ms: number;
  error?: string;
}

interface PipelineType {
  key: string;
  label: string;
  description: string;
}

interface PipelineStage {
  key: string;
  label: string;
  emoji: string;
  description: string;
}

const STEP_ICONS: Record<string, typeof Droplets> = {
  vein: Droplets,
  "sense-ocr": Eye,
  "sense-asr": Eye,
  "sense-text": FileText,
  "sense-video": Eye,
  sense: Eye,
  immune: Shield,
  knowledge: Brain,
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; icon: typeof CheckCircle }> = {
  ok: { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
  completed: { color: "text-emerald-500", bg: "bg-emerald-500/10", icon: CheckCircle },
  error: { color: "text-red-500", bg: "bg-red-500/10", icon: XCircle },
  skipped: { color: "text-yellow-500", bg: "bg-yellow-500/10", icon: AlertTriangle },
  blocked: { color: "text-red-500", bg: "bg-red-500/10", icon: Shield },
  running: { color: "text-blue-500", bg: "bg-blue-500/10", icon: Loader2 },
};

export function PipelineClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const fileRef = useRef<HTMLInputElement>(null);

  // State
  const [pipeline, setPipeline] = useState("auto");
  const [userId, setUserId] = useState("default");
  const [tags, setTags] = useState("");
  const [skipImmune, setSkipImmune] = useState(false);
  const [skipKnowledge, setSkipKnowledge] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<PipelineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<PipelineResult[]>([]);
  const [types, setTypes] = useState<PipelineType[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedHistory, setSelectedHistory] = useState<PipelineResult | null>(null);

  // Fetch pipeline types
  useEffect(() => {
    if (!apiBase) return;
    fetch(`${apiBase}/api/pipeline/types`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setTypes(data.types || []);
          setStages(data.stages || []);
        }
      })
      .catch(() => {});
  }, [apiBase]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    if (!apiBase) return;
    try {
      const res = await fetch(`${apiBase}/api/pipeline/history`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.pipelines || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  // Upload handler
  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("pipeline", pipeline);
    formData.append("user_id", userId);
    formData.append("tags", tags);
    formData.append("skip_immune", String(skipImmune));
    formData.append("skip_knowledge", String(skipKnowledge));

    try {
      const res = await fetch(`${apiBase}/api/pipeline/uploadt('pipeline.t00744')(${String(step.risk_level)})`}
                    </p>
                  )}
                  {step.error != null && <p className="text-red-500">{t('pipeline.errorLabel')}: {String(step.error)}</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Error footer */}
      {result.error && (
        <div className="border-t border-border px-5 py-3 bg-red-500/5">
          <p className="text-xs text-red-500">{result.error}</p>
        </div>
      )}
    </div>
  );
}

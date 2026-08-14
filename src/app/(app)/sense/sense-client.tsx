"use client";
import { useState, useRef } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Eye, Upload, FileText, Mic, Image as ImageIcon,
  RefreshCw, Loader2, Volume2, Languages,
} from "lucide-react";

export function SenseClient() {
  const [tab, setTab] = useState<"ocr" | "asr" | "analyze">("ocr");
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const apiBase = getApiBaseUrl();

  const handleProcess = async (file: File) => {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      let endpoint = "";
      if (tab === "ocr") endpoint = "/api/sense/ocr/image";
      else if (tab === "asr") endpoint = "/api/sense/asr/transcribe";
      else endpoint = "/api/sense/analyze/image";
      const res = await fetch(`${apiBase}${endpoint}`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const tabs = [
    { id: "ocr" as const, label: "OCR 识别", icon: FileText, desc: "图片/PDF 文字提取" },
    { id: "asr" as const, label: "语音转写", icon: Mic, desc: "音频 → 文字" },
    { id: "analyze" as const, label: "图像分析", icon: ImageIcon, desc: "元数据/色彩/EXIF" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Eye size={20} className="text-cyan-500" />
          <h1 className="text-lg font-semibold">OpenSense 感官系统</h1>
          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs font-medium text-cyan-500">
            OCR · ASR · 多模态
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tab Selector */}
        <div className="flex gap-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setResult(null); setError(""); }}
              className={cn(
                "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors",
                tab === t.id
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-600"
                  : "border-border hover:bg-muted"
              )}
            >
              <t.icon size={16} />
              <div className="text-left">
                <div className="font-medium">{t.label}</div>
                <div className="text-[10px] text-muted-foreground">{t.desc}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Upload Zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border p-10 cursor-pointer hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-colors"
        >
          {loading ? (
            <Loader2 size={32} className="text-cyan-500 animate-spin" />
          ) : (
            <Upload size={32} className="text-muted-foreground" />
          )}
          <div className="text-center">
            <p className="text-sm font-medium">
              {loading ? "处理中..." : `点击上传${tab === "ocr" ? "图片/PDF" : tab === "asr" ? "音频文件" : "图片"}`}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {tab === "ocr" ? "支持 PNG/JPG/PDF" : tab === "asr" ? "支持 WAV/MP3/OGG/FLAC" : "支持 PNG/JPG"}
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept={tab === "ocr" ? "image/*,.pdf" : tab === "asr" ? "audio/*" : "image/*"}
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleProcess(e.target.files[0])}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <h3 className="text-sm font-semibold">识别结果</h3>
            {tab === "ocr" && (
              <>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>引擎: {result.engine}</span>
                  <span>置信度: {result.confidence}%</span>
                  <span>语言: {result.language}</span>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm max-h-80 overflow-y-auto">
                  {result.text || "(无文字)"}
                </pre>
              </>
            )}
            {tab === "asr" && (
              <>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  <span>引擎: {result.engine}</span>
                  <span>时长: {result.duration_seconds?.toFixed(1)}s</span>
                  <span>语言: {result.language}</span>
                </div>
                <pre className="whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm max-h-80 overflow-y-auto">
                  {result.text || "(无文字)"}
                </pre>
                {result.segments?.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">时间轴 ({result.segments.length} 段)</summary>
                    <div className="mt-2 space-y-1">
                      {result.segments.map((s: any, i: number) => (
                        <div key={i} className="flex gap-2">
                          <span className="text-muted-foreground w-20">{s.start?.toFixed(1)}s-{s.end?.toFixed(1)}s</span>
                          <span>{s.text}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
            {tab === "analyze" && (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div><span className="text-muted-foreground">尺寸:</span> {result.width}×{result.height}</div>
                <div><span className="text-muted-foreground">格式:</span> {result.format} ({result.mode})</div>
                <div><span className="text-muted-foreground">文件大小:</span> {(result.file_size / 1024).toFixed(1)} KB</div>
                <div><span className="text-muted-foreground">描述:</span> {result.description}</div>
                {result.dominant_colors?.length > 0 && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">主色调:</span>
                    <div className="flex gap-2 mt-1">
                      {result.dominant_colors.map((c: string, i: number) => (
                        <div key={i} className="flex items-center gap-1">
                          <div className="w-4 h-4 rounded border" style={{ backgroundColor: c }} />
                          <span className="text-xs">{c}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { getApiBaseUrl } from "@/lib/api-client"
import {
  Eye, Upload, FileImage, Mic, FileText, Loader2,
  CheckCircle, AlertTriangle, Copy, Trash2, Volume2, Image as ImageIcon,
  Video, Film,
} from "lucide-react"

interface SenseHealth {
  status: string
  component: string
  engines: Record<string, { available: boolean; engine: string; [k: string]: unknown }>
}

interface OCRResult {
  text: string
  confidence: number
  language: string
  engine: string
  pages: Array<{ page: number; text: string; confidence: number }>
}

interface ASRResult {
  text: string
  language: string
  duration_seconds: number
  engine: string
  segments: Array<{ start: number; end: number; text: string }>
}

interface ImageAnalysisResult {
  width: number
  height: number
  format: string
  mode: string
  file_size: number
  exif: Record<string, unknown>
  dominant_colors: string[]
  description: string
}

type ActiveTab = "ocr" | "asr" | "analyze" | "video"

export function SenseClient() {
  const { t } = useTranslation()
  const apiBase = getApiBaseUrl()

  const [health, setHealth] = useState<SenseHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<ActiveTab>("ocr")

  // OCR state
  const [ocrFile, setOcrFile] = useState<File | null>(null)
  const [ocrLanguage, setOcrLanguage] = useState("chi_sim+eng")
  const [ocrPreprocess, setOcrPreprocess] = useState(true)
  const [ocrResult, setOcrResult] = useState<OCRResult | null>(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrPreview, setOcrPreview] = useState<string | null>(null)

  // ASR state
  const [asrFile, setAsrFile] = useState<File | null>(null)
  const [asrLanguage, setAsrLanguage] = useState("")
  const [asrResult, setAsrResult] = useState<ASRResult | null>(null)
  const [asrLoading, setAsrLoading] = useState(false)

  // Image analysis state
  const [analyzeFile, setAnalyzeFile] = useState<File | null>(null)
  const [analyzeResult, setAnalyzeResult] = useState<ImageAnalysisResult | null>(null)
  const [analyzeLoading, setAnalyzeLoading] = useState(false)
  const [analyzePreview, setAnalyzePreview] = useState<string | null>(null)

  // Video analysis state
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoResult, setVideoResult] = useState<{ duration: number; width: number; height: number; fps: number; codec: string; file_size: number } | null>(null)
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoFrames, setVideoFrames] = useState<Array<{ index: number; size_bytes: number; base64: string }>>([])
  const [frameExtracting, setFrameExtracting] = useState(false)
  const [frameInterval, setFrameInterval] = useState(2.0)
  const [maxFrames, setMaxFrames] = useState(6)

  const ocrInputRef = useRef<HTMLInputElement>(null)
  const asrInputRef = useRef<HTMLInputElement>(null)
  const analyzeInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${apiBase}/api/sense/health`)
      .then(r => r.json())
      .then(setHealth)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [apiBase])

  const handleOCR = useCallback(async () => {
    if (!ocrFile) return
    setOcrLoading(true)
    setOcrResult(null)
    try {
      const fd = new FormData()
      fd.append("file", ocrFile)
      fd.append("language", ocrLanguage)
      fd.append("preprocess", String(ocrPreprocess))
      const res = await fetch(`${apiBase}/api/sense/ocr/image`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setOcrResult(await res.json())
    } catch (e: any) {
      setOcrResult({ text: `Error: ${e.message}`, confidence: 0, language: "", engine: "error", pages: [] })
    } finally {
      setOcrLoading(false)
    }
  }, [ocrFile, ocrLanguage, ocrPreprocess, apiBase])

  const handleASR = useCallback(async () => {
    if (!asrFile) return
    setAsrLoading(true)
    setAsrResult(null)
    try {
      const fd = new FormData()
      fd.append("file", asrFile)
      if (asrLanguage) fd.append("language", asrLanguage)
      const ext = asrFile.name.split(".").pop() || "wav"
      fd.append("format", ext)
      const res = await fetch(`${apiBase}/api/sense/asr/transcribe`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAsrResult(await res.json())
    } catch (e: any) {
      setAsrResult({ text: `Error: ${e.message}`, language: "", duration_seconds: 0, engine: "error", segments: [] })
    } finally {
      setAsrLoading(false)
    }
  }, [asrFile, asrLanguage, apiBase])

  const handleAnalyze = useCallback(async () => {
    if (!analyzeFile) return
    setAnalyzeLoading(true)
    setAnalyzeResult(null)
    try {
      const fd = new FormData()
      fd.append("file", analyzeFile)
      const res = await fetch(`${apiBase}/api/sense/analyze/image`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setAnalyzeResult(await res.json())
    } catch (e: any) {
      setAnalyzeResult(null)
    } finally {
      setAnalyzeLoading(false)
    }
  }, [analyzeFile, apiBase])

  const handleVideoAnalyze = useCallback(async () => {
    if (!videoFile) return
    setVideoLoading(true)
    setVideoResult(null)
    setVideoFrames([])
    try {
      const fd = new FormData()
      fd.append("file", videoFile)
      const res = await fetch(`${apiBase}/api/sense/analyze/video`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setVideoResult(await res.json())
    } catch (e: any) {
      setVideoResult(null)
      alert(t('sense.t64077', { message: e.message }))
    } finally {
      setVideoLoading(false)
    }
  }, [videoFile, apiBase])

  const handleExtractFrames = useCallback(async () => {
    if (!videoFile) return
    setFrameExtracting(true)
    setVideoFrames([])
    try {
      const fd = new FormData()
      fd.append("file", videoFile)
      fd.append("interval", String(frameInterval))
      fd.append("max_frames", String(maxFrames))
      const res = await fetch(`${apiBase}/api/sense/video/extract-frames`, { method: "POST", body: fd })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setVideoFrames(data.frames || [])
    } catch (e: any) {
      alert(t('sense.t10706', { message: e.message }))
    } finally {
      setFrameExtracting(false)
    }
  }, [videoFile, frameInterval, maxFrames, apiBase])

  const handleFileSelect = useCallback((
    file: File | null,
    setFile: (f: File | null) => void,
    setPreview: (p: string | null) => void,
    isImage: boolean,
  ) => {
    setFile(file)
    setPreview(null)
    if (file && isImage) {
      const reader = new FileReader()
      reader.onload = (e) => setPreview(e.target?.result as string)
      reader.readAsDataURL(file)
    }
  }, [])

  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text).catch(() => {})
  }, [])

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = Math.round(seconds % 60)
    return m > 0 ? `${m}m ${s}s` : `${s}st('sense.t44448')p-4 rounded-xl border transition-all ${
              eng.available
                ? "border-green-500/30 bg-green-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ${eng.available ? "bg-green-500" : "bg-muted-foreground/40"}t('sense.t48760')flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-card border border-b-0 border-border text-foreground"
                  : tab.available
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    : "text-muted-foreground/40 cursor-not-allowed"
              }t('sense.t93091')${analyzeResult.width} × ${analyzeResult.height}t('sense.t22384')${videoResult.width} × ${videoResult.height}` },
                        { label: t('sense.t64746'), value: `${videoResult.fps} fpst('sense.t09009')data:image/jpeg;base64,${frame.base64}`}
                            alt={`Frame ${frame.index + 1}`}
                            className="w-full h-auto"
                          />
                          <div className="text-[10px] text-muted-foreground text-center py-1 bg-muted/30">
                            #{frame.index + 1} · {formatFileSize(frame.size_bytes)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

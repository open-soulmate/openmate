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
      alert(`视频分析失败: ${e.message}`)
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
      alert(`帧提取失败: ${e.message}`)
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
    return m > 0 ? `${m}m ${s}s` : `${s}s`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const ocrAvailable = health?.engines?.ocr?.available ?? false
  const asrAvailable = health?.engines?.asr?.available ?? false
  const multimodalAvailable = health?.engines?.multimodal?.available ?? false

  const tabs: Array<{ key: ActiveTab; label: string; icon: typeof Eye; available: boolean }> = [
    { key: "ocr", label: t('sense.recognize'), icon: FileImage, available: ocrAvailable },
    { key: "asr", label: t('sense.voice1'), icon: Volume2, available: asrAvailable },
    { key: "analyze", label: t('sense.imageAnalysis'), icon: ImageIcon, available: multimodalAvailable },
    { key: "video", label: t('sense.videoAnalysis'), icon: Video, available: true },
  ]

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-500/20">
          <Eye className="w-6 h-6 text-amber-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">{t('sense.t86517')}</h1>
          <p className="text-sm text-muted-foreground">{t('sense.imageAnalysisvoicerecognize')}</p>
        </div>
      </div>

      {/* Engine Status */}
      <div className="grid grid-cols-3 gap-4">
        {Object.entries(health?.engines || {}).map(([name, eng]) => (
          <div
            key={name}
            className={`p-4 rounded-xl border transition-all ${
              eng.available
                ? "border-green-500/30 bg-green-500/5"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2.5 h-2.5 rounded-full ${eng.available ? "bg-green-500" : "bg-muted-foreground/40"}`} />
              <span className="font-semibold text-sm uppercase">{name}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Engine: {eng.engine as string}
            </div>
            {eng.available ? (
              <div className="text-xs text-green-500 font-medium mt-1">{t('sense.t06705')}</div>
            ) : (
              <div className="text-xs text-muted-foreground mt-1">{t('sense.t38188')}</div>
            )}
          </div>
        ))}
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-border pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
                activeTab === tab.key
                  ? "bg-card border border-b-0 border-border text-foreground"
                  : tab.available
                    ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    : "text-muted-foreground/40 cursor-not-allowed"
              }`}
              disabled={!tab.available}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {!tab.available && <span className="text-xs">{t('sense.t27868')}</span>}
            </button>
          )
        })}
      </div>

      {/* OCR Tab */}
      {activeTab === "ocr" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.upload3')}</h3>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                onClick={() => ocrInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFileSelect(file, setOcrFile, setOcrPreview, true)
                }}
              >
                {ocrPreview ? (
                  <img src={ocrPreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('sense.upload4')}</p>
                    <p className="text-xs text-muted-foreground/60">{t('sense.t17777')}</p>
                  </div>
                )}
              </div>
              <input
                ref={ocrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, setOcrFile, setOcrPreview, true)}
              />
              {ocrFile && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileImage className="w-3.5 h-3.5" />
                  {ocrFile.name} ({formatFileSize(ocrFile.size)})
                  <button onClick={() => { setOcrFile(null); setOcrPreview(null) }} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{t('sense.language2')}</label>
                  <select
                    value={ocrLanguage}
                    onChange={(e) => setOcrLanguage(e.target.value)}
                    className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="chi_sim+eng">{t('sense.chinese1')}</option>
                    <option value="eng">English</option>
                    <option value="chi_sim">{t('sense.chinese2')}</option>
                    <option value="chi_tra">{t('sense.chinese3')}</option>
                    <option value="jpn">{t('sense.t52458')}</option>
                    <option value="kor">한국어</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ocrPreprocess}
                      onChange={(e) => setOcrPreprocess(e.target.checked)}
                      className="rounded border-border"
                    />
                    预处理（灰度+二值化）
                  </label>
                </div>
              </div>

              <button
                onClick={handleOCR}
                disabled={!ocrFile || ocrLoading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
              >
                {ocrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                {ocrLoading ? "识别中..." : t('sense.startrecognize')}
              </button>
            </div>

            {/* Result Area */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t('sense.resultrecognize')}</h3>
                {ocrResult && ocrResult.text && (
                  <button
                    onClick={() => copyToClipboard(ocrResult.text)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> {t('sense.copy3')}
                  </button>
                )}
              </div>
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto bg-card border border-border rounded-xl p-4">
                {ocrResult ? (
                  <div className="space-y-4">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{t('sense.t66204')}<b className="text-foreground">{ocrResult.confidence}%</b></span>
                      <span>{t('sense.language3')}<b className="text-foreground">{ocrResult.language}</b></span>
                      <span>{t('sense.engine4')}<b className="text-foreground">{ocrResult.engine}</b></span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {ocrResult.text || t('sense.recognizenot')}
                    </div>
                    {ocrResult.pages.length > 1 && (
                      <div className="space-y-3 pt-4 border-t border-border">
                        <h4 className="text-xs font-medium text-muted-foreground">{t('sense.result2')}</h4>
                        {ocrResult.pages.map((p) => (
                          <div key={p.page} className="bg-muted/30 rounded-lg p-3">
                            <div className="text-xs text-muted-foreground mb-1">第 {p.page} 页 · 置信度 {p.confidence}%</div>
                            <div className="text-sm whitespace-pre-wrap">{p.text}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                    <FileText className="w-12 h-12 mb-2" />
                    <p className="text-smt('sense.upload5')e.uploadstartrecognize')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ASR Tab */}
      {activeTab === "asr" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.upload6')}</h3>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                onClick={() => asrInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) setAsrFile(file)
                }}
              >
                <div className="space-y-2">
                  <Mic className="w-10 h-10 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">{t('sense.upload7')}</p>
                  <p className="text-xs text-muted-foreground/60">{t('sense.t04951')}</p>
                </div>
              </div>
              <input
                ref={asrInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => setAsrFile(e.target.files?.[0] || null)}
              />
              {asrFile && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Volume2 className="w-3.5 h-3.5" />
                  {asrFile.name} ({formatFileSize(asrFile.size)})
                  <button onClick={() => setAsrFile(null)} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{t('sense.languageempty')}</label>
                <select
                  value={asrLanguage}
                  onChange={(e) => setAsrLanguage(e.target.value)}
                  className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">{t('sense.t20026')}</option>
                  <option value="zh">{t('sense.chinese4')}</option>
                  <option value="en">English</option>
                  <option value="ja">{t('sense.t24690')}</option>
                  <option value="ko">한국어</option>
                </select>
              </div>

              <button
                onClick={handleASR}
                disabled={!asrFile || asrLoading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
              >
                {asrLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Volume2 className="w-4 h-4" />}
                {asrLoading ? "转写中..." : t('sense.startvoice')}
              </button>
            </div>

            {/* Result Area */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t('sense.result3')}</h3>
                {asrResult && asrResult.text && (
                  <button
                    onClick={() => copyToClipboard(asrResult.text)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" /> {t('sense.copy4')}
                  </button>
                )}
              </div>
              <div className="min-h-[300px] max-h-[500px] overflow-y-auto bg-card border border-border rounded-xl p-4">
                {asrResult ? (
                  <div className="space-y-4">
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>{t('sense.t34140')}<b className="text-foreground">{formatDuration(asrResult.duration_seconds)}</b></span>
                      <span>{t('sense.language4')}<b className="text-foreground">{asrResult.language || t('sense.not')}</b></span>
                      <span>{t('sense.engine5')}<b className="text-foreground">{asrResult.engine}</b></span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed">
                      {asrResult.text || t('sense.voicerecognizenot')}
                    </div>
                    {asrResult.segments.length > 0 && (
                      <div className="space-y-2 pt-4 border-t border-border">
                        <h4 className="text-xs font-medium text-muted-foreground">{t('sense.time1')}</h4>
                        {asrResult.segments.map((seg, i) => (
                          <div key={i} className="flex gap-3 text-sm">
                            <span className="text-xs text-muted-foreground font-mono whitespace-nowrap">
                              {formatDuration(seg.start)} → {formatDuration(seg.end)}
                            </span>
                            <span>{seg.text}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                    <Mic className="w-12 h-12 mb-2" />
                    <p className="text-smt('sense.upload8')e.uploadstart')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analyze Tab */}
      {activeTab === "analyze" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.upload9')}</h3>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                onClick={() => analyzeInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleFileSelect(file, setAnalyzeFile, setAnalyzePreview, true)
                }}
              >
                {analyzePreview ? (
                  <img src={analyzePreview} alt="Preview" className="max-h-48 mx-auto rounded-lg object-contain" />
                ) : (
                  <div className="space-y-2">
                    <ImageIcon className="w-10 h-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('sense.upload10')}</p>
                  </div>
                )}
              </div>
              <input
                ref={analyzeInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleFileSelect(e.target.files?.[0] || null, setAnalyzeFile, setAnalyzePreview, true)}
              />
              {analyzeFile && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <FileImage className="w-3.5 h-3.5" />
                  {analyzeFile.name} ({formatFileSize(analyzeFile.size)})
                  <button onClick={() => { setAnalyzeFile(null); setAnalyzePreview(null) }} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={handleAnalyze}
                disabled={!analyzeFile || analyzeLoading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
              >
                {analyzeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                {analyzeLoading ? "分析中..." : t('sense.imageAnalysisstart')}
              </button>
            </div>

            {/* Result Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.analyzeresult')}</h3>
              <div className="min-h-[300px] bg-card border border-border rounded-xl p-4">
                {analyzeResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: t('sense.t45566'), value: `${analyzeResult.width} × ${analyzeResult.height}` },
                        { label: t('sense.format1'), value: analyzeResult.format },
                        { label: t('sense.t28692'), value: analyzeResult.mode },
                        { label: t('sense.filesize'), value: formatFileSize(analyzeResult.file_size) },
                      ].map(item => (
                        <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">{item.label}</div>
                          <div className="text-sm font-semibold">{item.value}</div>
                        </div>
                      ))}
                    </div>

                    {analyzeResult.dominant_colors.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">{t('sense.t60195')}</div>
                        <div className="flex gap-2">
                          {analyzeResult.dominant_colors.map((color, i) => (
                            <div key={i} className="flex flex-col items-center gap-1">
                              <div
                                className="w-10 h-10 rounded-lg border border-border shadow-sm"
                                style={{ backgroundColor: color }}
                              />
                              <span className="text-[10px] text-muted-foreground font-mono">{color}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {Object.keys(analyzeResult.exif).length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-2">{t('sense.info2')}</div>
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {Object.entries(analyzeResult.exif).slice(0, 20).map(([k, v]) => (
                            <div key={k} className="flex justify-between text-xs">
                              <span className="text-muted-foreground">{k}</span>
                              <span className="font-mono text-right max-w-[200px] truncate">{String(v)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground pt-2 border-t border-border">
                      {analyzeResult.description}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                    <ImageIcon className="w-12 h-12 mb-2" />
                    <p className="text-smt('sense.upload11')e.uploadanalyzestart')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Video Tab */}
      {activeTab === "video" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upload Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.upload12')}</h3>
              <div
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-amber-500/50 hover:bg-amber-500/5 transition-all"
                onClick={() => videoInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) setVideoFile(file)
                }}
              >
                {videoFile ? (
                  <div className="space-y-2">
                    <Film className="w-10 h-10 mx-auto text-amber-500" />
                    <p className="text-sm font-medium">{videoFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(videoFile.size)}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Video className="w-10 h-10 mx-auto text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">{t('sense.upload13')}</p>
                    <p className="text-xs text-muted-foreground/60">{t('sense.t00757')}</p>
                  </div>
                )}
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => setVideoFile(e.target.files?.[0] || null)}
              />
              {videoFile && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Film className="w-3.5 h-3.5" />
                  {videoFile.name} ({formatFileSize(videoFile.size)})
                  <button onClick={() => { setVideoFile(null); setVideoResult(null); setVideoFrames([]) }} className="ml-auto text-red-400 hover:text-red-300">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              <button
                onClick={handleVideoAnalyze}
                disabled={!videoFile || videoLoading}
                className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-amber-600 hover:to-orange-600 transition-all flex items-center justify-center gap-2"
              >
                {videoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Film className="w-4 h-4" />}
                {videoLoading ? "分析中..." : t('sense.infoanalyze')}
              </button>

              {/* Frame extraction controls */}
              <div className="border-t border-border pt-4 space-y-3">
                <h4 className="text-sm font-medium">{t('sense.t72706')}</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('sense.interval1')}</label>
                    <input
                      type="number"
                      min={0.5}
                      step={0.5}
                      value={frameInterval}
                      onChange={(e) => setFrameInterval(Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">{t('sense.max1')}</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={maxFrames}
                      onChange={(e) => setMaxFrames(Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <button
                  onClick={handleExtractFrames}
                  disabled={!videoFile || frameExtracting}
                  className="w-full py-2.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-lg font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:from-orange-600 hover:to-red-600 transition-all flex items-center justify-center gap-2"
                >
                  {frameExtracting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
                  {frameExtracting ? "提取中..." : t('sense.t74001')}
                </button>
              </div>
            </div>

            {/* Result Area */}
            <div className="space-y-4">
              <h3 className="font-semibold">{t('sense.analyzeresult1')}</h3>
              <div className="min-h-[300px] bg-card border border-border rounded-xl p-4">
                {videoResult ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: t('sense.t65578'), value: formatDuration(videoResult.duration) },
                        { label: t('sense.t65670'), value: `${videoResult.width} × ${videoResult.height}` },
                        { label: t('sense.t20138'), value: `${videoResult.fps} fps` },
                        { label: t('sense.t32222'), value: videoResult.codec },
                        { label: t('sense.filesize1'), value: formatFileSize(videoResult.file_size) },
                      ].map(item => (
                        <div key={item.label} className="bg-muted/30 rounded-lg p-3">
                          <div className="text-xs text-muted-foreground">{item.label}</div>
                          <div className="text-sm font-semibold">{item.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
                    <Video className="w-12 h-12 mb-2" />
                    <p className="text-smt('sense.upload14')e.uploadinfoanalyze')}</p>
                  </div>
                )}

                {/* Extracted Frames */}
                {videoFrames.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border">
                    <h4 className="text-xs font-medium text-muted-foreground mb-3">
                      提取的帧 ({videoFrames.length} 张)
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {videoFrames.map((frame) => (
                        <div key={frame.index} className="rounded-lg overflow-hidden border border-border">
                          <img
                            src={`data:image/jpeg;base64,${frame.base64}`}
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

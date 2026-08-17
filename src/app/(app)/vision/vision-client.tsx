"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  ImageIcon, BarChart3, TrendingUp, PieChart, ScatterChart,
  RefreshCw, Download, Trash2, Plus, Minus, Loader2, Zap,
  Network, FileImage,
} from "lucide-react";

interface OutputFile {
  filename: string;
  size_bytes: number;
  created_at: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function VisionClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"chart" | "mindmap" | "outputs">("chart");
  const [chartType, setChartType] = useState<"bar" | "line" | "pie" | "scatter">("bar");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState("");
  const [lastMeta, setLastMeta] = useState<any>(null);
  const [outputs, setOutputs] = useState<OutputFile[]>([]);
  const [error, setError] = useState("");

  // Bar chart form
  const [barLabels, setBarLabels] = useState("Q1,Q2,Q3,Q4");
  const [barValues, setBarValues] = useState("120,150,180,200");
  const [barTitle, setBarTitle] = useState(t('vision.quarterlySales'));
  const [barColor, setBarColor] = useState("#e11d48");

  // Line chart form
  const [lineX, setLineX] = useState(t('vision.defaultLineX'));
  const [lineSeries, setLineSeries] = useState(t('vision.defaultLineSeries'));
  const [lineTitle, setLineTitle] = useState(t('vision.trendComparison'));

  // Pie chart form
  const [pieLabels, setPieLabels] = useState("Python,JavaScript,Rust,Go,Other");
  const [pieValues, setPieValues] = useState("35,28,15,12,10");
  const [pieTitle, setPieTitle] = useState(t('vision.langDist'));

  // Scatter form
  const [scatterX, setScatterX] = useState("1,2,3,4,5,6,7,8,9,10");
  const [scatterY, setScatterY] = useState("2.1,3.9,6.2,7.8,10.1,12.3,13.8,16.2,18.1,20.5");
  const [scatterTitle, setScatterTitle] = useState(t('vision.scatterPlot'));

  // Mind map form
  const [mindmapData, setMindmapData] = useState(JSON.stringify({
    label: t("vision.defaultMindmapData"), children: [
      { label: "Prompt Engineering" },
      { label: "RAG", children: [{ label: t("vision.mindmapSub2a") }, { label: t("vision.mindmapSub2b") }] },
      { label: "Agent", children: [{ label: t("vision.mindmapSub3a") }, { label: t("vision.mindmapSub3b") }] },
      { label: "Fine-tuning" },
    ],
  }, null, 2));
  const [mindmapTitle, setMindmapTitle] = useState(t('vision.defaultMindmapTitle'));

  const apiBase = getApiBaseUrl();

  const fetchOutputs = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vision/outputs`);
      if (res.ok) {
        const data = await res.json();
        setOutputs(data.outputs || []);
      }
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    if (tab === "outputs") fetchOutputs();
  }, [tab, fetchOutputs]);

  const handleGenerateChart = async () => {
    setLoading(true);
    setError("");
    try {
      let endpoint = "";
      let body: any = {};

      if (chartType === "bar") {
        endpoint = "/api/vision/chart/bar";
        body = {
          labels: barLabels.split(",").map(s => s.trim()),
          values: barValues.split(",").map(s => parseFloat(s.trim())),
          title: barTitle, color: barColor, save_output: true,
        };
      } else if (chartType === "line") {
        const series: Record<string, number[]> = {};
        lineSeries.split("\n").forEach(line => {
          const [name, vals] = line.split(":");
          if (name && vals) {
            series[name.trim()] = vals.split(",").map(v => parseFloat(v.trim()));
          }
        });
        endpoint = "/api/vision/chart/line";
        body = {
          x: lineX.split(",").map(s => s.trim()),
          series, title: lineTitle, save_output: true,
        };
      } else if (chartType === "pie") {
        endpoint = "/api/vision/chart/pie";
        body = {
          labels: pieLabels.split(",").map(s => s.trim()),
          values: pieValues.split(",").map(s => parseFloat(s.trim())),
          title: pieTitle, save_output: true,
        };
      } else if (chartType === "scatter") {
        endpoint = "/api/vision/chart/scatter";
        body = {
          x: scatterX.split(",").map(s => parseFloat(s.trim())),
          y: scatterY.split(",").map(s => parseFloat(s.trim())),
          title: scatterTitle, save_output: true,
        };
      }

      const res = await fetch(`${apiBase}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        setError(err.detail || "Chart generation failed");
        return;
      }

      const meta = {
        engine: res.headers.get("X-Chart-Engine") || "",
        type: res.headers.get("X-Chart-Type") || "",
        elapsed: res.headers.get("X-Chart-Elapsed-Ms") || "",
        output: res.headers.get("X-Output-File") || "",
      };
      setLastMeta(meta);

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(url);
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateMindmap = async () => {
    setLoading(true);
    setError("");
    try {
      let root;
      try { root = JSON.parse(mindmapData); } catch { setError(t('vision.jsonError')); setLoading(false); return; }

      const res = await fetch(`${apiBase}/api/vision/mindmap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ root, title: mindmapTitle, save_output: true }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        setError(err.detail || "Mind map generation failed");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      setImageUrl(url);
      setLastMeta({ engine: "pillow", type: "mindmap" });
    } catch (e: any) {
      setError(e.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const chartTabs = [
    { id: "bar" as const, label: t("vision.barChart"), icon: BarChart3 },
    { id: "line" as const, label: t("vision.lineChart"), icon: TrendingUp },
    { id: "pie" as const, label: t("vision.pieChart"), icon: PieChart },
    { id: "scatter" as const, label: t("vision.scatterChart"), icon: ScatterChart },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <ImageIcon size={20} className="text-indigo-500" />
          <h1 className="text-lg font-semibold">{t("vision.title")}</h1>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
            {t("vision.badge")}
          </span>
        </div>
        <button onClick={() => { fetchOutputs(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Main tabs */}
        <div className="flex gap-2">
          {[
            { id: "chart" as const, label: t("vision.charts"), icon: BarChart3 },
            { id: "mindmap" as const, label: t("vision.mindmap"), icon: Network },
            { id: "outputs" as const, label: t("vision.outputs"), icon: FileImage },
          ].map((tabItem) => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === tabItem.id ? "bg-indigo-500/10 text-indigo-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <tabItem.icon size={14} /> {tabItem.label}
            </button>
          ))}
        </div>

        {/* Chart Tab */}
        {tab === "chart" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              {/* Chart type selector */}
              <div className="flex gap-2">
                {chartTabs.map((ct) => (
                  <button key={ct.id} onClick={() => setChartType(ct.id)}
                    className={cn("flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs transition-colors",
                      chartType === ct.id ? "bg-indigo-500/10 text-indigo-600" : "hover:bg-muted text-muted-foreground")}>
                    <ct.icon size={12} /> {ct.label}
                  </button>
                ))}
              </div>

              {/* Form based on chart type */}
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                {chartType === "bar" && (
                  <>
                    <Field label={t("vision.chartTitle")} value={barTitle} onChange={setBarTitle} placeholder={t("vision.chartTitle")} />
                    <Field label={`${t("vision.labels")} (${t("mind.chars")})`} value={barLabels} onChange={setBarLabels} placeholder="Q1,Q2,Q3,Q4" />
                    <Field label={`${t("vision.values")} (${t("mind.chars")})`} value={barValues} onChange={setBarValues} placeholder="120,150,180,200" />
                    <Field label={t("vision.color")} value={barColor} onChange={setBarColor} placeholder="#e11d48" />
                  </>
                )}
                {chartType === "line" && (
                  <>
                    <Field label={t("vision.chartTitle")} value={lineTitle} onChange={setLineTitle} placeholder={t("vision.chartTitle")} />
                    <Field label={`${t("vision.xlabel")} (${t("mind.chars")})`} value={lineX} onChange={setLineX} placeholder="1月,2月,3月" />
                    <div>
                      <label className="text-xs text-muted-foreground">{t("vision.seriesData")}</label>
                      <textarea value={lineSeries} onChange={(e) => setLineSeries(e.target.value)}
                        rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
                    </div>
                  </>
                )}
                {chartType === "pie" && (
                  <>
                    <Field label={t("vision.chartTitle")} value={pieTitle} onChange={setPieTitle} placeholder={t("vision.chartTitle")} />
                    <Field label={`${t("vision.labels")} (${t("mind.chars")})`} value={pieLabels} onChange={setPieLabels} placeholder="A,B,C" />
                    <Field label={`${t("vision.values")} (${t("mind.chars")})`} value={pieValues} onChange={setPieValues} placeholder="30,40,30" />
                  </>
                )}
                {chartType === "scatter" && (
                  <>
                    <Field label={t("vision.chartTitle")} value={scatterTitle} onChange={setScatterTitle} placeholder={t("vision.chartTitle")} />
                    <Field label={`X (${t("mind.chars")})`} value={scatterX} onChange={setScatterX} placeholder="1,2,3" />
                    <Field label={`Y (${t("mind.chars")})`} value={scatterY} onChange={setScatterY} placeholder="10,20,30" />
                  </>
                )}

                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}

                <button onClick={handleGenerateChart} disabled={loading}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {loading ? t("vision.generating") : t("vision.generate")}
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">{t("vision.resultPreview")}</h3>
                {imageUrl ? (
                  <img src={imageUrl} alt="Chart" className="w-full rounded-lg border border-border" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <ImageIcon size={40} className="mb-3 opacity-30" />
                    <p className="text-xs">{t("vision.noPreview")}</p>
                  </div>
                )}
              </div>
              {lastMeta && (
                <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">Engine</span><span className="font-mono">{lastMeta.engine}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{lastMeta.type}</span></div>
                  {lastMeta.elapsed && <div className="flex justify-between"><span className="text-muted-foreground">Ms</span><span>{lastMeta.elapsed}ms</span></div>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Mind Map Tab */}
        {tab === "mindmap" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5 space-y-3">
                <h3 className="font-semibold text-sm">{t("vision.mindmapData")}</h3>
                <Field label={t("vision.chartTitle")} value={mindmapTitle} onChange={setMindmapTitle} placeholder={t("vision.mindmapPlaceholder")} />
                <div>
                  <label className="text-xs text-muted-foreground">JSON</label>
                  <textarea value={mindmapData} onChange={(e) => setMindmapData(e.target.value)}
                    rows={12}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono resize-none" />
                </div>
                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}
                <button onClick={handleGenerateMindmap} disabled={loading}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                  {loading ? t("vision.generating") : t("vision.generate")}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-sm mb-3">{t("vision.resultPreview")}</h3>
              {imageUrl ? (
                <img src={imageUrl} alt="Mind Map" className="w-full rounded-lg border border-border" />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Network size={40} className="mb-3 opacity-30" />
                  <p className="text-xs">{t("vision.noPreview")}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outputs Tab */}
        {tab === "outputs" && (
          <div>
            {outputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileImage size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t("vision.noOutputs")}</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {outputs.map((f) => (
                  <div key={f.filename} className="rounded-xl border border-border bg-card p-3 space-y-2">
                    <div className="aspect-square rounded-lg bg-muted flex items-center justify-center overflow-hidden">
                      <img
                        src={`${apiBase}/api/vision/outputs/${f.filename}`}
                        alt={f.filename}
                        className="w-full h-full object-contain"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    </div>
                    <div className="text-xs font-mono truncate">{f.filename}</div>
                    <div className="text-[10px] text-muted-foreground">{formatBytes(f.size_bytes)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string;
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
    </div>
  );
}

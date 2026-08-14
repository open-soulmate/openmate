"use client";

import { useState, useCallback, useEffect } from "react";
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
  const [barTitle, setBarTitle] = useState("季度销售额");
  const [barColor, setBarColor] = useState("#e11d48");

  // Line chart form
  const [lineX, setLineX] = useState("1月,2月,3月,4月,5月,6月");
  const [lineSeries, setLineSeries] = useState("产品A:100,120,140,160,180,200\n产品B:80,90,110,130,120,150");
  const [lineTitle, setLineTitle] = useState("趋势对比");

  // Pie chart form
  const [pieLabels, setPieLabels] = useState("Python,JavaScript,Rust,Go,Other");
  const [pieValues, setPieValues] = useState("35,28,15,12,10");
  const [pieTitle, setPieTitle] = useState("语言使用分布");

  // Scatter form
  const [scatterX, setScatterX] = useState("1,2,3,4,5,6,7,8,9,10");
  const [scatterY, setScatterY] = useState("2.1,3.9,6.2,7.8,10.1,12.3,13.8,16.2,18.1,20.5");
  const [scatterTitle, setScatterTitle] = useState("散点图");

  // Mind map form
  const [mindmapData, setMindmapData] = useState(JSON.stringify({
    label: "AI工程", children: [
      { label: "Prompt Engineering" },
      { label: "RAG", children: [{ label: "向量检索" }, { label: "混合召回" }] },
      { label: "Agent", children: [{ label: "工具调用" }, { label: "多Agent协作" }] },
      { label: "Fine-tuning" },
    ],
  }, null, 2));
  const [mindmapTitle, setMindmapTitle] = useState("AI工程知识图谱");

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
      try { root = JSON.parse(mindmapData); } catch { setError("JSON格式错误"); setLoading(false); return; }

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
    { id: "bar" as const, label: "柱状图", icon: BarChart3 },
    { id: "line" as const, label: "折线图", icon: TrendingUp },
    { id: "pie" as const, label: "饼图", icon: PieChart },
    { id: "scatter" as const, label: "散点图", icon: ScatterChart },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <ImageIcon size={20} className="text-indigo-500" />
          <h1 className="text-lg font-semibold">视觉 · 图表生成</h1>
          <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-500">
            图表 · 思维导图
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Main tabs */}
        <div className="flex gap-2">
          {[
            { id: "chart" as const, label: "图表生成", icon: BarChart3 },
            { id: "mindmap" as const, label: "思维导图", icon: Network },
            { id: "outputs" as const, label: "输出文件", icon: FileImage },
          ].map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === t.id ? "bg-indigo-500/10 text-indigo-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <t.icon size={14} /> {t.label}
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
                    <Field label="标题" value={barTitle} onChange={setBarTitle} placeholder="图表标题" />
                    <Field label="标签 (逗号分隔)" value={barLabels} onChange={setBarLabels} placeholder="Q1,Q2,Q3,Q4" />
                    <Field label="数值 (逗号分隔)" value={barValues} onChange={setBarValues} placeholder="120,150,180,200" />
                    <Field label="颜色" value={barColor} onChange={setBarColor} placeholder="#e11d48" />
                  </>
                )}
                {chartType === "line" && (
                  <>
                    <Field label="标题" value={lineTitle} onChange={setLineTitle} placeholder="图表标题" />
                    <Field label="X轴 (逗号分隔)" value={lineX} onChange={setLineX} placeholder="1月,2月,3月" />
                    <div>
                      <label className="text-xs text-muted-foreground">数据系列 (每行: 名称:值1,值2,...)</label>
                      <textarea value={lineSeries} onChange={(e) => setLineSeries(e.target.value)}
                        rows={3} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono" />
                    </div>
                  </>
                )}
                {chartType === "pie" && (
                  <>
                    <Field label="标题" value={pieTitle} onChange={setPieTitle} placeholder="图表标题" />
                    <Field label="标签 (逗号分隔)" value={pieLabels} onChange={setPieLabels} placeholder="A,B,C" />
                    <Field label="数值 (逗号分隔)" value={pieValues} onChange={setPieValues} placeholder="30,40,30" />
                  </>
                )}
                {chartType === "scatter" && (
                  <>
                    <Field label="标题" value={scatterTitle} onChange={setScatterTitle} placeholder="图表标题" />
                    <Field label="X值 (逗号分隔)" value={scatterX} onChange={setScatterX} placeholder="1,2,3" />
                    <Field label="Y值 (逗号分隔)" value={scatterY} onChange={setScatterY} placeholder="10,20,30" />
                  </>
                )}

                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}

                <button onClick={handleGenerateChart} disabled={loading}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                  {loading ? "生成中..." : "生成图表"}
                </button>
              </div>
            </div>

            {/* Preview */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card p-5">
                <h3 className="font-semibold text-sm mb-3">预览</h3>
                {imageUrl ? (
                  <img src={imageUrl} alt="Chart" className="w-full rounded-lg border border-border" />
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <ImageIcon size={40} className="mb-3 opacity-30" />
                    <p className="text-xs">生成图表后在此预览</p>
                  </div>
                )}
              </div>
              {lastMeta && (
                <div className="rounded-xl border border-border bg-card p-4 text-xs space-y-1">
                  <div className="flex justify-between"><span className="text-muted-foreground">引擎</span><span className="font-mono">{lastMeta.engine}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">类型</span><span>{lastMeta.type}</span></div>
                  {lastMeta.elapsed && <div className="flex justify-between"><span className="text-muted-foreground">耗时</span><span>{lastMeta.elapsed}ms</span></div>}
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
                <h3 className="font-semibold text-sm">思维导图数据</h3>
                <Field label="标题" value={mindmapTitle} onChange={setMindmapTitle} placeholder="思维导图标题" />
                <div>
                  <label className="text-xs text-muted-foreground">JSON 数据结构</label>
                  <textarea value={mindmapData} onChange={(e) => setMindmapData(e.target.value)}
                    rows={12}
                    className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-mono resize-none" />
                </div>
                {error && <div className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-500">{error}</div>}
                <button onClick={handleGenerateMindmap} disabled={loading}
                  className="flex items-center justify-center gap-2 w-full rounded-lg bg-indigo-500 px-4 py-2.5 text-sm text-white hover:bg-indigo-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                  {loading ? "生成中..." : "生成思维导图"}
                </button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <h3 className="font-semibold text-sm mb-3">预览</h3>
              {imageUrl ? (
                <img src={imageUrl} alt="Mind Map" className="w-full rounded-lg border border-border" />
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                  <Network size={40} className="mb-3 opacity-30" />
                  <p className="text-xs">生成思维导图后在此预览</p>
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
                <p className="text-sm">暂无输出文件</p>
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

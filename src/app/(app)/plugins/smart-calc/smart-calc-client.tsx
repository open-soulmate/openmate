"use client";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";
import {
import { useTranslation } from 'react-i18next';

  Calculator, ArrowRightLeft, History, Trash2, Loader2,
  Copy, Check, ChevronDown, Zap, Clock,
} from "lucide-react";

interface CalcResult {
  expression: string;
  result: number;
  result_int: number | null;
  elapsed_ms: number;
}

interface ConvertResult {
  value: number;
  from_unit: string;
  to_unit: string;
  result: number;
}

interface HistoryEntry {
  type: string;
  input: string;
  output: string;
  timestamp: number;
}

interface UnitsInfo {
  categories: Record<string, string[]>;
}

type Tab = "calc" | "convert" | "history";

export function SmartCalcClient() {
  const { t } = useTranslation();
  const apiBase = getApiBaseUrl();
  const pluginBase = `${apiBase}/api/plugins/smart-calc`;
  const [tab, setTab] = useState<Tab>("calc");

  // Calculator state
  const [expression, setExpression] = useState("");
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null);
  const [calcLoading, setCalcLoading] = useState(false);
  const [calcError, setCalcError] = useState("");
  const [copied, setCopied] = useState(false);

  // Converter state
  const [convValue, setConvValue] = useState("1");
  const [convFrom, setConvFrom] = useState("km");
  const [convTo, setConvTo] = useState("mi");
  const [convResult, setConvResult] = useState<ConvertResult | null>(null);
  const [convLoading, setConvLoading] = useState(false);
  const [convError, setConvError] = useState("");
  const [units, setUnits] = useState<UnitsInfo | null>(null);
  const [unitCategory, setUnitCategory] = useState("length");

  // History state
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  // Quick expressions
  const quickExprs = [
    "2**10", "sqrt(144)", "pi * 2", "factorial(10)",
    "log10(1000)", "sin(radians(30))", "gcd(48, 18)", "ceil(3.14)",
  ];

  const doCalculate = useCallback(async () => {
    if (!expression.trim()) return;
    setCalcLoading(true);
    setCalcError("");
    try {
      const res = await fetch(`${pluginBase}/calculate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expression: expression.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Calculation failed");
      }
      setCalcResult(await res.json());
    } catch (e: any) {
      setCalcError(e.message);
    }
    setCalcLoading(false);
  }, [expression, pluginBase]);

  const doConvert = useCallback(async () => {
    if (!convValue.trim()) return;
    setConvLoading(true);
    setConvError("");
    try {
      const res = await fetch(`${pluginBase}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          value: parseFloat(convValue),
          from_unit: convFrom,
          to_unit: convTo,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Conversion failed");
      }
      setConvResult(await res.json());
    } catch (e: any) {
      setConvError(e.message);
    }
    setConvLoading(false);
  }, [convValue, convFrom, convTo, pluginBase]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${pluginBase}/history?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data.history || []);
      }
    } catch {}
  }, [pluginBase]);

  const fetchUnits = useCallback(async () => {
    try {
      const res = await fetch(`${pluginBase}/units`);
      if (res.ok) setUnits(await res.json());
    } catch {}
  }, [pluginBase]);

  const clearHistory = useCallback(async () => {
    try {
      await fetch(`${pluginBase}/history`, { method: "DELETE" });
      setHistory([]);
    } catch {}
  }, [pluginBase]);

  useEffect(() => {
    fetchUnits();
    fetchHistory();
  }, [fetchUnits, fetchHistory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (tab === "calc") doCalculate();
      else if (tab === "convert") doConvert();
    }
  };

  const copyResult = () => {
    const text = calcResult?.result_int !== null
      ? String(calcResult?.result_int)
      : String(calcResult?.result);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const formatTime = (ts: number) => {
    return new Date(ts * 1000).toLocaleString("zh-CN", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  };

  const currentUnits = units?.categories?.[unitCategory] || [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10">
          <Calculator size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-lg font-semibold">Smart Calculator</h1>
          <p className="text-xs text-muted-foreground">{t('plugins.t37981')}<p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-3">
        {(["calc", "convert", "history"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); if (t === "history") fetchHistory(); }}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }t('plugins.t41022')rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                      unitCategory === cat ? "bg-primary text-primary-foreground" : "border border-border text-muted-foreground hover:text-foreground"
                    }t('plugins.t37576')shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      entry.type === "calculate" ? "bg-blue-500/10 text-blue-500" : "bg-amber-500/10 text-amber-500"
                    }`}>
                      {entry.type === "calculate" ? t('plugins.t26871') : t('plugins.t56039')}
                    </span>
                    <span className="flex-1 font-mono text-sm truncate">{entry.input}</span>
                    <span className="font-mono text-sm font-medium text-primary">= {entry.output}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{formatTime(entry.timestamp)}</span>
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

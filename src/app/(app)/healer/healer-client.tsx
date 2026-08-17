"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Stethoscope, RefreshCw, Play, Zap, CheckCircle,
  XCircle, AlertTriangle, Clock, Loader2, Heart,
  Activity, Wrench, History, ChevronDown, ChevronRight,
} from "lucide-react";

interface OrganResult {
  organ: string;
  healthy: boolean;
  severity: string;
  symptoms: string[];
  root_cause: string;
  recommended_action: string;
  action_taken: string;
  action_success: boolean;
  response_time_ms: number;
  timestamp: number;
}

interface CycleResult {
  cycle_complete: boolean;
  elapsed_seconds: number;
  total_organs: number;
  healthy: number;
  unhealthy: number;
  healed: number;
  notified: any;
  organs: OrganResult[];
}

export function HealerClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"dashboard" | "history" | "stats">("dashboard");
  const [health, setHealth] = useState<any>(null);
  const [results, setResults] = useState<OrganResult[]>([]);
  const [cycleResult, setCycleResult] = useState<CycleResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [healingOrg, setHealingOrg] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/healer/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/healer/history?limit=100`);
      const data = await res.json();
      setHistory(data.history || []);
    } catch {}
  }, [apiBase]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/healer/stats`);
      setStats(await res.json());
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
    if (tab === "stats") fetchStats();
  }, [tab, fetchHistory, fetchStats]);

  const handleDiagnoseAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/healer/diagnose-all`, { method: "POST" });
      const data = await res.json();
      setResults(data.organs || []);
      fetchHealth();
    } catch {} finally { setLoading(false); }
  };

  const handleHealAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/healer/heal-all`, { method: "POST" });
      const data = await res.json();
      setResults(data.organs || []);
      fetchHealth();
    } catch {} finally { setLoading(false); }
  };

  const handleFullCycle = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/healer/cycle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_heal: true, notify: true, audit: true }),
      });
      const data = await res.json();
      setCycleResult(data);
      setResults(data.organs || []);
      fetchHealth();
    } catch {} finally { setLoading(false); }
  };

  const handleHealSingle = async (organ: string) => {
    setHealingOrg(organ);
    try {
      const res = await fetch(`${apiBase}/api/healer/heal/${organ}t('healer.t28109')${Math.min(100, (count as number) / Math.max(...Object.values(stats.organ_failure_frequency).map(Number)) * 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{count as number}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

"use client";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  Shield, RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Ban, Unlock, Search, Activity, Eye, Clock,
} from "lucide-react";

interface AuditEntry {
  id: number;
  action: string;
  client_ip: string;
  endpoint: string;
  detail: string;
  risk_level: string;
  ts: number;
}

export function ImmuneClient() {
  const [tab, setTab] = useState<"moderate" | "rate" | "ip" | "audit">("moderate");
  const [health, setHealth] = useState<any>(null);
  const [modText, setModText] = useState("");
  const [modResult, setModResult] = useState<any>(null);
  const [rateKey, setRateKey] = useState("");
  const [rateResult, setRateResult] = useState<any>(null);
  const [ipLists, setIpLists] = useState<any>(null);
  const [newIp, setNewIp] = useState("");
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/immune/health`);
      setHealth(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchIpLists = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/immune/ip/lists`);
      setIpLists(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/immune/audit/log?limit=50`);
      const data = await res.json();
      setAuditLog(data.entries || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    if (tab === "ip") fetchIpLists();
    if (tab === "audit") fetchAudit();
  }, [tab, fetchHealth, fetchIpLists, fetchAudit]);

  const handleModerate = async () => {
    if (!modText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/immune/moderate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: modText }),
      });
      setModResult(await res.json());
    } catch {} finally { setLoading(false); }
  };

  const handleRateCheck = async () => {
    if (!rateKey.trim()) return;
    try {
      const res = await fetch(`${apiBase}/api/immune/rate-limit/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: rateKey }),
      });
      setRateResult(await res.json());
    } catch {}
  };

  const handleIpAction = async (action: "blacklist" | "whitelist", ip: string) => {
    if (!ip.trim()) return;
    try {
      await fetch(`${apiBase}/api/immune/ip/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip, reason: "manual" }),
      });
      setNewIp("");
      fetchIpLists();
    } catch {}
  };

  const handleIpRemove = async (action: "blacklist" | "whitelist", ip: string) => {
    try {
      await fetch(`${apiBase}/api/immune/ip/${action}/${ip}`, { method: "DELETE" });
      fetchIpLists();
    } catch {}
  };

  const tabs = [
    { id: "moderate" as const, label: "内容风控", icon: Eye },
    { id: "rate" as const, label: "限流", icon: Activity },
    { id: "ip" as const, label: "IP管控", icon: Ban },
    { id: "audit" as const, label: "审计日志", icon: Clock },
  ];

  const riskColor = (r: string) => r === "high" ? "text-red-500" : r === "medium" ? "text-amber-500" : "text-emerald-500";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Shield size={20} className="text-orange-500" />
          <h1 className="text-lg font-semibold">OpenImmune 免疫系统</h1>
          <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-500">
            风控 · 限流 · 审计
          </span>
        </div>
        <button onClick={() => { fetchHealth(); tab === "ip" && fetchIpLists(); tab === "audit" && fetchAudit(); }}
          className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted transition-colors">
          <RefreshCw size={14} /> 刷新
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stats */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={Eye} label="风控规则" value={health.modules?.moderator?.patterns || 0} color="text-orange-500" bg="bg-orange-500/10" />
            <StatCard icon={Activity} label="限流跟踪" value={health.modules?.rate_limiter?.tracked_keys || 0} color="text-blue-500" bg="bg-blue-500/10" />
            <StatCard icon={Ban} label="黑名单" value={health.modules?.access_control?.blacklist_count || 0} color="text-red-500" bg="bg-red-500/10" />
            <StatCard icon={Clock} label="审计条目" value={health.modules?.audit?.total_entries || 0} color="text-violet-500" bg="bg-violet-500/10" />
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-2">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn("flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm transition-colors",
                tab === t.id ? "bg-orange-500/10 text-orange-600 font-medium" : "hover:bg-muted text-muted-foreground")}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Content Moderation */}
        {tab === "moderate" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <textarea
                value={modText}
                onChange={(e) => setModText(e.target.value)}
                placeholder="输入要检测的文本内容..."
                className="flex-1 rounded-lg border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-orange-500/20 min-h-[100px] resize-none"
              />
            </div>
            <button onClick={handleModerate} disabled={loading}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600 disabled:opacity-50">
              {loading ? "检测中..." : "开始风控检测"}
            </button>
            {modResult && (
              <div className={cn("rounded-xl border p-4 space-y-2", modResult.is_safe ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
                <div className="flex items-center gap-2">
                  {modResult.is_safe ? <CheckCircle size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                  <span className="font-medium text-sm">{modResult.is_safe ? "安全" : "检测到风险"}</span>
                  <span className={cn("text-xs", riskColor(modResult.risk_level))}>风险等级: {modResult.risk_level}</span>
                </div>
                {modResult.findings?.length > 0 && (
                  <div className="space-y-1">
                    {modResult.findings.map((f: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <AlertTriangle size={12} className={riskColor(f.risk)} />
                        <span className="font-mono">{f.type}</span>
                        <span className="text-muted-foreground">{f.label}</span>
                      </div>
                    ))}
                  </div>
                )}
                {modResult.redacted_text && modResult.redacted_text !== modText && (
                  <div className="text-xs">
                    <span className="text-muted-foreground">脱敏后: </span>
                    <span className="font-mono">{modResult.redacted_text}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Rate Limiting */}
        {tab === "rate" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input value={rateKey} onChange={(e) => setRateKey(e.target.value)}
                placeholder="输入限流 key (如 IP 或用户 ID)"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20"
                onKeyDown={(e) => e.key === "Enter" && handleRateCheck()} />
              <button onClick={handleRateCheck}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm text-white hover:bg-orange-600">检测</button>
            </div>
            {rateResult && (
              <div className={cn("rounded-xl border p-4", rateResult.allowed ? "border-emerald-500/30" : "border-red-500/30")}>
                <div className="flex items-center gap-2 mb-2">
                  {rateResult.allowed ? <CheckCircle size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
                  <span className="font-medium text-sm">{rateResult.allowed ? "允许" : "已限流"}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-xs text-muted-foreground">
                  <div>分钟: {rateResult.minute_count}/{rateResult.minute_limit}</div>
                  <div>小时: {rateResult.hour_count}/{rateResult.hour_limit}</div>
                  <div>突发: {rateResult.burst_count}/{rateResult.burst_limit}</div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* IP Control */}
        {tab === "ip" && (
          <div className="space-y-4">
            <div className="flex gap-3">
              <input value={newIp} onChange={(e) => setNewIp(e.target.value)}
                placeholder="输入 IP 地址"
                className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20" />
              <button onClick={() => handleIpAction("blacklist", newIp)}
                className="rounded-lg bg-red-500 px-3 py-2 text-sm text-white hover:bg-red-600">加入黑名单</button>
              <button onClick={() => handleIpAction("whitelist", newIp)}
                className="rounded-lg bg-emerald-500 px-3 py-2 text-sm text-white hover:bg-emerald-600">加入白名单</button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-medium mb-3 text-red-500">黑名单 ({ipLists?.blacklist?.length || 0})</h3>
                {ipLists?.blacklist?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无</p>
                ) : (
                  <div className="space-y-1">
                    {ipLists?.blacklist?.map((item: any) => (
                      <div key={item.ip} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{item.ip}</span>
                        <button onClick={() => handleIpRemove("blacklist", item.ip)}
                          className="text-muted-foreground hover:text-red-500"><Unlock size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-medium mb-3 text-emerald-500">白名单 ({ipLists?.whitelist?.length || 0})</h3>
                {ipLists?.whitelist?.length === 0 ? (
                  <p className="text-xs text-muted-foreground">暂无</p>
                ) : (
                  <div className="space-y-1">
                    {ipLists?.whitelist?.map((item: any) => (
                      <div key={item.ip} className="flex items-center justify-between text-xs">
                        <span className="font-mono">{item.ip}</span>
                        <button onClick={() => handleIpRemove("whitelist", item.ip)}
                          className="text-muted-foreground hover:text-red-500"><Unlock size={12} /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Audit Log */}
        {tab === "audit" && (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">时间</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">操作</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">IP</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">风险</th>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">详情</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground text-xs">暂无审计记录</td></tr>
                ) : auditLog.map((e) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(e.ts * 1000).toLocaleString("zh-CN")}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">{e.action}</td>
                    <td className="px-4 py-2.5 text-xs font-mono">{e.client_ip}</td>
                    <td className="px-4 py-2.5"><span className={cn("text-xs font-medium", riskColor(e.risk_level))}>{e.risk_level}</span></td>
                    <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[200px]">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color, bg }: {
  icon: React.ElementType; label: string; value: number | string; color: string; bg: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className={cn("rounded-lg p-1.5", bg)}><Icon size={14} className={color} /></div>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

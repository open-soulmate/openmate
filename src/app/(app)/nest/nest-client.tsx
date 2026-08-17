"use client";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { getApiBaseUrl } from "@/lib/api-client";
import {
  RefreshCw, Plus, Trash2, Home, Shield, Users,
  Settings, BarChart3, Loader2, AlertTriangle,
  CheckCircle, XCircle, Search, Activity,
} from "lucide-react";

interface Tenant {
  tenant_id: string;
  name: string;
  tier: string;
  status: string;
  namespace: string;
  owner_user_id: string;
  description: string;
  tags: string[];
  created_at: number;
  usage_percent: Record<string, number>;
}

interface Policy {
  resource_type: string;
  namespace_scoped: boolean;
  cross_tenant_allowed: boolean;
  encryption_enabled: boolean;
  audit_access: boolean;
}

interface NestStats {
  tenants: {
    total_tenants: number;
    by_tier: Record<string, number>;
    by_status: Record<string, number>;
    total_storage_bytes: number;
    total_documents: number;
  };
  isolation: {
    total_access_checks: number;
    blocked_attempts: number;
    block_rate: number;
    policies_count: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function tierColor(tier: string): string {
  if (tier === "enterprise") return "text-amber-500 bg-amber-500/10";
  if (tier === "pro") return "text-indigo-500 bg-indigo-500/10";
  return "text-muted-foreground bg-muted";
}

function statusIcon(s: string) {
  if (s === "active") return <CheckCircle size={14} className="text-emerald-500" />;
  if (s === "suspended") return <XCircle size={14} className="text-red-500" />;
  if (s === "trial") return <Activity size={14} className="text-amber-500" />;
  return <AlertTriangle size={14} className="text-muted-foreground" />;
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleString("zh-CN", {
    month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  });
}

export function NestClient() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<"tenants" | "policies" | "audit">("tenants");
  const [stats, setStats] = useState<NestStats | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [selected, setSelected] = useState<Tenant | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);

  // Create form
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState("free");
  const [newDesc, setNewDesc] = useState("");
  const [newOwner, setNewOwner] = useState("");

  // Quota check
  const [quotaResource, setQuotaResource] = useState("storage");
  const [quotaResult, setQuotaResult] = useState<any>(null);

  const apiBase = getApiBaseUrl();

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nest/health`);
      setStats(await res.json());
    } catch {}
  }, [apiBase]);

  const fetchTenants = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nest/tenants`);
      const data = await res.json();
      setTenants(data.tenants || []);
    } catch {}
  }, [apiBase]);

  const fetchPolicies = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nest/policies`);
      const data = await res.json();
      setPolicies(data.policies || []);
    } catch {}
  }, [apiBase]);

  const fetchAudit = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/nest/audit?limit=50`);
      const data = await res.json();
      setAuditLog(data.entries || []);
    } catch {}
  }, [apiBase]);

  useEffect(() => {
    fetchStats();
    fetchTenants();
  }, [fetchStats, fetchTenants]);

  useEffect(() => {
    if (tab === "policies") fetchPolicies();
    if (tab === "audit") fetchAudit();
  }, [tab, fetchPolicies, fetchAudit]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/nest/tenants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName, tier: newTier, description: newDesc, owner_user_id: newOwner,
        }),
      });
      if (res.ok) {
        setShowCreate(false);
        setNewName(""); setNewDesc(""); setNewOwner("");
        fetchTenants(); fetchStats();
      }
    } catch {} finally { setLoading(false); }
  };

  const handleSuspend = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/nest/tenants/${id}/suspend`, { method: "POST" });
      fetchTenants(); fetchStats();
    } catch {}
  };

  const handleReactivate = async (id: string) => {
    try {
      await fetch(`${apiBase}/api/nest/tenants/${id}/reactivate`, { method: "POST" });
      fetchTenants(); fetchStats();
    } catch {}
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('nest.t86075'))) return;
    try {
      await fetch(`${apiBase}/api/nest/tenants/${id}`, { method: "DELETE" });
      setSelected(null);
      fetchTenants(); fetchStats();
    } catch {}
  };

  const handleQuotaCheck = async (tenantId: string) => {
    try {
      const res = await fetch(`${apiBase}/api/nest/tenants/${tenantId}/quota/checkt('nest.t98475')${Math.min(pct, 100)}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Detail Panel */}
            {selected && (
              <div className="w-80 space-y-4">
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-sm">{selected.name}</h3>
                    <div className="flex gap-1">
                      {selected.status === "active" ? (
                        <button onClick={() => handleSuspend(selected.tenant_id)}
                          className="rounded-md p-1.5 text-amber-500 hover:bg-amber-500/10" title=t('nest.suspend')>
                          <AlertTriangle size={14} />
                        </button>
                      ) : (
                        <button onClick={() => handleReactivate(selected.tenant_id)}
                          className="rounded-md p-1.5 text-emerald-500 hover:bg-emerald-500/10" title=t('mind.activate')>
                          <CheckCircle size={14} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(selected.tenant_id)}
                        className="rounded-md p-1.5 text-red-500 hover:bg-red-500/10" title=t('common.delete')>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">ID</span>
                      <span className="font-mono">{selected.tenant_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('nest.namespace')}<span>
                      <span className="font-mono">{selected.namespace}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('nest.tier')}<span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tierColor(selected.tier))}>
                        {selected.tier}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t('marrow.status')}<span>
                      <span>{selected.status}</span>
                    </div>
                    {selected.description && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">{t('nest.description')}<span>
                        <span className="text-right max-w-[160px] truncate">{selected.description}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quota Check */}
                <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                  <h4 className="text-sm font-medium">{t('nest.t97921')}<h4>
                  <div className="flex gap-2">
                    <select value={quotaResource} onChange={(e) => setQuotaResource(e.target.value)}
                      className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs">
                      <option value="storage">{t('settings.storage')}<option>
                      <option value="documents">{t('nest.t71898')}<option>
                      <option value="api_calls">API{t('nest.t50574')}</option>
                      <option value="tokens">Token</option>
                      <option value="agents">Agent</option>
                    </select>
                    <button onClick={() => handleQuotaCheck(selected.tenant_id)}
                      className="rounded-lg bg-rose-500 px-3 py-1.5 text-xs text-white hover:bg-rose-600">
                      {t('nest.t59827')}
                    <button>
                  </div>
                  {quotaResult && (
                    <div className={cn("rounded-lg p-3 text-xs",
                      quotaResult.allowed ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                      <p>{quotaResult.allowed ? t('nest.t38298') : t('nest.t85553')}</p>
                      {quotaResult.current !== undefined && (
                        <p>{t('nest.t16779')}: {quotaResult.current} / {t('nest.t76355')}: {quotaResult.limit} ({quotaResult.percent}%)</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Policies Tab */}
        {tab === "policies" && (
          <div className="space-y-3">
            {policies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <Shield size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t('nest.t38713')}<p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.resourceType')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.t35555')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.crossTenant')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.encryption')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.audit')}<th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((p) => (
                      <tr key={p.resource_type} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 font-mono text-xs">{p.resource_type}</td>
                        <td className="px-4 py-2.5">
                          {p.namespace_scoped ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-muted-foreground" />}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.cross_tenant_allowed ? <CheckCircle size={14} className="text-amber-500" /> : <XCircle size={14} className="text-emerald-500" />}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.encryption_enabled ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-muted-foreground" />}
                        </td>
                        <td className="px-4 py-2.5">
                          {p.audit_access ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-muted-foreground" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Audit Tab */}
        {tab === "audit" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <button onClick={fetchAudit}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-muted">
                <RefreshCw size={12} />  {t('common.refresh')}
              <button>
              <span className="text-xs text-muted-foreground">{auditLog.length} {t('nest.t35518')}</span>
            </div>
            {auditLog.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <BarChart3 size={40} className="mb-3 opacity-30" />
                <p className="text-sm">{t('immune.noAudit')}<p>
              </div>
            ) : (
              <div className="rounded-xl border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('dashboard.time')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.tenants')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.t73039')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('vein.actions')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('graphBuilder.result')}<th>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">{t('nest.t60561')}<th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((entry, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatTime(entry.timestamp)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs">{entry.tenant_id?.slice(0, 12)}</td>
                        <td className="px-4 py-2.5 text-xs">{entry.resource_type}</td>
                        <td className="px-4 py-2.5 text-xs">{entry.action}</td>
                        <td className="px-4 py-2.5">
                          {entry.allowed ? <CheckCircle size={14} className="text-emerald-500" /> : <XCircle size={14} className="text-red-500" />}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground max-w-[200px] truncate">{entry.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 space-y-4">
              <h3 className="font-semibold">{t('nest.t17794')}<h3>
              <input value={newName} onChange={(e) => setNewName(e.target.value)}
                placeholder=t('nest.t67136') className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <select value={newTier} onChange={(e) => setNewTier(e.target.value)}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm">
                <option value="free">Free ({t('nest.t05169')})</option>
                <option value="pro">Pro ({t('nest.t75104')})</option>
                <option value="enterprise">Enterprise ({t('nest.t33102')})</option>
              </select>
              <input value={newOwner} onChange={(e) => setNewOwner(e.target.value)}
                placeholder=t('nest.t44632') className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)}
                placeholder=t('nest.t65256') className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" />
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowCreate(false)}
                  className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">{t('common.cancel')}<button>
                <button onClick={handleCreate} disabled={loading}
                  className="rounded-lg bg-rose-500 px-4 py-2 text-sm text-white hover:bg-rose-600 disabled:opacity-50">
                  {loading ? <Loader2 size={14} className="animate-spin" /> : t('common.create')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

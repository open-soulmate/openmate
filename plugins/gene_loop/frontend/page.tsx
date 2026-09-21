"use client";
/**
 * Gene进化回流面板 — 提案流水/审核/promote（架构v2.1砖1，gene-loop插件前端）
 * 数据链路: 本页 → /api/gene-loop(Next代理) → acp-proxy:8092 /api/gene-loop/*
 * 操作语义: 通过+入库=review(approved,auto_promote)→Gene dev_norm模板；驳回需填理由
 */
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Dna,
  GitMerge, Loader2, Plus, RefreshCw, XCircle,
} from "lucide-react";

interface Evidence { quote: string; source: string }

interface Proposal {
  proposal_id: string;
  source_cycle: string;
  actor: string;
  type: string;
  content: string;
  governance: string;
  scope: string;
  confidence: number;
  evidence: Evidence[];
  status: string;
  review_reviewer?: string;
  review_reason?: string;
  promoted_to?: string;
  promoted_at?: number;
  created_at: number;
}

interface StatusInfo {
  counts: Record<string, number>;
  pending_review: string[];
  open_escalations: string[];
  gene_api_ok: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  proposed: "待审核",
  approved: "已通过",
  promoted: "已入库",
  rejected: "已驳回",
};

const TYPE_LABEL: Record<string, string> = {
  lesson: "教训",
  new_rule: "新规范",
  refine_rule: "细化规范",
  deprecate_rule: "废弃规范",
};

async function api(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`/api/gene-loop?path=${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });
  return res.json();
}

export default function GeneLoopPage() {
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [filter, setFilter] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        api("status"),
        api(filter ? `proposals&status=${filter}&limit=30` : "proposals&limit=30"),
      ]);
      setStatus(s);
      setProposals(p.proposals || []);
    } catch {
      setStatus(null);
    }
  }, [filter]);

  useEffect(() => { refresh(); }, [refresh]);

  const propose = async () => {
    setBusy(true);
    setNotice("");
    try {
      const r = await api("propose", {
        method: "POST",
        body: JSON.stringify({ limit: 5 }),
      });
      setNotice(r.ok
        ? `生成提案 ${r.inserted} 条${r.errors?.length ? `（${r.errors.length}条被不变量拦截）` : ""}`
        : `生成失败：${r.errors?.[0]?.error || r.error || "unknown"}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const review = async (id: string, verdict: "approved" | "rejected") => {
    let reason = "";
    if (verdict === "rejected") {
      reason = window.prompt("驳回理由：") || "";
      if (!reason) return;
    }
    setBusy(true);
    try {
      const r = await api(`review/${id}`, {
        method: "POST",
        body: JSON.stringify({
          verdict,
          reviewer: "user",
          reason,
          auto_promote: verdict === "approved",
        }),
      });
      setNotice(r.ok
        ? verdict === "approved"
          ? r.promote?.ok
            ? `${id} 已入库 → ${r.promote.promoted_to}`
            : `${id} 通过，但promote失败：${r.promote?.error || "未知"}`
          : `${id} 已驳回`
        : `操作失败：${r.detail || r.error || ""}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const counts = status?.counts || {};
  const escalations = status?.open_escalations?.length || 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-4">
        {/* 头部 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold">Gene 进化回流</h1>
            <span className={cn(
              "text-xs px-2 py-0.5 rounded-full border",
              status?.gene_api_ok
                ? "text-emerald-600 border-emerald-600/30 bg-emerald-500/10"
                : "text-destructive border-destructive/30 bg-destructive/10",
            )}>
              Gene API {status?.gene_api_ok ? "在线" : "离线"}
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={propose}
              disabled={busy}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              生成提案
            </button>
            <button
              onClick={() => refresh()}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border hover:bg-accent">
              <RefreshCw className="w-4 h-4" />
              刷新
            </button>
          </div>
        </div>

        {notice && (
          <div className="text-sm px-3 py-2 rounded-md bg-accent border">{notice}</div>
        )}

        {/* 统计chips（点击筛选） */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Chip label="待审核" n={counts.proposed || 0} active={filter === "proposed"}
                onClick={() => setFilter(filter === "proposed" ? "" : "proposed")} />
          <Chip label="已通过" n={counts.approved || 0} active={filter === "approved"}
                onClick={() => setFilter(filter === "approved" ? "" : "approved")} />
          <Chip label="已入库" n={counts.promoted || 0} active={filter === "promoted"}
                onClick={() => setFilter(filter === "promoted" ? "" : "promoted")} />
          <Chip label="已驳回" n={counts.rejected || 0} active={filter === "rejected"}
                onClick={() => setFilter(filter === "rejected" ? "" : "rejected")} />
          {escalations > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full border text-amber-600 border-amber-600/30 bg-amber-500/10">
              <AlertTriangle className="w-3 h-3" />
              待拍板 {escalations}
            </span>
          )}
        </div>

        {/* 提案列表 */}
        <div className="space-y-3">
          {proposals.length === 0 && (
            <div className="text-center text-muted-foreground py-12 text-sm">
              暂无提案。点击「生成提案」从evo反馈/audit中提炼规范候选。
            </div>
          )}
          {proposals.map((p) => (
            <div key={p.proposal_id} className="rounded-lg border bg-card p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <StatusBadge status={p.status} />
                  <Badge>{TYPE_LABEL[p.type] || p.type}</Badge>
                  <Badge>{p.governance === "constraint" ? "硬约束" : "背景知识"}</Badge>
                  <Badge>置信 {(p.confidence * 100).toFixed(0)}%</Badge>
                  <Badge><Dna className="w-3 h-3 mr-0.5 inline" />{p.actor}</Badge>
                </div>
                <span className="text-xs text-muted-foreground font-mono shrink-0">
                  {p.proposal_id}
                </span>
              </div>
              <p className="text-sm leading-relaxed">{p.content}</p>
              {p.promoted_to && (
                <div className="text-xs font-mono text-emerald-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {p.promoted_to}
                </div>
              )}
              {p.review_reason && (
                <div className="text-xs text-muted-foreground">
                  审核：{p.review_reviewer} · {p.review_reason}
                </div>
              )}
              {/* 证据展开 */}
              <button
                onClick={() => setExpanded((e) => ({ ...e, [p.proposal_id]: !e[p.proposal_id] }))}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                {expanded[p.proposal_id]
                  ? <ChevronDown className="w-3.5 h-3.5" />
                  : <ChevronRight className="w-3.5 h-3.5" />}
                证据 {p.evidence?.length || 0} 条
              </button>
              {expanded[p.proposal_id] && (
                <div className="space-y-1.5 pl-3 border-l-2 border-border ml-1">
                  {(p.evidence || []).map((e, i) => (
                    <div key={i} className="text-xs">
                      <div className="text-foreground/90">「{e.quote}」</div>
                      <div className="text-muted-foreground font-mono">{e.source}</div>
                    </div>
                  ))}
                </div>
              )}
              {/* 审核操作 */}
              {(p.status === "proposed" || p.status === "approved") && (
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => review(p.proposal_id, "approved")}
                    disabled={busy}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-emerald-600/10 text-emerald-600 border border-emerald-600/30 hover:bg-emerald-600/20 disabled:opacity-50">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    通过+入库
                  </button>
                  <button
                    onClick={() => review(p.proposal_id, "rejected")}
                    disabled={busy}
                    className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-md bg-destructive/10 text-destructive border border-destructive/30 hover:bg-destructive/20 disabled:opacity-50">
                    <XCircle className="w-3.5 h-3.5" />
                    驳回
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Chip({ label, n, active, onClick }: {
  label: string; n: number; active: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2 py-1 rounded-full border transition-colors",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "hover:bg-accent",
      )}>
      {label} {n}
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-1.5 py-0.5 rounded border bg-accent/50 text-muted-foreground inline-flex items-center">
      {children}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    proposed: "text-amber-600 border-amber-600/30 bg-amber-500/10",
    approved: "text-blue-600 border-blue-600/30 bg-blue-500/10",
    promoted: "text-emerald-600 border-emerald-600/30 bg-emerald-500/10",
    rejected: "text-destructive border-destructive/30 bg-destructive/10",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border", map[status] || "border bg-accent")}>
      {STATUS_LABEL[status] || status}
    </span>
  );
}

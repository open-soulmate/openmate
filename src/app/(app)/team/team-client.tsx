"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { getApiBaseUrl } from "@/lib/api-client";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Users,
  Plus,
  Trash2,
  Clock,
  Search,
  Bot,
  Server,
  Plug,
  Crown,
  Activity,
  CheckSquare,
  ChevronRight,
  Loader2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

// ─── API Types ──────────────────────────────────────────────────────────────

interface ApiAgent {
  id: string;
  group_id: string;
  agent_id: string;
  name: string;
  role: string;
  model: string;
  status: string;
  temperature: number;
}

interface ApiGroup {
  id: string;
  name: string;
  description: string;
  status: string;
  created_at: string;
  agents: ApiAgent[];
  task_count: number;
}

// ─── Mapped Types ───────────────────────────────────────────────────────────

interface TeamMember {
  id: string;
  agentId: string;
  name: string;
  model: string;
  role: "leader" | "member" | "reviewer";
  status: "online" | "offline" | "busy";
}

interface Team {
  id: string;
  name: string;
  description: string;
  status: string;
  members: TeamMember[];
  taskCount: number;
  createdAt: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapAgentRole(apiRole: string): "leader" | "member" | "reviewer" {
  switch (apiRole) {
    case "advisor":
      return "leader";
    case "verifier":
      return "reviewer";
    default:
      return "member";
  }
}

function mapAgentStatus(apiStatus: string): "online" | "offline" | "busy" {
  if (apiStatus === "online") return "online";
  if (apiStatus === "busy") return "busy";
  return "offline";
}

function mapGroupToTeam(group: ApiGroup): Team {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    status: group.status,
    members: group.agents.map((a) => ({
      id: a.id,
      agentId: a.agent_id,
      name: a.name,
      model: a.model,
      role: mapAgentRole(a.role),
      status: mapAgentStatus(a.status),
    })),
    taskCount: group.task_count,
    createdAt: new Date(group.created_at).getTime(),
  };
}

function formatTime(ts: number, t?: (key: string, opts?: any) => string) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t?.("team.justNow") || "刚刚";
  if (diff < 3_600_000)
    return (
      t?.("team.minutesAgo", { minutes: Math.floor(diff / 60_000) }) ||
      `${Math.floor(diff / 60_000)} 分钟前`
    );
  if (diff < 86_400_000)
    return (
      t?.("team.hoursAgo", { hours: Math.floor(diff / 3_600_000) }) ||
      `${Math.floor(diff / 3_600_000)} 小时前`
    );
  return new Date(ts).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  advisor: Crown,
  executor: Bot,
  verifier: Server,
  member: Plug,
};

const AGENT_COLORS: Record<string, string> = {
  advisor: "text-amber-400",
  executor: "text-violet-400",
  verifier: "text-emerald-400",
  member: "text-blue-400",
};

// ─── Create Team Dialog ─────────────────────────────────────────────────────

function CreateTeamDialog({
  open,
  onClose,
  onSave,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string }) => void;
  isLoading: boolean;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const { t } = useTranslation();

  function reset() {
    setName("");
    setDescription("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function handleSubmit() {
    if (!name.trim()) return;
    onSave({ name: name.trim(), description: description.trim() });
  }

  const isValid = name.trim();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("team.createTeam") || "创建团队"}
      description={t("team.createDesc") || "创建一个新的 Agent 协作团队"}
      className="max-w-xl"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("team.cancel") || "取消"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {isLoading && <Loader2 size={12} className="animate-spin" />}
            {t("team.create") || "创建"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("team.teamName") || "团队名称"}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("team.sampleTeamName") || "研究团队"}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("team.description") || "描述"}
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={
              t("team.sampleTeamDesc") || "专注于协作研究的 Agent 团队"
            }
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>
    </Dialog>
  );
}

// ─── Team Card ──────────────────────────────────────────────────────────────

function TeamCard({
  team,
  onDelete,
}: {
  team: Team;
  onDelete: (team: Team) => void;
}) {
  const { t } = useTranslation();
  const onlineCount = team.members.filter((m) => m.status === "online").length;
  const leader = team.members.find((m) => m.role === "leader");

  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users size={18} />
          </div>
          <div>
            <h3 className="text-sm font-medium">{team.name}</h3>
            {team.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                {team.description}
              </p>
            )}
          </div>
        </div>
        <Badge variant={onlineCount > 0 ? "success" : "default"}>
          {onlineCount > 0
            ? t("team.active") || "活跃"
            : t("team.idle") || "空闲"}
        </Badge>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <Users size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {team.members.length}
          </span>
          <span className="text-[10px] text-emerald-400">
            {onlineCount}
            {t("team.online") || "在线"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <CheckSquare size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {team.taskCount} {t("team.todo") || "待办"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <Activity size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {leader ? leader.name : t("team.noLeader") || "无负责人"}
          </span>
        </div>
      </div>

      {/* Members preview */}
      <div className="mb-3 flex items-center gap-1">
        {team.members.slice(0, 5).map((m) => {
          const roleKey = m.role === "leader" ? "advisor" : m.role === "reviewer" ? "verifier" : "executor";
          const Icon = AGENT_ICONS[roleKey] ?? Bot;
          return (
            <div
              key={m.id}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted",
                m.status === "online" ? "ring-1 ring-emerald-500/50" : "",
                m.status === "busy" ? "ring-1 ring-amber-500/50" : "",
              )}
              title={`${m.name} (${m.role})`}
            >
              <Icon size={12} className={AGENT_COLORS[roleKey]} />
            </div>
          );
        })}
        {team.members.length > 5 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[10px] text-muted-foreground">
            +{team.members.length - 5}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock size={11} />
          <span>{formatTime(team.createdAt, t)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <Link
            href={`/team/${team.id}`}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ChevronRight size={12} />
            {t("team.enter") || "进入"}
          </Link>
          <button
            onClick={() => onDelete(team)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={t("team.delete") || "删除"}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TeamClient() {
  const { t } = useTranslation();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchTeams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/ai-groups`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: ApiGroup[] = await res.json();
      setTeams(data.map(mapGroupToTeam));
    } catch (err: any) {
      console.error("Failed to fetch teams:", err);
      setError(err.message || "Failed to load teams");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [fetchTeams]);

  const filtered = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleCreate(data: { name: string; description: string }) {
    setCreating(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/ai-groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
        }),
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      await fetchTeams();
      setShowCreate(false);
    } catch (err: any) {
      console.error("Failed to create team:", err);
      alert(err.message || "Failed to create team");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const apiBase = getApiBaseUrl();
      const res = await fetch(`${apiBase}/api/ai-groups/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      await fetchTeams();
      setDeleteTarget(null);
    } catch (err: any) {
      console.error("Failed to delete team:", err);
      alert(err.message || "Failed to delete team");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users size={18} />
          </div>
          <div>
            <h2 className="text-sm font-medium">
              {t("team.teamManagement") || "团队管理"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {teams.length} {t("team.teamCount") || "个团队"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchTeams}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            title={t("team.refresh") || "刷新"}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            {t("team.createTeam") || "创建团队"}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("team.searchTeams") || "搜索团队..."}
            className="w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-16">
            <Loader2 size={32} className="animate-spin text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">
              {t("team.loading") || "加载中..."}
            </p>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
              <AlertCircle className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="mb-2 text-sm font-medium text-destructive">
              {t("team.loadError") || "加载失败"}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">{error}</p>
            <button
              onClick={fetchTeams}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <RefreshCw size={12} />
              {t("team.retry") || "重试"}
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">
              {t("team.noTeams") || "暂无团队"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {t("team.createFirstHint") ||
                "点击「创建团队」按钮创建你的第一个 Agent 协作团队"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((team) => (
              <TeamCard key={team.id} team={team} onDelete={setDeleteTarget} />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateTeamDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        isLoading={creating}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("team.deleteTeam") || "删除团队"}
        description={
          t("team.confirmDelete", { name: deleteTarget?.name }) ||
          `确定要删除 "${deleteTarget?.name}" 吗？此操作不可撤销。`
        }
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("team.cancel") || "取消"}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {t("team.delete") || "删除"}
            </button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("team.memberCount") || "成员数"}:{" "}
            {deleteTarget?.members.length ?? 0} ·{" "}
            {t("team.taskCount") || "任务数"}: {deleteTarget?.taskCount ?? 0}
          </p>
        </div>
      </Dialog>
    </div>
  );
}

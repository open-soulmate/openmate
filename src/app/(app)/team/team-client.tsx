"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  useAppStore,
  type Team,
  type TeamMember,
  type AgentNode,
} from "@/stores/app-store";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
import { useTranslation } from 'react-i18next';

  Users,
  Plus,
  Trash2,
  Edit3,
  Clock,
  Search,
  Bot,
  Server,
  Plug,
  Crown,
  Activity,
  CheckSquare,
  ChevronRight,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 60_000) return t('common.justNow');
  if (diff < 3_600_000) return t('team.t44780', { floordiff60000: Math.floor(diff / 60_000) });
  if (diff < 86_400_000) return t('team.t56992', { floordiff3600000: Math.floor(diff / 3_600_000) });
  return new Date(ts).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  soma: Server,
  ai: Bot,
  mcp: Plug,
};

const AGENT_COLORS: Record<string, string> = {
  soma: "text-emerald-400",
  ai: "text-violet-400",
  mcp: "text-amber-400",
};

// ─── Create Team Dialog ─────────────────────────────────────────────────────

function CreateTeamDialog({
  open,
  onClose,
  onSave,
  agents,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string; members: TeamMember[] }) => void;
  agents: AgentNode[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  function reset() {
    setName("");
    setDescription("");
    setSelectedAgents([]);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleAgent(id: string) {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    if (!name.trim()) return;
    const members: TeamMember[] = selectedAgents.map((agentId, i) => {
      const agent = agents.find((a) => a.id === agentId);
      return {
        id: uid(),
        agentId,
        name: agent?.name ?? "Unknown",
        type: agent?.type ?? "ai",
        role: i === 0 ? "leader" : "member",
        status: "online",
        capabilities: [],
        joinedAt: Date.now(),
      };
    });
    onSave({ name: name.trim(), description: description.trim(), members });
    handleClose();
  }

  const isValid = name.trim();

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title=t('team.createTeam')
      description=t('team.t60322')
      className="max-w-xl"
      footer={
        <>
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t('common.cancel')}
          <button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('common.create')}
          <button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('team.teamName')}<label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder=t('team.t71259')
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t('team.description')}<label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder=t('team.t42436')
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t('team.t64167')}<span className="text-muted-foreground/60">（{t('team.t91339')}</span>
          </label>
          <div className="grid gap-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
            {agents.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{t('team.t52835')}<p>
            ) : (
              agents.map((a) => {
                const isSelected = selectedAgents.includes(a.id);
                const Icon = AGENT_ICONS[a.type] ?? Bot;
                return (
                  <button
                    key={a.id}
                    onClick={() => toggleAgent(a.id)}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      isSelected
                        ? "bg-accent border border-border"
                        : "hover:bg-accent/50 border border-transparent",
                    )}
                  >
                    <Icon size={14} className={cn(AGENT_COLORS[a.type], "shrink-0")} />
                    <span className="flex-1 truncate">{a.name}</span>
                    {isSelected && selectedAgents.indexOf(a.id) === 0 && (
                      <Badge variant="warning">
                        <Crown size={10} className="mr-1" />
                        Leader
                      </Badge>
                    )}
                    {isSelected && selectedAgents.indexOf(a.id) !== 0 && (
                      <Badge variant="default">{t('team.t72978')}<Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
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
  const onlineCount = team.members.filter((m) => m.status === "online").length;
  const leader = team.members.find((m) => m.role === "leader");
  const recentActivities = team.activities.slice(0, 3);
  const pendingTasks = team.tasks.filter((t) => t.status !== "done").length;

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
          {onlineCount > 0 ? t('link.active') : t('team.idle')}
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
            {onlineCount}{t('team.t50749')}          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <CheckSquare size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {pendingTasks} {t('team.t36487')}          </span>
        </div>
        <div className="flex items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1.5">
          <Activity size={12} className="text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground">
            {team.activities.length} {t('team.t48086')}          </span>
        </div>
      </div>

      {/* Members preview */}
      <div className="mb-3 flex items-center gap-1">
        {team.members.slice(0, 5).map((m) => {
          const Icon = AGENT_ICONS[m.type] ?? Bot;
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
              <Icon size={12} className={AGENT_COLORS[m.type]} />
            </div>
          );
        })}
        {team.members.length > 5 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[10px] text-muted-foreground">
            +{team.members.length - 5}
          </div>
        )}
      </div>

      {/* Recent activity */}
      {recentActivities.length > 0 && (
        <div className="mb-3 space-y-1">
          {recentActivities.map((a) => (
            <div key={a.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <div className="h-1 w-1 rounded-full bg-muted-foreground/50" />
              <span className="truncate">{a.description}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock size={11} />
          <span>{formatTime(team.updatedAt)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <Link
            href={`/team/${team.id}`}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <ChevronRight size={12} /> 
            {t('team.t42472')}
          <Link>
          <button
            onClick={() => onDelete(team)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title=t('common.delete')
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
  const teams = useAppStore((s) => s.teams);
  const addTeam = useAppStore((s) => s.addTeam);
  const deleteTeam = useAppStore((s) => s.deleteTeam);
  const agents = useAppStore((s) => s.agentNodes);

  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Team | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = teams.filter(
    (t) =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleCreate(data: { name: string; description: string; members: TeamMember[] }) {
    const now = Date.now();
    addTeam({
      id: uid(),
      name: data.name,
      description: data.description,
      members: data.members,
      activities: data.members.map((m) => ({
        id: uid(),
        type: "member_joined" as const,
        actorId: m.agentId,
        actorName: m.name,
        description: t('team.t56458', { name: m.name }),
        timestamp: now,
      })),
      tasks: [],
      createdAt: now,
      updatedAt: now,
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteTeam(deleteTarget.id);
    setDeleteTarget(null);
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
            <h2 className="text-sm font-medium">{t('team.t17448')}<h2>
            <p className="text-xs text-muted-foreground">
              {teams.length} {t('team.t89739')}            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} /> 
          {t('team.createTeam')}
        <button>
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
            placeholder=t('team.t61208')
            className="w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">{t('team.noTeams')}<h3>
            <p className="text-xs text-muted-foreground">
              {t('team.t78145')}
            <p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((team) => (
              <TeamCard
                key={team.id}
                team={team}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateTeamDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSave={handleCreate}
        agents={agents}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title=t('team.deleteTeam')
        description={t('team.t65798', { name: deleteTarget?.name })}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t('common.cancel')}
            <button>
            <button
              onClick={handleDelete}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.delete')}
            <button>
          </>
        }
      >
        <div className="rounded-lg border border-border bg-muted/50 p-3">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-muted-foreground" />
            <span className="text-sm font-medium">{deleteTarget?.name}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('team.t47527')}: {deleteTarget?.members.length ?? 0} · {t('team.t42311')}:{" "}
            {deleteTarget?.tasks.length ?? 0}
          </p>
        </div>
      </Dialog>
    </div>
  );
}

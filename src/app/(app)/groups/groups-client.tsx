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
  MessageSquare,
  Clock,
  Search,
  Loader2,
  AlertCircle,
  UserPlus,
  X,
} from "lucide-react";

// ─── Types from API ─────────────────────────────────────────────────────────

interface ApiAgent {
  id: string;
  group_id: string;
  agent_id: string;
  name: string;
  role: "advisor" | "executor" | "verifier";
  model: string;
  status: "online" | "offline";
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

interface AgentRow {
  agent_id: string;
  name: string;
  role: "advisor" | "executor" | "verifier";
  model: string;
  temperature: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(ts: string, t?: (key: string, opts?: any) => string) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60_000) return t?.("groups.justNow") || "Just now";
  if (diff < 3_600_000) return t?.("groups.minutesAgo", { minutes: Math.floor(diff / 60_000) }) || `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return t?.("groups.hoursAgo", { hours: Math.floor(diff / 3_600_000) }) || `${Math.floor(diff / 3_600_000)}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

const ROLE_COLORS: Record<string, string> = {
  advisor: "text-violet-400",
  executor: "text-emerald-400",
  verifier: "text-amber-400",
};

const ROLE_LABELS: Record<string, string> = {
  advisor: "advisor",
  executor: "executor",
  verifier: "verifier",
};

// ─── API helpers ────────────────────────────────────────────────────────────

async function fetchGroups(): Promise<ApiGroup[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/ai-groups`);
  if (!res.ok) throw new Error(`Failed to fetch groups: ${res.status}`);
  return res.json();
}

async function createGroupApi(data: { name: string; description: string; agents: AgentRow[] }): Promise<ApiGroup> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/ai-groups`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create group: ${res.status}`);
  return res.json();
}

async function deleteGroupApi(groupId: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/api/ai-groups/${groupId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Failed to delete group: ${res.status}`);
}

// ─── Create Group Dialog ────────────────────────────────────────────────────

function GroupFormDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [agentRows, setAgentRows] = useState<AgentRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  function reset() {
    setName("");
    setDescription("");
    setAgentRows([]);
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addAgentRow() {
    setAgentRows((prev) => [
      ...prev,
      { agent_id: "", name: "", role: "executor", model: "", temperature: 0.7 },
    ]);
  }

  function removeAgentRow(idx: number) {
    setAgentRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateAgentRow(idx: number, field: keyof AgentRow, value: string | number) {
    setAgentRows((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row)),
    );
  }

  async function handleSubmit() {
    if (!name.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const validAgents = agentRows.filter((a) => a.agent_id.trim() && a.name.trim());
      await createGroupApi({
        name: name.trim(),
        description: description.trim(),
        agents: validAgents,
      });
      handleClose();
      onCreated();
    } catch (err: any) {
      setError(err.message || "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = name.trim().length > 0;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={t("groups.createGroupDialog") || "Create Agent Group"}
      description={t("groups.createGroupDialogDesc") || "Create a new Agent collaboration group"}
      className="max-w-xl"
      footer={
        <>
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("groups.cancel") || "Cancel"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || submitting}
            className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 size={12} className="animate-spin" />}
            {t("groups.create") || "Create Agent Group"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("groups.groupName") || "Group Name"}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("groups.sampleGroupName") || "Research Group"}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("groups.description") || "Description"}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("groups.sampleGroupDesc") || "Agent group for collaborative research"}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Agent Rows */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">{t("groups.agents") || "Agents"}</label>
            <button
              type="button"
              onClick={addAgentRow}
              className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
            >
              <UserPlus size={12} />
              {t("groups.addAgent") || "Add Agent"}
            </button>
          </div>

          {agentRows.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              {t("groups.noAgentsAdded") || "No agents added"}
            </p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {agentRows.map((row, idx) => (
                <div key={idx} className="flex items-start gap-2 rounded-md border border-border p-2">
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={row.agent_id}
                      onChange={(e) => updateAgentRow(idx, "agent_id", e.target.value)}
                      placeholder={t("groups.agentId") || "Agent ID"}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <input
                      type="text"
                      value={row.name}
                      onChange={(e) => updateAgentRow(idx, "name", e.target.value)}
                      placeholder={t("groups.agentName") || "Agent Name"}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs outline-none focus:border-primary"
                    />
                    <select
                      value={row.role}
                      onChange={(e) => updateAgentRow(idx, "role", e.target.value)}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs outline-none focus:border-primary"
                    >
                      <option value="advisor">Advisor</option>
                      <option value="executor">Executor</option>
                      <option value="verifier">Verifier</option>
                    </select>
                    <input
                      type="text"
                      value={row.model}
                      onChange={(e) => updateAgentRow(idx, "model", e.target.value)}
                      placeholder={t("groups.model") || "Model"}
                      className="rounded-md border border-border bg-muted/50 px-2 py-1.5 text-xs outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAgentRow(idx)}
                    className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Dialog>
  );
}

// ─── Group Card ─────────────────────────────────────────────────────────────

function GroupCard({
  group,
  onDelete,
}: {
  group: ApiGroup;
  onDelete: (group: ApiGroup) => void;
}) {
  const { t } = useTranslation();
  const advisor = group.agents.find((a) => a.role === "advisor");
  const memberCount = group.agents.length;
  const onlineCount = group.agents.filter((a) => a.status === "online").length;

  return (
    <div className="group rounded-lg border border-border bg-card p-4 transition-all hover:border-primary/40 hover:shadow-lg">
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Users size={18} />
          </div>
          <div>
            <h3 className="text-sm font-medium">{group.name}</h3>
            {group.description && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">
                {group.description}
              </p>
            )}
          </div>
        </div>
        <Badge variant={group.status === "active" ? "success" : "default"}>
          {group.status}
        </Badge>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <Users size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {memberCount} {t("groups.members") || "members"}
          </span>
          <span className="text-[10px] text-emerald-400">
            ({onlineCount} {t("groups.online") || "Online"})
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <span className="text-xs text-muted-foreground truncate">
            {advisor?.name ?? (t("groups.notSet") || "Not set")}
          </span>
        </div>
      </div>

      {/* Agent roles preview */}
      <div className="mb-3 flex flex-wrap items-center gap-1">
        {group.agents.slice(0, 5).map((agent) => (
          <div
            key={agent.id}
            className={cn(
              "flex h-7 items-center gap-1 rounded-full border border-border bg-muted px-2",
              agent.status === "online" ? "ring-1 ring-emerald-500/50" : "",
            )}
            title={`${agent.name} (${agent.role})`}
          >
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full shrink-0",
                agent.status === "online" ? "bg-emerald-400" : "bg-gray-400",
              )}
            />
            <span className={cn("text-[10px] truncate max-w-[60px]", ROLE_COLORS[agent.role])}>
              {agent.name}
            </span>
          </div>
        ))}
        {group.agents.length > 5 && (
          <div className="flex h-7 items-center justify-center rounded-full border border-border bg-muted px-2 text-[10px] text-muted-foreground">
            +{group.agents.length - 5}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock size={11} />
          <span>{formatTime(group.created_at, t)}</span>
          {group.task_count > 0 && (
            <span className="ml-2 text-[10px] text-muted-foreground/60">
              · {group.task_count} {t("groups.tasks") || "Task"}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <Link
            href={`/groups/${group.id}`}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquare size={12} />
            {t("groups.enter") || "Enter"}
          </Link>
          <button
            onClick={() => onDelete(group)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={t("groups.delete") || "Delete"}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export function GroupsClient() {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiGroup | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loadGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGroups();
      setGroups(data);
    } catch (err: any) {
      setError(err.message || "Failed to load groups");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const filtered = groups.filter(
    (g) =>
      g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      g.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteGroupApi(deleteTarget.id);
      setDeleteTarget(null);
      await loadGroups();
    } catch (err: any) {
      setError(err.message || "Failed to delete group");
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
            <h2 className="text-sm font-medium">{t("groups.title") || "Agent Groups"}</h2>
            <p className="text-xs text-muted-foreground">
              {groups.length} {t("groups.groupCount") || "groups"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          {t("groups.createGroup") || "Create Group"}
        </button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("groups.searchGroups") || "Search groups..."}
            className="w-full rounded-md border border-border bg-muted/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-primary transition-colors"
          />
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle size={14} />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-destructive/60 hover:text-destructive">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-muted-foreground" />
            <p className="mt-3 text-xs text-muted-foreground">{t("groups.loading") || "Loading..."}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center py-16">
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
              <Users className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-sm font-medium">{t("groups.noGroups") || "No groups"}</h3>
            <p className="text-xs text-muted-foreground">
              {t("groups.createFirstHint") || "Click \"Create Group\" to create your first Agent collaboration group"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                onDelete={setDeleteTarget}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <GroupFormDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={loadGroups}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("groups.deleteGroup") || "Delete Group"}
        description={t("groups.confirmDelete", { name: deleteTarget?.name }) || `确定要删除 "${deleteTarget?.name}" 吗？此操作不可撤销。`}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("groups.cancel") || "Cancel"}
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
            >
              {deleting && <Loader2 size={12} className="animate-spin" />}
              {t("groups.delete") || "Delete"}
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
            {t("groups.memberCount") || "Members"}: {deleteTarget?.agents.length ?? 0} · {t("groups.tasks") || "Task"}: {deleteTarget?.task_count ?? 0}
          </p>
        </div>
      </Dialog>
    </div>
  );
}

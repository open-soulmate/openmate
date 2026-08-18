"use client";

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useAppStore, type AgentGroup, type GroupDispatchMode, type AgentNode } from "@/stores/app-store";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Users,
  Plus,
  Trash2,
  Edit3,
  MessageSquare,
  Crown,
  Clock,
  Search,
  Bot,
  Server,
  Plug,
  Settings,
  ChevronRight,
  Zap,
  Hand,
} from "lucide-react";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatTime(ts: number, t?: (key: string, opts?: any) => string) {
  if (!ts) return "—";
  const d = new Date(ts);
  const now = Date.now();
  const diff = now - ts;
  if (diff < 60_000) return t?.("groups.justNow") || "刚刚";
  if (diff < 3_600_000) return t?.("groups.minutesAgo", { minutes: Math.floor(diff / 60_000) }) || `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return t?.("groups.hoursAgo", { hours: Math.floor(diff / 3_600_000) }) || `${Math.floor(diff / 3_600_000)} 小时前`;
  return d.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
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

// ─── Create / Edit Group Dialog ──────────────────────────────────────────────

function GroupFormDialog({
  open,
  onClose,
  onSave,
  agents,
  editingGroup,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: Omit<AgentGroup, "id" | "createdAt" | "updatedAt">) => void;
  agents: AgentNode[];
  editingGroup?: AgentGroup | null;
}) {
  const [name, setName] = useState(editingGroup?.name ?? "");
  const [description, setDescription] = useState(editingGroup?.description ?? "");
  const [masterAgentId, setMasterAgentId] = useState(editingGroup?.masterAgentId ?? "");
  const [memberAgentIds, setMemberAgentIds] = useState<string[]>(editingGroup?.memberAgentIds ?? []);
  const [dispatchMode, setDispatchMode] = useState<GroupDispatchMode>(editingGroup?.dispatchMode ?? "auto");
  const { t } = useTranslation();

  function reset() {
    setName("");
    setDescription("");
    setMasterAgentId("");
    setMemberAgentIds([]);
    setDispatchMode("auto");
  }

  function handleClose() {
    reset();
    onClose();
  }

  function toggleMember(id: string) {
    setMemberAgentIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleSubmit() {
    if (!name.trim() || !masterAgentId) return;
    const allMembers = Array.from(new Set([masterAgentId, ...memberAgentIds]));
    onSave({
      name: name.trim(),
      description: description.trim(),
      masterAgentId,
      memberAgentIds: allMembers,
      dispatchMode,
    });
    handleClose();
  }

  const isValid = name.trim() && masterAgentId;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={editingGroup ? t("groups.editGroup") || "编辑 Agent 群" : t("groups.createGroupDialog") || "创建 Agent 群"}
      description={editingGroup ? t("groups.editGroupDesc") || "修改群配置" : t("groups.createGroupDialogDesc") || "创建一个新的 Agent 协作群"}
      className="max-w-xl"
      footer={
        <>
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            {t("groups.cancel") || "取消"}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {editingGroup ? (t("groups.save") || "保存") : (t("groups.create") || "创建")}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Name */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("groups.groupName") || "群名称"}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("groups.sampleGroupName") || "研究小组"}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("groups.description") || "描述"}</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("groups.sampleGroupDesc") || "用于协作研究的 Agent 群"}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          />
        </div>

        {/* Master Agent */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("groups.masterAgent") || "主 Agent（调度者）"}
          </label>
          <select
            value={masterAgentId}
            onChange={(e) => setMasterAgentId(e.target.value)}
            className="w-full rounded-md border border-border bg-muted/50 px-3 py-2 text-sm outline-none focus:border-primary transition-colors"
          >
            <option value="">{t("groups.selectMasterAgent") || "选择主 Agent..."}</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        </div>

        {/* Member Agents */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            {t("groups.memberAgent") || "成员 Agent"} <span className="text-muted-foreground/60">{t("groups.clickToAddRemove") || "（点击添加/移除）"}</span>
          </label>
          <div className="grid gap-2 max-h-48 overflow-y-auto rounded-lg border border-border p-2">
            {agents.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">{t("groups.noAvailableAgent") || "暂无可用 Agent"}</p>
            ) : (
              agents.map((a) => {
                const isMaster = a.id === masterAgentId;
                const isMember = memberAgentIds.includes(a.id);
                const Icon = AGENT_ICONS[a.type] ?? Bot;
                return (
                  <button
                    key={a.id}
                    onClick={() => !isMaster && toggleMember(a.id)}
                    disabled={isMaster}
                    className={cn(
                      "flex items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
                      isMaster
                        ? "bg-primary/10 border border-primary/30 cursor-default"
                        : isMember
                          ? "bg-accent border border-border"
                          : "hover:bg-accent/50 border border-transparent",
                    )}
                  >
                    <Icon size={14} className={cn(AGENT_COLORS[a.type], "shrink-0")} />
                    <span className="flex-1 truncate">{a.name}</span>
                    {isMaster && (
                      <Badge variant="success">
                        <Crown size={10} className="mr-1" />
                        {t("groups.masterAgentBadge") || "主Agent"}
                      </Badge>
                    )}
                    {isMember && !isMaster && (
                      <Badge variant="default">{t("groups.selected") || "已选"}</Badge>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Dispatch Mode */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("groups.dispatchMode") || "调度模式"}</label>
          <div className="flex gap-2">
            {([["auto", (t("groups.autoDispatch") || "自动调度"), Zap, (t("groups.autoDispatchDesc") || "主Agent自动分配任务给成员")], ["manual", (t("groups.manualDispatch") || "手动调度"), Hand, (t("groups.manualDispatchDesc") || "用户手动选择哪个Agent回复")]] as const).map(([key, label, Icon, desc]) => (
              <button
                key={key}
                onClick={() => setDispatchMode(key)}
                className={cn(
                  "flex-1 rounded-lg border p-3 text-left transition-all",
                  dispatchMode === key
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/40",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon size={14} className={dispatchMode === key ? "text-primary" : "text-muted-foreground"} />
                  <span className="text-sm font-medium">{label}</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{desc}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

// ─── Group Card ──────────────────────────────────────────────────────────────

function GroupCard({
  group,
  agents,
  onEdit,
  onDelete,
}: {
  group: AgentGroup;
  agents: AgentNode[];
  onEdit: (group: AgentGroup) => void;
  onDelete: (group: AgentGroup) => void;
}) {
  const { t } = useTranslation();
  const master = agents.find((a) => a.id === group.masterAgentId);
  const memberCount = group.memberAgentIds.length;
  const onlineMembers = group.memberAgentIds.filter(
    (id) => agents.find((a) => a.id === id)?.status === "online",
  ).length;

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
        <Badge variant={group.dispatchMode === "auto" ? "success" : "default"}>
          {group.dispatchMode === "auto" ? (t("groups.autoDispatch") || "自动调度") : (t("groups.manualDispatch") || "手动调度")}
        </Badge>
      </div>

      {/* Stats */}
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <Users size={12} className="text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {memberCount} {t("groups.members") || "成员"}
          </span>
          <span className="text-[10px] text-emerald-400">
            ({onlineMembers} {t("groups.online") || "在线"})
          </span>
        </div>
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5">
          <Crown size={12} className="text-amber-400" />
          <span className="text-xs text-muted-foreground truncate">
            {master?.name ?? (t("groups.notSet") || "未设置")}
          </span>
        </div>
      </div>

      {/* Members preview */}
      <div className="mb-3 flex items-center gap-1">
        {group.memberAgentIds.slice(0, 5).map((id) => {
          const agent = agents.find((a) => a.id === id);
          if (!agent) return null;
          const Icon = AGENT_ICONS[agent.type] ?? Bot;
          return (
            <div
              key={id}
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted",
                agent.status === "online" ? "ring-1 ring-emerald-500/50" : "",
              )}
              title={agent.name}
            >
              <Icon size={12} className={AGENT_COLORS[agent.type]} />
            </div>
          );
        })}
        {group.memberAgentIds.length > 5 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full border border-border bg-muted text-[10px] text-muted-foreground">
            +{group.memberAgentIds.length - 5}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Clock size={11} />
          <span>{formatTime(group.updatedAt, t)}</span>
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-all group-hover:opacity-100">
          <Link
            href={`/groups/${group.id}`}
            className="flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            <MessageSquare size={12} />
            {t("groups.enter") || "进入"}
          </Link>
          <button
            onClick={() => onEdit(group)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title={t("groups.edit") || "编辑"}
          >
            <Edit3 size={13} />
          </button>
          <button
            onClick={() => onDelete(group)}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title={t("groups.delete") || "删除"}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function GroupsClient() {
  const { t } = useTranslation();
  const groups = useAppStore((s) => s.groups);
  const addGroup = useAppStore((s) => s.addGroup);
  const updateGroup = useAppStore((s) => s.updateGroup);
  const deleteGroup = useAppStore((s) => s.deleteGroup);
  const agents = useAppStore((s) => s.agentNodes);

  const [showCreate, setShowCreate] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AgentGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AgentGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filtered = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    g.description.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  function handleCreate(data: Omit<AgentGroup, "id" | "createdAt" | "updatedAt">) {
    const now = Date.now();
    addGroup({
      id: uid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    });
  }

  function handleEdit(data: Omit<AgentGroup, "id" | "createdAt" | "updatedAt">) {
    if (!editingGroup) return;
    updateGroup(editingGroup.id, data);
    setEditingGroup(null);
  }

  function handleDelete() {
    if (!deleteTarget) return;
    deleteGroup(deleteTarget.id);
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
            <h2 className="text-sm font-medium">{t("groups.title") || "Agent 群"}</h2>
            <p className="text-xs text-muted-foreground">
              {groups.length} {t("groups.groupCount") || "个群组"}
            </p>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Plus size={14} />
          {t("groups.createGroup") || "创建群"}
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
            placeholder={t("groups.searchGroups") || "搜索群组..."}
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
            <h3 className="mb-2 text-sm font-medium">{t("groups.noGroups") || "暂无 Agent 群"}</h3>
            <p className="text-xs text-muted-foreground">
              {t("groups.createFirstHint") || "点击「创建群」按钮创建你的第一个 Agent 协作群"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((group) => (
              <GroupCard
                key={group.id}
                group={group}
                agents={agents}
                onEdit={setEditingGroup}
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
        onSave={handleCreate}
        agents={agents}
      />

      {/* Edit Dialog */}
      <GroupFormDialog
        open={!!editingGroup}
        onClose={() => setEditingGroup(null)}
        onSave={handleEdit}
        agents={agents}
        editingGroup={editingGroup}
      />

      {/* Delete Confirmation */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t("groups.deleteGroup") || "删除 Agent 群"}
        description={t("groups.confirmDelete", { name: deleteTarget?.name }) || `确定要删除 "${deleteTarget?.name}" 吗？此操作不可撤销。`}
        footer={
          <>
            <button
              onClick={() => setDeleteTarget(null)}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {t("groups.cancel") || "取消"}
            </button>
            <button
              onClick={handleDelete}
              className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
            >
              {t("groups.delete") || "删除"}
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
            {t("groups.memberCount") || "成员数"}: {deleteTarget?.memberAgentIds.length ?? 0} · {t("groups.dispatchMode") || "调度模式"}: {deleteTarget?.dispatchMode === "auto" ? (t("groups.auto") || "自动") : (t("groups.manual") || "手动")}
          </p>
        </div>
      </Dialog>
    </div>
  );
}

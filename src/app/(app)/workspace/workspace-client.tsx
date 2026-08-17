"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAppStore, type Workspace } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import {
  FolderOpen,
  Plus,
  Clock,
  Files,
  HardDrive,
  MoreVertical,
  Trash2,
  Search,
  ArrowRight,
} from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("workspace.4181f7");
  if (minutes < 60) return t("workspace.d2417d");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("workspace.282930");
  const days = Math.floor(hours / 24);
  if (days < 7) return t("workspace.a3ae10");
  return new Date(timestamp).toLocaleDateString("zh-CN");
}

function WorkspaceCard({
  workspace,
  onDelete,
}: {
  workspace: Workspace;
  onDelete: (id: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <Link
      href={`/workspace/${workspace.id}`}
      className="group relative flex flex-col rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/40 hover:shadow-md"
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <FolderOpen size={20} className="text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {workspace.name}
            </h3>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {workspace.path}
            </p>
          </div>
        </div>

        {/* Menu */}
        <div className="relative">
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
          >
            <MoreVertical size={14} />
          </button>
          {showMenu && (
            <div
              className="absolute right-0 top-8 z-10 w-36 rounded-lg border border-border bg-popover p-1 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={(e) => {
                  e.preventDefault();
                  onDelete(workspace.id);
                  setShowMenu(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs text-destructive hover:bg-accent"
              >
                <Trash2 size={12} />
                {t("workspace.2071f6")}
              <button>
            </div>
          )}
        </div>
      </div>

      {/* Description */}
      {workspace.description && (
        <p className="mb-3 text-xs text-muted-foreground line-clamp-2">
          {workspace.description}
        </p>
      )}

      {/* Stats */}
      <div className="mt-auto flex items-center gap-4 border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock size={12} />
          <span>{formatRelativeTime(workspace.lastModified)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Files size={12} />
          <span>{workspace.fileCount} {t("workspace.2a0c47")}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <HardDrive size={12} />
          <span>{formatBytes(workspace.size)}</span>
        </div>
      </div>

      {/* Hover arrow */}
      <div className="absolute bottom-5 right-5 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground opacity-0 transition-all group-hover:opacity-100">
        <ArrowRight size={12} />
      </div>
    </Link>
  );
}

function CreateWorkspaceDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (name: string, path: string, description: string) => void;
}) {
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [description, setDescription] = useState("");

  const handleSubmit = () => {
    if (name.trim() && path.trim()) {
      onCreate(name.trim(), path.trim(), description.trim());
      setName("");
      setPath("");
      setDescription("");
      onClose();
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t("workspace.bc393d")}
      description={t("workspace.ae170e")}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-3 py-1.5 text-xs text-foreground hover:bg-accent"
          >
            {t("workspace.625fb2")}
          <button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || !path.trim()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {t("workspace.d9ac92")}
          <button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("workspace.d7ec2d")}
          <label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("workspace.797b61")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("workspace.4f35e8")}
          <label>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="~/projects/my-project"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-foreground">
            {t("workspace.f881df")}
          <label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("workspace.aac192")}
            rows={2}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-none"
          />
        </div>
      </div>
    </Dialog>
  );
}

export function WorkspaceClient() {
  const { t } = useTranslation();
  const workspaces = useAppStore((s) => s.workspaces);
  const removeWorkspace = useAppStore((s) => s.removeWorkspace);
  const addWorkspace = useAppStore((s) => s.addWorkspace);
  const [searchQuery, setSearchQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  const filteredWorkspaces = workspaces.filter(
    (ws) =>
      ws.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ws.path.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  const handleCreate = (name: string, path: string, description: string) => {
    const newWs: Workspace = {
      id: `ws-${Date.now()}`,
      name,
      path,
      description: description || undefined,
      lastModified: Date.now(),
      fileCount: 0,
      size: 0,
    };
    addWorkspace(newWs);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {t("workspace.listTitle", t("workspace.4fa8c1"))}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "workspace.listDescription",
                t("workspace.5a4bff"),
              )}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            {t("workspace.create", t("workspace.bc393d"))}
          </button>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("workspace.search", t("workspace.8cf689"))}
            className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {filteredWorkspaces.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted">
              <FolderOpen size={28} className="text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium text-foreground">
              {searchQuery
                ? t("workspace.noMatch", t("workspace.1a4c0e"))
                : t("workspace.empty", t("workspace.fc16dd"))}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchQuery
                ? t("workspace.tryDifferentSearch", t("workspace.5f7f5c"))
                : t(
                    "workspace.createFirst",
                    t("workspace.7574f6"),
                  )}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus size={14} />
                {t("workspace.create", t("workspace.bc393d"))}
              </button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredWorkspaces.map((ws) => (
              <WorkspaceCard
                key={ws.id}
                workspace={ws}
                onDelete={removeWorkspace}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Dialog */}
      <CreateWorkspaceDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreate={handleCreate}
      />
    </div>
  );
}

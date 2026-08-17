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
  if (minutes < 1) return t('common.justNow');
  if (minutes < 60) return t('workspace.t51244', { minutes: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('workspace.t30867', { hours: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t('workspace.t46814', { days: days });
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
      href={`/workspace/${workspace.id}t('workspace.t68366')ws-${Date.now()}`,
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
              {t("workspace.listTitle", "工作区")}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t(
                "workspace.listDescription",
                t('workspace.t76097'),
              )}
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus size={14} />
            {t("workspace.create", "创建工作区")}
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
            placeholder={t("workspace.search", "搜索工作区...")}
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
                ? t("workspace.noMatch", "未找到匹配的工作区")
                : t("workspace.empty", "还没有工作区")}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {searchQuery
                ? t("workspace.tryDifferentSearch", t('workspace.t07225'))
                : t(
                    "workspace.createFirst",
                    t('workspace.t20088'),
                  )}
            </p>
            {!searchQuery && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <Plus size={14} />
                {t("workspace.create", "创建工作区")}
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

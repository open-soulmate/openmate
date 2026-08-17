"use client";

import type { WorkflowNodeType } from "@/stores/workflow-store";
import {
  Play,
  Bot,
  Wrench,
  GitBranch,
  Repeat,
  Code2,
  Database,
  Square,
  Globe,
  Bell,
  Zap,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface PaletteItem {
  type: WorkflowNodeType;
  label: string;
  icon: React.ElementType;
  color: string;
  group: "flow" | "action";
}



const nodeTypeMap: Record<WorkflowNodeType, string> = {
  start: "startNode",
  llm: "llmNode",
  tool: "toolNode",
  condition: "conditionNode",
  loop: "loopNode",
  code: "codeNode",
  knowledge: "knowledgeNode",
  http: "httpNode",
  notify: "notifyNode",
  organ: "organNode",
  script: "scriptNode",
  end: "endNode",
};

export function NodePalette() {
  const { t } = useTranslation();
  const paletteItems: PaletteItem[] = [
    { type: "start", label: t("workflow.nodePalette.start"), icon: Play, color: "text-emerald-500", group: "flow" },
    { type: "condition", label: t("workflow.nodePalette.condition"), icon: GitBranch, color: "text-sky-500", group: "flow" },
    { type: "loop", label: t("workflow.nodePalette.loop"), icon: Repeat, color: "text-orange-500", group: "flow" },
    { type: "end", label: t("workflow.nodePalette.end"), icon: Square, color: "text-red-500", group: "flow" },
    { type: "llm", label: t("workflow.nodePalette.llmCall"), icon: Bot, color: "text-violet-500", group: "action" },
    { type: "http", label: t("workflow.nodePalette.httpRequest"), icon: Globe, color: "text-blue-500", group: "action" },
    { type: "notify", label: t("workflow.nodePalette.sendNotify"), icon: Bell, color: "text-amber-500", group: "action" },
    { type: "organ", label: t("workflow.nodePalette.organCall"), icon: Zap, color: "text-pink-500", group: "action" },
    { type: "knowledge", label: t("workflow.nodePalette.knowledgeSearch"), icon: Database, color: "text-teal-500", group: "action" },
    { type: "script", label: t("workflow.nodePalette.runScript"), icon: Terminal, color: "text-orange-400", group: "action" },
    { type: "tool", label: t("workflow.nodePalette.tool"), icon: Wrench, color: "text-amber-500", group: "action" },
    { type: "code", label: t("workflow.nodePalette.code"), icon: Code2, color: "text-pink-500", group: "action" },
  ];
  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/reactflow-type", nodeTypeMap[item.type]);
    e.dataTransfer.setData("application/reactflow-data-type", item.type);
    e.dataTransfer.setData("application/reactflow-label", item.label);
    e.dataTransfer.effectAllowed = "move";
  };

  const flowItems = paletteItems.filter((i) => i.group === "flow");
  const actionItems = paletteItems.filter((i) => i.group === "action");

  return (
    <div className="flex h-full w-48 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex h-10 shrink-0 items-center border-b border-border px-3">
        <h3 className="text-xs font-medium text-foreground">{t('workflow.nodePalette.nodes')}</h3>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-3">
        {/* Flow control */}
        <div>
          <div className="px-2 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('workflow.nodePalette.flowControl')}</div>
          <div className="space-y-1">
            {flowItems.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className={cn(
                  "flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2",
                  "transition-colors hover:border-primary/40 hover:bg-accent active:cursor-grabbing",
                )}
              >
                <item.icon size={15} className={item.color} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Actions */}
        <div>
          <div className="px-2 mb-1 text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t('workflow.nodePalette.actions')}</div>
          <div className="space-y-1">
            {actionItems.map((item) => (
              <div
                key={item.type}
                draggable
                onDragStart={(e) => onDragStart(e, item)}
                className={cn(
                  "flex cursor-grab items-center gap-2.5 rounded-lg border border-border bg-background px-3 py-2",
                  "transition-colors hover:border-primary/40 hover:bg-accent active:cursor-grabbing",
                )}
              >
                <item.icon size={15} className={item.color} />
                <span className="text-xs font-medium text-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

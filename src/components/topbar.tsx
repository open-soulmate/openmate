"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";

export function Topbar() {
  const pathname = usePathname();
  const { t } = useTranslation();

  const titles: Record<string, string> = {
    "/chat": t("nav.chat"),
    "/knowledge": t("nav.knowledge"),
    "/graph": t("nav.graph"),
    "/search": t("nav.search"),
    "/skills": t("nav.skills"),
    "/agents": t("nav.agents"),
    "/workflow": t("nav.workflow"),
    "/workflow-builder": t("nav.workflowBuilder"),
    "/settings": t("nav.settings"),
    "/learn": t("nav.learn"),
    "/mcp": t("nav.mcp"),
    "/groups": t("nav.groups"),
  };

  const title = titles[pathname] || "OpenMate";

  function openCommandMenu() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>

      <button
        onClick={openCommandMenu}
        className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Search size={14} />
        <span className="hidden sm:inline">{t("search.placeholder").split("...")[0]}...</span>
        <kbd className="pointer-events-none hidden select-none rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
          ⌘K
        </kbd>
      </button>
    </header>
  );
}

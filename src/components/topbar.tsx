"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";

const titles: Record<string, string> = {
  "/chat": "Chat",
  "/knowledge": "Knowledge Base",
  "/graph": "Knowledge Graph",
  "/search": "Search",
  "/skills": "Skills",
  "/settings": "Settings",
};

export function Topbar() {
  const pathname = usePathname();
  const title = titles[pathname] || "OpenMate";

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6">
      <h1 className="text-sm font-semibold tracking-tight">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="flex h-8 items-center gap-2 rounded-md border border-border bg-muted px-3 text-sm text-muted-foreground">
          <Search size={14} />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="pointer-events-none hidden select-none rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            ⌘K
          </kbd>
        </div>
      </div>
    </header>
  );
}

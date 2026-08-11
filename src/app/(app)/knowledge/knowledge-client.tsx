"use client";

import { useState } from "react";
import {
  FileText,
  LinkIcon,
  StickyNote,
  Plus,
  Search,
  Tag,
  MoreHorizontal,
} from "lucide-react";

interface KItem {
  id: string;
  title: string;
  type: "document" | "note" | "link";
  tags: string[];
  updatedAt: string;
  excerpt: string;
}

const mockItems: KItem[] = [
  {
    id: "1",
    title: "Project Architecture Overview",
    type: "document",
    tags: ["architecture", "overview"],
    updatedAt: "2 hours ago",
    excerpt: "High-level architecture of the OpenMate platform and its modules…",
  },
  {
    id: "2",
    title: "API Design Patterns",
    type: "note",
    tags: ["api", "patterns"],
    updatedAt: "1 day ago",
    excerpt: "Common patterns for REST API design in the Soul backend…",
  },
  {
    id: "3",
    title: "Next.js 16 Migration Notes",
    type: "document",
    tags: ["nextjs", "migration"],
    updatedAt: "3 days ago",
    excerpt: "Key changes and migration steps from Next.js 15 to 16…",
  },
  {
    id: "4",
    title: "Open WebUI Reference",
    type: "link",
    tags: ["reference", "ui"],
    updatedAt: "1 week ago",
    excerpt: "https://github.com/open-webui/open-webui",
  },
];

const iconMap = {
  document: FileText,
  note: StickyNote,
  link: LinkIcon,
};

export function KnowledgeClient() {
  const [query, setQuery] = useState("");
  const filtered = mockItems.filter((i) =>
    i.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter items…"
            className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <button className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90">
          <Plus size={14} />
          Add
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => {
            const Icon = iconMap[item.type];
            return (
              <div
                key={item.id}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <Icon size={16} />
                  </div>
                  <button className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent">
                    <MoreHorizontal size={14} />
                  </button>
                </div>
                <h3 className="mb-1 text-sm font-medium">{item.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                  {item.excerpt}
                </p>
                <div className="flex flex-wrap items-center gap-1.5">
                  {item.tags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      <Tag size={8} />
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {item.updatedAt}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

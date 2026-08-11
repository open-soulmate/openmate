"use client";

import { useState } from "react";
import { Search, FileText, MessageSquare, Network, Puzzle } from "lucide-react";

const mockResults = [
  {
    id: "1",
    type: "knowledge",
    icon: FileText,
    title: "Project Architecture Overview",
    snippet: "…the platform consists of a Next.js frontend, Soul backend, and plugin system…",
    module: "Knowledge",
  },
  {
    id: "2",
    type: "chat",
    icon: MessageSquare,
    title: "Conversation about API design",
    snippet: "…we discussed REST vs GraphQL for the skill execution endpoint…",
    module: "Chat",
  },
  {
    id: "3",
    type: "graph",
    icon: Network,
    title: "Entity: SkillRegistry",
    snippet: "Connected to PluginManager, SkillLoader, and ExecutionEngine nodes…",
    module: "Graph",
  },
  {
    id: "4",
    type: "skill",
    icon: Puzzle,
    title: "web-search skill",
    snippet: "Enables real-time web search capabilities for the AI assistant…",
    module: "Skills",
  },
];

export default function SearchPage() {
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? mockResults.filter(
        (r) =>
          r.title.toLowerCase().includes(query.toLowerCase()) ||
          r.snippet.toLowerCase().includes(query.toLowerCase()),
      )
    : [];

  return (
    <div className="flex h-full flex-col items-center px-6 pt-16">
      <div className="w-full max-w-2xl">
        <h2 className="mb-6 text-center text-2xl font-bold tracking-tight">
          Search everything
        </h2>

        <div className="mb-8 flex items-center gap-2 rounded-lg border border-border bg-muted px-4 py-3">
          <Search size={18} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search knowledge, chats, graph nodes, skills…"
            autoFocus
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        {filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <r.icon size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <h3 className="text-sm font-medium">{r.title}</h3>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                      {r.module}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{r.snippet}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {query.trim() && filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">
            No results found for &quot;{query}&quot;
          </p>
        )}
      </div>
    </div>
  );
}

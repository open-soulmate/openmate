"use client";

import { useState } from "react";
import {
  Puzzle,
  Search,
  Download,
  Check,
  ExternalLink,
  Star,
  Zap,
} from "lucide-react";

interface Skill {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  downloads: number;
  rating: number;
  installed: boolean;
  category: string;
}

const mockSkills: Skill[] = [
  {
    id: "web-search",
    name: "Web Search",
    description: "Real-time web search with multiple provider support.",
    author: "openmate",
    version: "1.2.0",
    downloads: 12400,
    rating: 4.8,
    installed: true,
    category: "search",
  },
  {
    id: "code-interpreter",
    name: "Code Interpreter",
    description: "Execute Python code in a sandboxed environment.",
    author: "openmate",
    version: "2.0.1",
    downloads: 8900,
    rating: 4.9,
    installed: true,
    category: "code",
  },
  {
    id: "document-parser",
    name: "Document Parser",
    description: "Extract text and structure from PDFs, DOCX, and more.",
    author: "community",
    version: "1.0.3",
    downloads: 3200,
    rating: 4.5,
    installed: false,
    category: "document",
  },
  {
    id: "image-gen",
    name: "Image Generation",
    description: "Generate images from text descriptions via multiple providers.",
    author: "community",
    version: "0.9.0",
    downloads: 5600,
    rating: 4.3,
    installed: false,
    category: "media",
  },
  {
    id: "calendar-sync",
    name: "Calendar Sync",
    description: "Sync and manage events across Google, Outlook, and Apple Calendar.",
    author: "community",
    version: "1.1.0",
    downloads: 2100,
    rating: 4.1,
    installed: false,
    category: "productivity",
  },
];

export function SkillsClient() {
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState(mockSkills);

  const filtered = skills.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  );

  function toggleInstall(id: string) {
    setSkills((prev) =>
      prev.map((s) => (s.id === id ? { ...s, installed: !s.installed } : s)),
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
          <Search size={14} className="text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills…"
            className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{skills.filter((s) => s.installed).length} installed</span>
          <span>·</span>
          <span>{skills.length} available</span>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="space-y-3">
          {filtered.map((skill) => (
            <div
              key={skill.id}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                <Puzzle size={20} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <h3 className="text-sm font-medium">{skill.name}</h3>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    v{skill.version}
                  </span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
                    {skill.category}
                  </span>
                </div>
                <p className="mb-1 text-xs text-muted-foreground">
                  {skill.description}
                </p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Download size={10} />
                    {skill.downloads.toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1">
                    <Star size={10} className="text-amber-400" />
                    {skill.rating}
                  </span>
                  <span>by {skill.author}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ExternalLink size={14} />
                </button>
                <button
                  onClick={() => toggleInstall(skill.id)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                    skill.installed
                      ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {skill.installed ? (
                    <>
                      <Check size={12} /> Installed
                    </>
                  ) : (
                    <>
                      <Zap size={12} /> Install
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

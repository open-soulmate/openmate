"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  Search,
  Check,
  Sparkles,
  Tag,
} from "lucide-react";
import Link from "next/link";

interface KnowledgeItem {
  id: string;
  title: string;
  type: "document" | "note" | "link";
  tags: string[];
  excerpt: string;
}

const availableTopics = [
  "Web Development",
  "System Design",
  "Machine Learning",
  "DevOps",
  "Database",
  "Security",
  "Mobile Development",
  "Cloud Architecture",
];

const availableDomains = [
  "Frontend",
  "Backend",
  "Full Stack",
  "Data Engineering",
  "Infrastructure",
  "AI/ML",
];

const mockKnowledgeItems: KnowledgeItem[] = [
  {
    id: "k1",
    title: "Project Architecture Overview",
    type: "document",
    tags: ["architecture", "overview"],
    excerpt: "High-level architecture of the OpenMate platform…",
  },
  {
    id: "k2",
    title: "API Design Patterns",
    type: "note",
    tags: ["api", "patterns"],
    excerpt: "Common patterns for REST API design…",
  },
  {
    id: "k3",
    title: "Next.js 16 Migration Notes",
    type: "document",
    tags: ["nextjs", "migration"],
    excerpt: "Key changes and migration steps…",
  },
  {
    id: "k4",
    title: "React Server Components Guide",
    type: "document",
    tags: ["react", "rsc"],
    excerpt: "Understanding React Server Components…",
  },
  {
    id: "k5",
    title: "Database Indexing Strategies",
    type: "note",
    tags: ["database", "performance"],
    excerpt: "When and how to create indexes…",
  },
  {
    id: "k6",
    title: "Docker Compose Reference",
    type: "document",
    tags: ["docker", "devops"],
    excerpt: "Common Docker Compose patterns…",
  },
];

export function CreateCourseClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [generating, setGenerating] = useState(false);

  const filteredItems = mockKnowledgeItems.filter(
    (item) =>
      item.title.toLowerCase().includes(knowledgeQuery.toLowerCase()) ||
      item.tags.some((t) => t.includes(knowledgeQuery.toLowerCase())),
  );

  const toggleTopic = (topic: string) => {
    setSelectedTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const toggleItem = (id: string) => {
    setSelectedItems((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const canGenerate =
    title.trim().length > 0 &&
    selectedTopics.length > 0 &&
    selectedItems.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);

    // Simulate API call to POST /api/cortex/plan
    // In production: await api.post("/cortex/plan", { title, topics: selectedTopics, domain: selectedDomain, knowledgeIds: selectedItems })
    await new Promise((r) => setTimeout(r, 2000));

    setGenerating(false);
    // Navigate to the newly created course
    router.push("/learn/1");
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <Link
          href="/learn"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-sm font-semibold">Generate New Course</h1>
          <p className="text-xs text-muted-foreground">
            Select topics and knowledge entries, then let AI plan your course
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Course title */}
          <section>
            <label className="mb-2 block text-sm font-medium">
              Course Title
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Next.js 15 Deep Dive"
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </section>

          {/* Topics */}
          <section>
            <label className="mb-2 block text-sm font-medium">
              Topics{" "}
              <span className="text-muted-foreground font-normal">
                (select one or more)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {availableTopics.map((topic) => {
                const selected = selectedTopics.includes(topic);
                return (
                  <button
                    key={topic}
                    onClick={() => toggleTopic(topic)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {selected && <Check size={12} />}
                    {topic}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Domain */}
          <section>
            <label className="mb-2 block text-sm font-medium">
              Domain{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {availableDomains.map((domain) => {
                const selected = selectedDomain === domain;
                return (
                  <button
                    key={domain}
                    onClick={() =>
                      setSelectedDomain(selected ? "" : domain)
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                      selected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                  >
                    {selected && <Check size={12} />}
                    {domain}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Knowledge items */}
          <section>
            <label className="mb-2 block text-sm font-medium">
              Knowledge Entries{" "}
              <span className="text-muted-foreground font-normal">
                (select items from your knowledge base)
              </span>
            </label>

            <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                placeholder="Search knowledge base…"
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {filteredItems.map((item) => {
                const selected = selectedItems.includes(item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => toggleItem(item.id)}
                    className={`flex w-full items-start gap-3 rounded-md border p-3 text-left transition-colors ${
                      selected
                        ? "border-primary bg-primary/5"
                        : "border-transparent hover:bg-accent"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border"
                      }`}
                    >
                      {selected && <Check size={12} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.title}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.excerpt}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <span
                            key={tag}
                            className="inline-flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                          >
                            <Tag size={8} />
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedItems.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedItems.length} item
                {selectedItems.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </section>

          {/* Generate button */}
          <div className="flex justify-end border-t border-border pt-6">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Generate Course
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

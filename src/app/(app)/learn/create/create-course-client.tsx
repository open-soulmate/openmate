"use client";

import { useState, useEffect, useCallback } from "react";
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
import { getApiBaseUrl } from "@/lib/api-client";
import { useTranslation } from 'react-i18next';


interface KnowledgeItem {
  id: string;
  title: string;
  type: string;
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

export function CreateCourseClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const apiBase = getApiBaseUrl();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [genMode, setGenMode] = useState<"manual" | "ai">("ai");
  const [numChapters, setNumChapters] = useState(5);
  const [difficulty, setDifficulty] = useState("intermediate");
  const [loadingKb, setLoadingKb] = useState(true);

  // Fetch knowledge base items from real API
  useEffect(() => {
    const fetchKnowledge = async () => {
      try {
        const res = await fetch(`${apiBase}/api/knowledge/`);
        if (res.ok) {
          const data = await res.json();
          const items: KnowledgeItem[] = (data.knowledge_bases || data.items || []).map((kb: any) => ({
            id: kb.kb_id || kb.id,
            title: kb.name || kb.title || "Untitled",
            type: kb.type || "document",
            tags: kb.tags || [],
            excerpt: kb.description || kb.excerpt || "",
          }));
          setKnowledgeItems(items);
        }
      } catch (e) {
        console.error("Failed to fetch knowledge bases", e);
      } finally {
        setLoadingKb(false);
      }
    };
    fetchKnowledge();
  }, [apiBase]);

  const filteredItems = knowledgeItems.filter(
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

  const canGenerate = title.trim().length > 0 && selectedTopics.length > 0;

  const handleGenerate = async () => {
    if (!canGenerate) return;
    setGenerating(true);

    try {
      if (genMode === "ai") {
        // AI generation — use the new endpoint
        const topic = title || selectedTopics.join(", ");
        const res = await fetch(`${apiBase}/api/learn/courses/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic,
            num_chapters: numChapters,
            language: "zh",
            difficulty,
          }),
        });
        if (res.ok) {
          const course = await res.json();
          router.push(`/learn/${course.id}`);
        } else {
          const err = await res.json();
          console.error("AI generation failed:", err);
          // Fallback to manual
          alert(t('learn.t87836', { detailGland: err.detail || t('learn.t75096') }));
        }
      } else {
        // Manual generation
        const res = await fetch(`${apiBase}/api/learn/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: description || `A course about ${selectedTopics.join(", ")}`,
            tags: selectedTopics.map((t) => t.toLowerCase().replace(/\s+/g, "-")),
            topics: selectedTopics,
            domain: selectedDomain,
            knowledge_ids: selectedItems,
            generated_by: "manual",
          }),
        });

        if (res.ok) {
          const course = await res.json();
          for (let i = 0; i < Math.max(3, selectedTopics.length); i++) {
            const topicName = selectedTopics[i % selectedTopics.length];
            await fetch(`${apiBase}/api/learn/courses/${course.id}/chapters`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: `${topicName} — Chapter ${i + 1}`,
                content: `## ${topicName}\n\nThis chapter covers the fundamentals of ${topicName}.\n\n### Key Concepts\n\n- Concept 1\n- Concept 2\n- Concept 3\n\n> Start writing your notes here...`,
                quiz: [
                  {
                    question: `What is the main topic of this chapter?`,
                    options: [topicName, "Something else", "Not sure", "Skip"],
                    correct_index: 0,
                    explanation: `This chapter focuses on ${topicName}.`,
                  },
                ],
              }),
            });
          }
          router.push(`/learn/${course.id}`);
        }
      }
    } catch (e) {
      console.error("Failed to create course", e);
    } finally {
      setGenerating(false);
    }
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

          {/* Description */}
          <section>
            <label className="mb-2 block text-sm font-medium">
              Description <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this course covers..."
              rows={3}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-primary resize-none"
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
              {loadingKb ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  No knowledge entries found
                </p>
              ) : (
                filteredItems.map((item) => {
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
                })
              )}
            </div>

            {selectedItems.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {selectedItems.length} item
                {selectedItems.length !== 1 ? "s" : ""} selected
              </p>
            )}
          </section>

          {/* Generation Mode */}
          <section>
            <label className="mb-2 block text-sm font-medium">{t('learn.t45549')}<label>
            <div className="flex gap-3">
              <button
                onClick={() => setGenMode("ai")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  genMode === "ai"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }t('learn.t16459')flex items-center gap-2 rounded-lg border px-4 py-3 text-sm transition-colors ${
                  genMode === "manual"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <BookOpen size={16} />
                <div className="text-left">
                  <div className="font-medium">{t('learn.t91198')}<div>
                  <div className="text-xs opacity-70">{t('learn.t22619')}<div>
                </div>
              </button>
            </div>
          </section>

          {/* AI Options */}
          {genMode === "ai" && (
            <section className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium">{t('learn.t10672')}<label>
                <select
                  value={numChapters}
                  onChange={(e) => setNumChapters(parseInt(e.target.value))}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                    <option key={n} value={n}>{n} {t('learn.t55143')}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium">{t('learn.t76433')}<label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  <option value="beginner">{t('learn.t03149')}<option>
                  <option value="intermediate">{t('learn.t56231')}<option>
                  <option value="advanced">{t('topology.catAdvanced')}<option>
                </select>
              </div>
            </section>
          )}

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

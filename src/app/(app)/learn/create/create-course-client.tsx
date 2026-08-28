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
import { useTranslation } from "react-i18next";

interface KnowledgeItem {
  id: string;
  title: string;
  type: string;
  tags: string[];
  excerpt: string;
}

const availableTopics = [
  "Web Development", "System Design", "Machine Learning", "DevOps",
  "Database", "Security", "Mobile Development", "Cloud Architecture",
];

const availableDomains = [
  "Frontend", "Backend", "Full Stack", "Data Engineering", "Infrastructure", "AI/ML",
];

const topicI18nKeys: Record<string, string> = {
  "Web Development": "createCourse.topicWebDev",
  "System Design": "createCourse.topicSystemDesign",
  "Machine Learning": "createCourse.topicML",
  "DevOps": "createCourse.topicDevOps",
  "Database": "createCourse.topicDatabase",
  "Security": "createCourse.topicSecurity",
  "Mobile Development": "createCourse.topicMobile",
  "Cloud Architecture": "createCourse.topicCloud",
};

const domainI18nKeys: Record<string, string> = {
  "Frontend": "createCourse.domainFrontend",
  "Backend": "createCourse.domainBackend",
  "Full Stack": "createCourse.domainFullStack",
  "Data Engineering": "createCourse.domainDataEng",
  "Infrastructure": "createCourse.domainInfra",
  "AI/ML": "createCourse.domainAiMl",
};

export function CreateCourseClient() {
  const router = useRouter();
  const { t } = useTranslation();
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
            title: kb.name || kb.title || t("createCourse.untitled"),
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
          alert(t("createCourse.aiGenFailed", { detail: err.detail || (t("createCourse.checkGland") || "Please check Gland configuration") }) || `AI generation failed: ${err.detail || "Please check Gland configuration"}`);
        }
      } else {
        // Manual generation
        const res = await fetch(`${apiBase}/api/learn/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            description: description || t("createCourse.courseAbout", { topics: selectedTopics.join(", ") }),
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
                title: t("createCourse.chapterTitle", { topic: topicName, num: i + 1 }),
                content: `## ${topicName}\n\n${t("createCourse.chapterIntro", { topic: topicName })}\n\n### ${t("createCourse.keyConcepts")}\n\n- ${t("createCourse.concept")} 1\n- ${t("createCourse.concept")} 2\n- ${t("createCourse.concept")} 3\n\n> ${t("createCourse.startNotes")}`,
                quiz: [
                  {
                    question: t("createCourse.quizMainTopic"),
                    options: [topicName, t("createCourse.quizOptionOther"), t("createCourse.quizOptionNotSure"), t("createCourse.quizOptionSkip")],
                    correct_index: 0,
                    explanation: t("createCourse.quizExplanation", { topic: topicName }),
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
      <div className="flex items-center gap-3 border-b border-border px-3 lg:px-6 py-4">
        <Link
          href="/learn"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-xs lg:text-sm font-semibold">{t("createCourse.generateNew")}</h1>
          <p className="text-xs text-muted-foreground">
            {t("createCourse.selectHint")}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 lg:p-6">
        <div className="mx-auto max-w-2xl space-y-8">
          {/* Course title */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">
              {t("createCourse.courseTitle")}
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("createCourse.courseTitlePlaceholder")}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
            />
          </section>

          {/* Description */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">
              {t("createCourse.description")} <span className="font-normal text-muted-foreground">{t("createCourse.optional")}</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("createCourse.descriptionPlaceholder")}
              rows={3}
              className="w-full rounded-md border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none placeholder:text-muted-foreground focus:border-primary resize-none"
            />
          </section>

          {/* Topics */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">
              {t("createCourse.topics")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("createCourse.selectOneOrMore")}
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
                    {t(topicI18nKeys[topic] || topic)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Domain */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">
              {t("createCourse.domain")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("createCourse.optional")}
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
                    {t(domainI18nKeys[domain] || domain)}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Knowledge items */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">
              {t("createCourse.knowledgeEntries")}{" "}
              <span className="text-muted-foreground font-normal">
                {t("createCourse.selectFromKb")}
              </span>
            </label>

            <div className="mb-3 flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5">
              <Search size={14} className="text-muted-foreground" />
              <input
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                placeholder={t("createCourse.searchKb")}
                className="flex-1 bg-transparent text-xs lg:text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-border p-2">
              {loadingKb ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredItems.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t("createCourse.noKbFound")}
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
                        <p className="truncate text-xs lg:text-sm font-medium">
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
                {t("createCourse.itemsSelected", { count: selectedItems.length })}
              </p>
            )}
          </section>

          {/* Generation Mode */}
          <section>
            <label className="mb-2 block text-xs lg:text-sm font-medium">{t("createCourse.genMode") || "Generation Method"}</label>
            <div className="flex gap-3">
              <button
                onClick={() => setGenMode("ai")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs lg:text-sm transition-colors ${
                  genMode === "ai"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <Sparkles size={16} />
                <div className="text-left">
                  <div className="font-medium">{t("createCourse.aiAutoGen") || "AI Auto Generate"}</div>
                  <div className="text-xs opacity-70">{t("createCourse.aiAutoGenDesc") || "LLM generates complete course content and quizzes"}</div>
                </div>
              </button>
              <button
                onClick={() => setGenMode("manual")}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-xs lg:text-sm transition-colors ${
                  genMode === "manual"
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                }`}
              >
                <BookOpen size={16} />
                <div className="text-left">
                  <div className="font-medium">{t("createCourse.manualCreate") || "Manual Create"}</div>
                  <div className="text-xs opacity-70">{t("createCourse.manualCreateDesc") || "Create course framework, fill content manually"}</div>
                </div>
              </button>
            </div>
          </section>

          {/* AI Options */}
          {genMode === "ai" && (
            <section className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-xs lg:text-sm font-medium">{t("learn.t10672") || "Course"}</label>
                <select
                  value={numChapters}
                  onChange={(e) => setNumChapters(parseInt(e.target.value))}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:border-primary"
                >
                  {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                    <option key={n} value={n}>{t("learn.chapterCount", { n }) || `${n} chapters`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-xs lg:text-sm font-medium">{t("learn.t76433") || "Completed"}</label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-xs lg:text-sm outline-none focus:border-primary"
                >
                  <option value="beginner">{t("learn.t03149") || "Learn"}</option>
                  <option value="intermediate">{t("learn.t56231") || "Start Learning"}</option>
                  <option value="advanced">{t("learn.t16459") || "Progress"}</option>
                </select>
              </div>
            </section>
          )}

          {/* Generate button */}
          <div className="flex justify-end border-t border-border pt-6">
            <button
              onClick={handleGenerate}
              disabled={!canGenerate || generating}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 lg:px-6 text-xs lg:text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {generating ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {t("createCourse.generating")}
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  {t("createCourse.generateCourse")}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

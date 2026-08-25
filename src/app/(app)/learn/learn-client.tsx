"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  BookOpen,
  Plus,
  Search,
  GraduationCap,
  Clock,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Loader2,
  X,
  Upload,
  Download,
  CreditCard,
  FileText,
  Edit3,
  Sparkles,
  Award,
  Image as ImageIcon,
} from "lucide-react";
import { getApiBaseUrl } from "@/lib/api-client";

interface Course {
  id: string;
  title: string;
  description: string;
  tags: string[];
  totalChapters: number;
  completedChapters: number;
  status: "not_started" | "in_progress" | "reviewing" | "completed";
  updatedAt: number;
}

function timeAgo(ts: number, t: (key: string, opts?: Record<string, unknown>) => string): string {
  const diff = Date.now() / 1000 - ts;
  if (diff < 60) return t("common.justNow") || "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function LearnClient() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [courses, setCourses] = useState<Course[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const apiBase = getApiBaseUrl();

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showLearningCard, setShowLearningCard] = useState(false);
  const [showPolicyCard, setShowPolicyCard] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [generating, setGenerating] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Create/Edit form state
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formTags, setFormTags] = useState("");
  const [genMode, setGenMode] = useState<"ai" | "manual">("ai");
  const [numChapters, setNumChapters] = useState(5);
  const [difficulty, setDifficulty] = useState("intermediate");

  const statusConfig = {
    not_started: { label: t("learn.notStarted") || "Not Started", color: "text-muted-foreground", icon: BookOpen },
    in_progress: { label: t("learn.inProgress") || "In Progress", color: "text-blue-500", icon: Clock },
    reviewing: { label: t("learn.reviewing") || "Reviewing", color: "text-amber-500", icon: RotateCcw },
    completed: { label: t("learn.completed") || "Completed", color: "text-green-500", icon: CheckCircle2 },
  };

  const fetchCourses = useCallback(async () => {
    try {
      const [coursesRes, statsRes] = await Promise.all([
        fetch(`${apiBase}/api/learn/courses`),
        fetch(`${apiBase}/api/learn/stats`),
      ]);
      if (coursesRes.ok) {
        const data = await coursesRes.json();
        setCourses(data.courses || []);
      }
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
    } catch (e) {
      console.error("Failed to fetch courses", e);
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  // Create course
  const handleCreate = async () => {
    if (!formTitle.trim()) return;
    setGenerating(true);
    try {
      if (genMode === "ai") {
        const res = await fetch(`${apiBase}/api/learn/courses/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            topic: formTitle,
            num_chapters: numChapters,
            language: "zh",
            difficulty,
          }),
        });
        if (res.ok) {
          const course = await res.json();
          setCourses((prev) => [...prev, course]);
          setShowCreateModal(false);
          resetForm();
        } else {
          const err = await res.json();
          alert(err.detail || "AI generation failed");
        }
      } else {
        const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
        const res = await fetch(`${apiBase}/api/learn/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription || `Course about ${formTitle}`,
            tags,
          }),
        });
        if (res.ok) {
          const course = await res.json();
          setCourses((prev) => [...prev, course]);
          setShowCreateModal(false);
          resetForm();
        }
      }
    } catch (e) {
      console.error("Failed to create course", e);
    } finally {
      setGenerating(false);
    }
  };

  // Edit course
  const handleEdit = async () => {
    if (!selectedCourse || !formTitle.trim()) return;
    setGenerating(true);
    try {
      const tags = formTags.split(",").map((t) => t.trim()).filter(Boolean);
      const res = await fetch(`${apiBase}/api/learn/courses/${selectedCourse.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: formTitle,
          description: formDescription,
          tags,
        }),
      });
      if (res.ok) {
        await fetchCourses();
        setShowEditModal(false);
        resetForm();
      }
    } catch (e) {
      console.error("Failed to update course", e);
    } finally {
      setGenerating(false);
    }
  };

  // Delete course
  const handleDelete = async (e: React.MouseEvent, courseId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(t("learn.confirmDelete") || "Delete this course?")) return;
    try {
      await fetch(`${apiBase}/api/learn/courses/${courseId}`, { method: "DELETE" });
      setCourses((prev) => prev.filter((c) => c.id !== courseId));
    } catch (e) {
      console.error("Failed to delete", e);
    }
  };

  // Import course (from JSON)
  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        const res = await fetch(`${apiBase}/api/learn/courses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: data.title || file.name.replace(".json", ""),
            description: data.description || "Imported course",
            tags: data.tags || [],
            chapters: data.chapters || [],
          }),
        });
        if (res.ok) {
          await fetchCourses();
        }
      } catch (err) {
        alert("Import failed: invalid JSON");
      }
    };
    input.click();
  };

  // Open edit modal
  const openEdit = (e: React.MouseEvent, course: Course) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCourse(course);
    setFormTitle(course.title);
    setFormDescription(course.description);
    setFormTags(course.tags.join(", "));
    setShowEditModal(true);
  };

  // Open learning card
  const openLearningCard = (e: React.MouseEvent, course: Course) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedCourse(course);
    setShowLearningCard(true);
  };

  const resetForm = () => {
    setFormTitle("");
    setFormDescription("");
    setFormTags("");
    setGenMode("ai");
    setNumChapters(5);
    setDifficulty("intermediate");
    setSelectedCourse(null);
  };

  // Download learning card as image using pure Canvas API
  const downloadCardAsImage = () => {
    if (!selectedCourse) return;
    const W = 600, H = 360;
    const canvas = document.createElement("canvas");
    canvas.width = W * 2; canvas.height = H * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, "#FFFBEB");
    grad.addColorStop(0.5, "#FFFFFF");
    grad.addColorStop(1, "#EFF6FF");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Border
    ctx.strokeStyle = "#F59E0B";
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    // Inner border
    ctx.strokeStyle = "#FCD34D";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, W - 20, H - 20);

    // Certificate header
    ctx.fillStyle = "#D97706";
    ctx.font = "bold 11px sans-serif";
    ctx.letterSpacing = "3px";
    ctx.fillText("CERTIFICATE OF COMPLETION", 24, 40);

    // Title
    ctx.fillStyle = "#1F2937";
    ctx.font = "bold 24px sans-serif";
    const title = selectedCourse.title.length > 30 ? selectedCourse.title.slice(0, 30) + "..." : selectedCourse.title;
    ctx.fillText(title, 24, 80);

    // Description
    ctx.fillStyle = "#6B7280";
    ctx.font = "13px sans-serif";
    const desc = selectedCourse.description.length > 60 ? selectedCourse.description.slice(0, 60) + "..." : selectedCourse.description;
    ctx.fillText(desc, 24, 110);

    // Stats
    ctx.font = "12px sans-serif";
    ctx.fillStyle = "#9CA3AF";
    ctx.fillText(`📚 ${selectedCourse.totalChapters} chapters  ·  ✅ ${selectedCourse.completedChapters} completed  ·  📅 ${new Date(selectedCourse.updatedAt * 1000).toLocaleDateString("zh-CN")}`, 24, 145);

    // Tags
    let tagX = 24;
    ctx.font = "10px sans-serif";
    selectedCourse.tags.forEach((tag) => {
      const tw = ctx.measureText(tag).width + 16;
      ctx.fillStyle = "#FEF3C7";
      ctx.beginPath();
      ctx.roundRect(tagX, 160, tw, 20, 10);
      ctx.fill();
      ctx.fillStyle = "#92400E";
      ctx.fillText(tag, tagX + 8, 174);
      tagX += tw + 6;
    });

    // Decorative elements
    ctx.fillStyle = "rgba(245,158,11,0.08)";
    ctx.font = "120px sans-serif";
    ctx.fillText("🎓", W - 140, 140);

    // Progress bar
    const progress = selectedCourse.totalChapters > 0 ? selectedCourse.completedChapters / selectedCourse.totalChapters : 0;
    ctx.fillStyle = "#E5E7EB";
    ctx.beginPath();
    ctx.roundRect(24, 200, W - 48, 8, 4);
    ctx.fill();
    ctx.fillStyle = "#10B981";
    ctx.beginPath();
    ctx.roundRect(24, 200, (W - 48) * progress, 8, 4);
    ctx.fill();

    // Completion text
    ctx.fillStyle = "#059669";
    ctx.font = "bold 14px sans-serif";
    ctx.fillText(`${Math.round(progress * 100)}% Complete`, 24, 235);

    // Divider
    ctx.strokeStyle = "#FDE68A";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(24, 260);
    ctx.lineTo(W - 24, 260);
    ctx.stroke();

    // Footer
    ctx.fillStyle = "#D1D5DB";
    ctx.font = "10px sans-serif";
    ctx.fillText(`OpenMate Learning System · ${new Date().toLocaleDateString("zh-CN")}`, 24, 280);

    // Download
    const link = document.createElement("a");
    link.download = `learning-card-${selectedCourse.title.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, "_")}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  // Download policy card
  const downloadPolicyCard = () => {
    const policyContent = `
# 学习政策卡 / Learning Policy Card

## 课程管理政策
1. 所有课程支持创建、编辑、删除和导入操作
2. AI自动生成课程需配置Gland网关
3. 手动创建课程支持自定义章节

## 学习进度政策
1. 每个章节独立标记完成状态
2. 完成所有章节后课程状态自动更新为"已完成"
3. 学习卡仅在课程完成后可生成

## 数据安全政策
1. 所有课程数据本地存储
2. 学习记录不会上传至云端
3. 导出功能支持JSON格式

## 评分政策
1. 章节测验自动评分
2. 正确率80%以上视为通过
3. 未通过可重新作答

Generated: ${new Date().toLocaleString("zh-CN")}
    `.trim();

    const blob = new Blob([policyContent], { type: "text/markdown;charset=utf-8" });
    const link = document.createElement("a");
    link.download = "learning-policy-card.md";
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const filtered = courses.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(query.toLowerCase()))
  );

  const totalLearned = stats?.completed_chapters ?? courses.reduce((s, c) => s + c.completedChapters, 0);
  const totalPending = stats?.pending_chapters ?? courses.reduce((s, c) => s + c.totalChapters - c.completedChapters, 0);
  const reviewingCount = stats?.reviewing_courses ?? courses.filter((c) => c.status === "reviewing").length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-primary" />
          <h1 className="text-lg font-semibold">{t("learn.title") || "Learning"}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("learn.filterCourses") || "Filter courses..."}
              className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {/* Policy Card Download */}
          <button
            onClick={() => setShowPolicyCard(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
          >
            <FileText size={14} />
            {t("learn.policyCard") || "Policy"}
          </button>
          {/* Import */}
          <button
            onClick={handleImport}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
          >
            <Upload size={14} />
            {t("learn.import") || "Import"}
          </button>
          {/* Create */}
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            {t("learn.createCourse") || "Create"}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 border-b border-border px-6 py-4 sm:grid-cols-3">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-blue-500/10 text-blue-500">
            <CheckCircle2 size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold">{totalLearned}</p>
            <p className="text-xs text-muted-foreground">{t("learn.chaptersLearned") || "Chapters Learned"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <Clock size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold">{totalPending}</p>
            <p className="text-xs text-muted-foreground">{t("learn.chaptersPending") || "Chapters Pending"}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-green-500/10 text-green-500">
            <RotateCcw size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold">{reviewingCount}</p>
            <p className="text-xs text-muted-foreground">{t("learn.coursesReviewing") || "Reviewing"}</p>
          </div>
        </div>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <BookOpen size={48} className="mb-4 opacity-30" />
            <p className="text-sm">{t("learn.noCourses") || "No courses yet"}</p>
            <button
              onClick={() => { resetForm(); setShowCreateModal(true); }}
              className="mt-2 text-xs text-primary hover:underline"
            >
              {t("learn.generateFirst") || "Generate your first course →"}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((course) => {
              const cfg = statusConfig[course.status];
              const StatusIcon = cfg.icon;
              const progress =
                course.totalChapters > 0
                  ? Math.round((course.completedChapters / course.totalChapters) * 100)
                  : 0;

              return (
                <div
                  key={course.id}
                  className="group relative rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
                >
                  {/* Actions */}
                  <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={(e) => openEdit(e, course)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Edit"
                    >
                      <Edit3 size={13} />
                    </button>
                    <button
                      onClick={(e) => handleDelete(e, course.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-red-500"
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                    {course.status === "completed" && (
                      <button
                        onClick={(e) => openLearningCard(e, course)}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-amber-500"
                        title="Learning Card"
                      >
                        <Award size={13} />
                      </button>
                    )}
                  </div>

                  <Link href={`/learn/${course.id}`} className="block">
                    <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <BookOpen size={16} />
                    </div>
                    <h3 className="mb-1 text-sm font-medium">{course.title}</h3>
                    <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                      {course.description}
                    </p>
                    <div className="mb-3">
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className={cfg.color}>
                          <StatusIcon size={12} className="mr-1 inline" />
                          {cfg.label}
                        </span>
                        <span className="text-muted-foreground">
                          {course.completedChapters}/{course.totalChapters} {t("learn.chapterAbbr") || "ch."}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {course.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {timeAgo(course.updatedAt, t)}
                      </span>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ===== CREATE MODAL ===== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowCreateModal(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("learn.createCourse") || "Create Course"}</h2>
              <button onClick={() => setShowCreateModal(false)} className="rounded-md p-1 hover:bg-accent">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.courseTitle") || "Title"}</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder={t("learn.courseTitlePlaceholder") || "Enter course title..."}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.description") || "Description"} <span className="text-xs text-muted-foreground">({t("learn.optional") || "optional"})</span></label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={t("learn.descriptionPlaceholder") || "Brief description..."}
                  rows={2}
                  className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.tags") || "Tags"} <span className="text-xs text-muted-foreground">(comma separated)</span></label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  placeholder="python, machine-learning, ..."
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>

              {/* Gen Mode Toggle */}
              <div className="flex gap-2">
                <button
                  onClick={() => setGenMode("ai")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    genMode === "ai" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Sparkles size={14} className="mr-1 inline" />
                  {t("learn.aiGenerate") || "AI Generate"}
                </button>
                <button
                  onClick={() => setGenMode("manual")}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm transition-colors ${
                    genMode === "manual" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <BookOpen size={14} className="mr-1 inline" />
                  {t("learn.manualCreate") || "Manual"}
                </button>
              </div>

              {genMode === "ai" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("learn.chapters") || "Chapters"}</label>
                    <select
                      value={numChapters}
                      onChange={(e) => setNumChapters(parseInt(e.target.value))}
                      className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none"
                    >
                      {[3, 4, 5, 6, 7, 8, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-muted-foreground">{t("learn.difficulty") || "Difficulty"}</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value)}
                      className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none"
                    >
                      <option value="beginner">{t("learn.beginner") || "Beginner"}</option>
                      <option value="intermediate">{t("learn.intermediate") || "Intermediate"}</option>
                      <option value="advanced">{t("learn.advanced") || "Advanced"}</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setShowCreateModal(false); resetForm(); }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                {t("common.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleCreate}
                disabled={!formTitle.trim() || generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" /> {t("learn.creating") || "Creating..."}</>
                ) : (
                  <><Plus size={14} /> {t("learn.create") || "Create"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== EDIT MODAL ===== */}
      {showEditModal && selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowEditModal(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold">{t("learn.editCourse") || "Edit Course"}</h2>
              <button onClick={() => setShowEditModal(false)} className="rounded-md p-1 hover:bg-accent">
                <X size={16} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.courseTitle") || "Title"}</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.description") || "Description"}</label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">{t("learn.tags") || "Tags"} <span className="text-xs text-muted-foreground">(comma separated)</span></label>
                <input
                  value={formTags}
                  onChange={(e) => setFormTags(e.target.value)}
                  className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => { setShowEditModal(false); resetForm(); }}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                {t("common.cancel") || "Cancel"}
              </button>
              <button
                onClick={handleEdit}
                disabled={!formTitle.trim() || generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {generating ? (
                  <><Loader2 size={14} className="animate-spin" /> {t("common.saving") || "Saving..."}</>
                ) : (
                  <><CheckCircle2 size={14} /> {t("common.save") || "Save"}</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== LEARNING CARD MODAL ===== */}
      {showLearningCard && selectedCourse && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowLearningCard(false)}>
          <div
            className="w-full max-w-md rounded-xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Award size={18} className="text-amber-500" />
                {t("learn.learningCard") || "Learning Card"}
              </h2>
              <button onClick={() => setShowLearningCard(false)} className="rounded-md p-1 hover:bg-accent">
                <X size={16} />
              </button>
            </div>

            {/* Card Preview */}
            <div ref={cardRef} className="relative overflow-hidden rounded-lg border-2 border-amber-400 bg-gradient-to-br from-amber-50 via-white to-blue-50 p-6">
              <div className="absolute right-4 top-4 text-6xl opacity-10">🎓</div>
              <div className="mb-1 text-xs font-medium uppercase tracking-wider text-amber-600">
                Certificate of Completion
              </div>
              <div className="mb-4 text-xl font-bold text-gray-800">{selectedCourse.title}</div>
              <div className="mb-3 text-sm text-gray-600">{selectedCourse.description}</div>
              <div className="mb-4 flex items-center gap-4 text-xs text-gray-500">
                <span>📚 {selectedCourse.totalChapters} chapters</span>
                <span>✅ {selectedCourse.completedChapters} completed</span>
                <span>📅 {new Date(selectedCourse.updatedAt * 1000).toLocaleDateString("zh-CN")}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {selectedCourse.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="mt-4 border-t border-amber-200 pt-3 text-center text-[10px] text-gray-400">
                OpenMate Learning System • {new Date().toLocaleDateString("zh-CN")}
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={downloadCardAsImage}
                className="inline-flex items-center gap-2 rounded-md bg-amber-500 px-6 py-2 text-sm font-medium text-white hover:bg-amber-600"
              >
                <ImageIcon size={16} />
                {t("learn.downloadAsImage") || "Download as Image"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== POLICY CARD MODAL ===== */}
      {showPolicyCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowPolicyCard(false)}>
          <div
            className="w-full max-w-lg rounded-xl border border-border bg-background p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <FileText size={18} className="text-blue-500" />
                {t("learn.policyCard") || "Learning Policy"}
              </h2>
              <button onClick={() => setShowPolicyCard(false)} className="rounded-md p-1 hover:bg-accent">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-4 text-sm">
              <div>
                <h3 className="font-medium">📋 {t("learn.policyCourseMgmt") || "Course Management"}</h3>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  <li>{t("learn.policyCreateEdit") || "Supports create, edit, delete, and import"}</li>
                  <li>{t("learn.policyAI") || "AI generation requires Gland gateway"}</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium">📊 {t("learn.policyProgress") || "Learning Progress"}</h3>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  <li>{t("learn.policyChapters") || "Each chapter tracked independently"}</li>
                  <li>{t("learn.policyComplete") || "Course auto-marks complete when all chapters done"}</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium">🔒 {t("learn.policySecurity") || "Data Security"}</h3>
                <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                  <li>{t("learn.policyLocal") || "All data stored locally"}</li>
                  <li>{t("learn.policyNoUpload") || "No data uploaded to cloud"}</li>
                </ul>
              </div>
            </div>

            <div className="mt-4 flex justify-center">
              <button
                onClick={downloadPolicyCard}
                className="inline-flex items-center gap-2 rounded-md bg-blue-500 px-6 py-2 text-sm font-medium text-white hover:bg-blue-600"
              >
                <Download size={16} />
                {t("learn.downloadPolicy") || "Download Policy Card"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

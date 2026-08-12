"use client";

import { useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  Plus,
  Search,
  GraduationCap,
  Clock,
  CheckCircle2,
  RotateCcw,
  MoreHorizontal,
} from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string;
  tags: string[];
  totalChapters: number;
  completedChapters: number;
  status: "not_started" | "in_progress" | "reviewing" | "completed";
  updatedAt: string;
}

const mockCourses: Course[] = [
  {
    id: "1",
    title: "Next.js 15 App Router Deep Dive",
    description: "Master the new App Router, Server Components, and streaming patterns in Next.js 15.",
    tags: ["nextjs", "react", "frontend"],
    totalChapters: 8,
    completedChapters: 5,
    status: "in_progress",
    updatedAt: "2 hours ago",
  },
  {
    id: "2",
    title: "System Design Fundamentals",
    description: "Learn core distributed systems concepts: CAP theorem, load balancing, caching, and more.",
    tags: ["system-design", "architecture"],
    totalChapters: 12,
    completedChapters: 12,
    status: "completed",
    updatedAt: "3 days ago",
  },
  {
    id: "3",
    title: "Rust Ownership & Borrowing",
    description: "Understand Rust's unique memory model with hands-on examples.",
    tags: ["rust", "memory"],
    totalChapters: 6,
    completedChapters: 2,
    status: "reviewing",
    updatedAt: "1 week ago",
  },
  {
    id: "4",
    title: "GraphQL Schema Design",
    description: "Best practices for designing scalable GraphQL schemas and resolvers.",
    tags: ["graphql", "api"],
    totalChapters: 5,
    completedChapters: 0,
    status: "not_started",
    updatedAt: "2 weeks ago",
  },
];

const statusConfig = {
  not_started: { label: "Not Started", color: "text-muted-foreground", icon: BookOpen },
  in_progress: { label: "In Progress", color: "text-blue-500", icon: Clock },
  reviewing: { label: "Reviewing", color: "text-amber-500", icon: RotateCcw },
  completed: { label: "Completed", color: "text-green-500", icon: CheckCircle2 },
};

export function LearnClient() {
  const [query, setQuery] = useState("");
  const filtered = mockCourses.filter(
    (c) =>
      c.title.toLowerCase().includes(query.toLowerCase()) ||
      c.tags.some((t) => t.toLowerCase().includes(query.toLowerCase())),
  );

  const totalLearned = mockCourses.reduce((s, c) => s + c.completedChapters, 0);
  const totalPending = mockCourses.reduce(
    (s, c) => s + c.totalChapters - c.completedChapters,
    0,
  );
  const reviewingCount = mockCourses.filter((c) => c.status === "reviewing").length;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-primary" />
          <h1 className="text-lg font-semibold">Learning Center</h1>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted px-3 py-1.5 text-sm">
            <Search size={14} className="text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter courses…"
              className="w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Link
            href="/learn/create"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus size={14} />
            Generate Course
          </Link>
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
            <p className="text-xs text-muted-foreground">Chapters Learned</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-amber-500/10 text-amber-500">
            <Clock size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold">{totalPending}</p>
            <p className="text-xs text-muted-foreground">Chapters Pending</p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-green-500/10 text-green-500">
            <RotateCcw size={18} />
          </div>
          <div>
            <p className="text-lg font-semibold">{reviewingCount}</p>
            <p className="text-xs text-muted-foreground">Courses Reviewing</p>
          </div>
        </div>
      </div>

      {/* Course List */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((course) => {
            const cfg = statusConfig[course.status];
            const StatusIcon = cfg.icon;
            const progress =
              course.totalChapters > 0
                ? Math.round((course.completedChapters / course.totalChapters) * 100)
                : 0;

            return (
              <Link
                key={course.id}
                href={`/learn/${course.id}`}
                className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="mb-3 flex items-start justify-between">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <BookOpen size={16} />
                  </div>
                  <button
                    onClick={(e) => e.preventDefault()}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-accent"
                  >
                    <MoreHorizontal size={14} />
                  </button>
                </div>

                <h3 className="mb-1 text-sm font-medium">{course.title}</h3>
                <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
                  {course.description}
                </p>

                {/* Progress bar */}
                <div className="mb-3">
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className={cfg.color}>
                      <StatusIcon size={12} className="mr-1 inline" />
                      {cfg.label}
                    </span>
                    <span className="text-muted-foreground">
                      {course.completedChapters}/{course.totalChapters} ch.
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
                    {course.updatedAt}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

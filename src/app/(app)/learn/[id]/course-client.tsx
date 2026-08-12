"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  BookOpen,
  BrainCircuit,
  GraduationCap,
} from "lucide-react";
import ReactMarkdown from "react-markdown";

interface Chapter {
  id: string;
  title: string;
  content: string;
  completed: boolean;
}

interface CourseDetail {
  id: string;
  title: string;
  description: string;
  tags: string[];
  chapters: Chapter[];
}

const mockCourse: CourseDetail = {
  id: "1",
  title: "Next.js 15 App Router Deep Dive",
  description:
    "Master the new App Router, Server Components, and streaming patterns in Next.js 15.",
  tags: ["nextjs", "react", "frontend"],
  chapters: [
    {
      id: "c1",
      title: "Introduction to App Router",
      content: `## What is the App Router?\n\nThe App Router is a new paradigm in Next.js that uses React Server Components by default. It brings:\n\n- **Nested layouts** that persist across navigations\n- **Server Components** for zero-bundle-size server rendering\n- **Streaming** with Suspense boundaries\n- **Colocation** of data fetching with components\n\n### Key Differences from Pages Router\n\n| Feature | Pages Router | App Router |\n|---------|-------------|------------|\n| Rendering | Client-first | Server-first |\n| Layouts | Per-page | Nested |\n| Data fetching | getServerSideProps | async components |`,
      completed: true,
    },
    {
      id: "c2",
      title: "Server Components vs Client Components",
      content: `## Server Components\n\nServer Components run **only on the server**. They can:\n\n- Access the filesystem directly\n- Query databases without API layers\n- Keep sensitive logic server-side\n\n\`\`\`tsx\n// app/page.tsx — this is a Server Component by default\nexport default async function Page() {\n  const data = await db.query('SELECT * FROM posts');\n  return <PostList posts={data} />;\n}\n\`\`\`\n\n## Client Components\n\nMark a component with \`"use client"\` when it needs:\n\n- Event handlers (onClick, onChange)\n- Browser APIs (localStorage, window)\n- React hooks (useState, useEffect)\n\n\`\`\`tsx\n"use client";\nimport { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;\n}\n\`\`\``,
      completed: true,
    },
    {
      id: "c3",
      title: "Nested Layouts",
      content: `## Layout Nesting\n\nEach folder in the app directory can have a \`layout.tsx\` that wraps its children:\n\n\`\`\`\napp/\n├── layout.tsx          ← Root layout\n├── dashboard/\n│   ├── layout.tsx      ← Dashboard layout\n│   ├── page.tsx\n│   └── settings/\n│       └── page.tsx\n\`\`\`\n\nLayouts **persist** across navigations — they don't re-render. Only the page content inside \`{children}\` changes.\n\nThis means:\n- Sidebar state is preserved\n- No flash of loading content\n- Shared data stays cached`,
      completed: true,
    },
    {
      id: "c4",
      title: "Data Fetching Patterns",
      content: `## Fetch in Server Components\n\nServer Components can be \`async\` — just await your data:\n\n\`\`\`tsx\nexport default async function PostPage({ params }) {\n  const post = await getPost(params.id);\n  return <article>{post.content}</article>;\n}\n\`\`\`\n\n## Caching & Revalidation\n\nNext.js extends \`fetch\` with caching options:\n\n\`\`\`tsx\n// Cache until manually revalidated\nfetch('https://api.example.com/data', { next: { revalidate: 3600 } });\n\n// Never cache\nfetch('https://api.example.com/data', { cache: 'no-store' });\n\`\`\`\n\n## Parallel Data Fetching\n\nAvoid waterfalls by fetching in parallel:\n\n\`\`\`tsx\nexport default async function Page() {\n  const [user, posts] = await Promise.all([\n    getUser(),\n    getPosts(),\n  ]);\n  return <Dashboard user={user} posts={posts} />;\n}\n\`\`\``,
      completed: true,
    },
    {
      id: "c5",
      title: "Streaming & Suspense",
      content: `## What is Streaming?\n\nStreaming lets you send HTML **progressively** — the shell arrives first, then chunks fill in as data resolves.\n\n## Using Suspense\n\nWrap slow-loading parts in \`<Suspense>\`:\n\n\`\`\`tsx\nimport { Suspense } from 'react';\n\nexport default function Page() {\n  return (\n    <main>\n      <h1>Dashboard</h1>\n      <Suspense fallback={<Skeleton />}>\n        <SlowDataComponent />\n      </Suspense>\n    </main>\n  );\n}\n\`\`\`\n\n## Loading UI\n\nCreate a \`loading.tsx\` file to automatically wrap the page in Suspense:\n\n\`\`\`tsx\n// app/dashboard/loading.tsx\nexport default function Loading() {\n  return <DashboardSkeleton />;\n}\n\`\`\``,
      completed: true,
    },
    {
      id: "c6",
      title: "Route Handlers & API Routes",
      content: `## Route Handlers\n\nReplace \`pages/api/*\` with \`app/api/*/route.ts\`:\n\n\`\`\`tsx\n// app/api/posts/route.ts\nimport { NextResponse } from 'next/server';\n\nexport async function GET() {\n  const posts = await db.posts.findMany();\n  return NextResponse.json(posts);\n}\n\nexport async function POST(request: Request) {\n  const body = await request.json();\n  const post = await db.posts.create({ data: body });\n  return NextResponse.json(post, { status: 201 });\n}\n\`\`\`\n\nRoute Handlers support:\n- All HTTP methods (GET, POST, PUT, DELETE, etc.)\n- Request/Response Web APIs\n- Streaming responses\n- Edge runtime`,
      completed: false,
    },
    {
      id: "c7",
      title: "Middleware & Authentication",
      content: `## Middleware\n\nMiddleware runs **before** a request is completed. Use it for:\n\n- Authentication checks\n- Redirects & rewrites\n- Request headers manipulation\n\n\`\`\`tsx\n// middleware.ts (project root)\nimport { NextResponse } from 'next/server';\nimport type { NextRequest } from 'next/server';\n\nexport function middleware(request: NextRequest) {\n  const token = request.cookies.get('token');\n  if (!token && request.nextUrl.pathname.startsWith('/dashboard')) {\n    return NextResponse.redirect(new URL('/login', request.url));\n  }\n  return NextResponse.next();\n}\n\nexport const config = {\n  matcher: ['/dashboard/:path*', '/api/:path*'],\n};\n\`\`\``,
      completed: false,
    },
    {
      id: "c8",
      title: "Deployment & Performance",
      content: `## Deployment Options\n\n- **Vercel** — zero-config, edge-optimized\n- **Self-hosted** — Node.js, Docker, or standalone output\n- **Edge Runtime** — for low-latency global responses\n\n## Performance Checklist\n\n1. **Use Server Components** by default — only add "use client" when needed\n2. **Parallel data fetching** — avoid waterfalls with Promise.all\n3. **Streaming** — wrap slow data in Suspense\n4. **Image optimization** — always use \`<Image>\` from next/image\n5. **Font optimization** — use \`next/font\` for zero-layout-shift fonts\n6. **Bundle analysis** — run \`next build && npx @next/bundle-analyzer\`\n\n\`\`\`bash\n# Analyze bundle\nANALYZE=true next build\n\`\`\``,
      completed: false,
    },
  ],
};

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
}

const mockQuiz: QuizQuestion[] = [
  {
    question: "What is the default rendering strategy for components in the App Router?",
    options: ["Client-side rendering", "Server-side rendering (Server Components)", "Static generation only", "Incremental static regeneration"],
    correctIndex: 1,
  },
  {
    question: "How do you mark a component as a Client Component?",
    options: ["Add 'use client' directive at the top", "Import from 'react/client'", "Use the @client decorator", "Add 'use browser' directive"],
    correctIndex: 0,
  },
  {
    question: "Which file creates a nested layout in the App Router?",
    options: ["_layout.tsx", "layout.tsx", "wrapper.tsx", "layout.page.tsx"],
    correctIndex: 1,
  },
];

export function CourseClient({ courseId }: { courseId: string }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chapters, setChapters] = useState(mockCourse.chapters);
  const [showQuiz, setShowQuiz] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<(number | null)[]>(
    new Array(mockQuiz.length).fill(null),
  );
  const [quizSubmitted, setQuizSubmitted] = useState(false);

  const course = mockCourse;
  const chapter = chapters[currentIndex];
  const completedCount = chapters.filter((c) => c.completed).length;
  const progress = Math.round((completedCount / chapters.length) * 100);

  const toggleComplete = () => {
    setChapters((prev) =>
      prev.map((ch, i) =>
        i === currentIndex ? { ...ch, completed: !ch.completed } : ch,
      ),
    );
  };

  const submitQuiz = () => setQuizSubmitted(true);

  const quizScore = quizSubmitted
    ? quizAnswers.filter((a, i) => a === mockQuiz[i].correctIndex).length
    : null;

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <Link
            href="/learn"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft size={16} />
          </Link>
          <div>
            <h1 className="text-sm font-semibold">{course.title}</h1>
            <p className="text-xs text-muted-foreground">
              {completedCount}/{chapters.length} chapters completed
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowQuiz(!showQuiz)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent"
          >
            <BrainCircuit size={14} />
            {showQuiz ? "Hide Quiz" : "Take Quiz"}
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Chapter sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-4">
          {/* Progress */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{progress}%</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Chapter list */}
          <nav className="space-y-0.5">
            {chapters.map((ch, i) => (
              <button
                key={ch.id}
                onClick={() => {
                  setCurrentIndex(i);
                  setShowQuiz(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors ${
                  i === currentIndex
                    ? "bg-accent text-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {ch.completed ? (
                  <CheckCircle2 size={14} className="shrink-0 text-green-500" />
                ) : (
                  <Circle size={14} className="shrink-0" />
                )}
                <span className="truncate">{ch.title}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <div className="flex-1 overflow-y-auto">
          {showQuiz ? (
            <div className="mx-auto max-w-2xl p-8">
              <div className="mb-6 flex items-center gap-2">
                <GraduationCap size={20} className="text-primary" />
                <h2 className="text-lg font-semibold">Chapter Quiz</h2>
              </div>

              <div className="space-y-6">
                {mockQuiz.map((q, qi) => (
                  <div
                    key={qi}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <p className="mb-3 text-sm font-medium">
                      {qi + 1}. {q.question}
                    </p>
                    <div className="space-y-2">
                      {q.options.map((opt, oi) => {
                        const isSelected = quizAnswers[qi] === oi;
                        const isCorrect = quizSubmitted && oi === q.correctIndex;
                        const isWrong =
                          quizSubmitted && isSelected && oi !== q.correctIndex;

                        return (
                          <button
                            key={oi}
                            disabled={quizSubmitted}
                            onClick={() =>
                              setQuizAnswers((prev) => {
                                const next = [...prev];
                                next[qi] = oi;
                                return next;
                              })
                            }
                            className={`flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                              isCorrect
                                ? "border-green-500 bg-green-500/10 text-green-700"
                                : isWrong
                                  ? "border-red-500 bg-red-500/10 text-red-700"
                                  : isSelected
                                    ? "border-primary bg-primary/10"
                                    : "border-border hover:bg-accent"
                            }`}
                          >
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-[10px]">
                              {String.fromCharCode(65 + oi)}
                            </span>
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between">
                {quizSubmitted ? (
                  <p className="text-sm font-medium">
                    Score: {quizScore}/{mockQuiz.length} (
                    {Math.round(((quizScore ?? 0) / mockQuiz.length) * 100)}%)
                  </p>
                ) : (
                  <div />
                )}
                <button
                  onClick={submitQuiz}
                  disabled={quizSubmitted || quizAnswers.some((a) => a === null)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-4 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {quizSubmitted ? "Submitted" : "Submit Answers"}
                </button>
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl p-8">
              <div className="mb-6">
                <h2 className="mb-2 text-xl font-semibold">{chapter.title}</h2>
                <div className="flex flex-wrap gap-1.5">
                  {course.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <article className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown>{chapter.content}</ReactMarkdown>
              </article>

              {/* Bottom actions */}
              <div className="mt-8 flex items-center justify-between border-t border-border pt-4">
                <button
                  onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                  disabled={currentIndex === 0}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>

                <button
                  onClick={toggleComplete}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md px-4 text-xs font-medium transition-colors ${
                    chapter.completed
                      ? "bg-green-500/10 text-green-600 hover:bg-green-500/20"
                      : "bg-primary text-primary-foreground hover:bg-primary/90"
                  }`}
                >
                  {chapter.completed ? (
                    <>
                      <CheckCircle2 size={14} />
                      Learned
                    </>
                  ) : (
                    <>
                      <BookOpen size={14} />
                      Mark as Learned
                    </>
                  )}
                </button>

                <button
                  onClick={() =>
                    setCurrentIndex((i) => Math.min(chapters.length - 1, i + 1))
                  }
                  disabled={currentIndex === chapters.length - 1}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium hover:bg-accent disabled:opacity-40"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

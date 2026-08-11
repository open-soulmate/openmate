import Link from "next/link";
import {
  MessageSquare,
  BookOpen,
  Network,
  Search,
  Puzzle,
  ArrowRight,
} from "lucide-react";

const features = [
  {
    icon: MessageSquare,
    title: "AI Chat",
    desc: "Context-aware conversations powered by your knowledge base.",
    href: "/chat",
  },
  {
    icon: BookOpen,
    title: "Knowledge Base",
    desc: "Organize and retrieve documents with semantic search.",
    href: "/knowledge",
  },
  {
    icon: Network,
    title: "Knowledge Graph",
    desc: "Visualize connections between concepts and entities.",
    href: "/graph",
  },
  {
    icon: Search,
    title: "Unified Search",
    desc: "Search across all your knowledge in one place.",
    href: "/search",
  },
  {
    icon: Puzzle,
    title: "Skills",
    desc: "Extend capabilities with pluggable skill modules.",
    href: "/skills",
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mb-6 inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-xs text-muted-foreground">
          Open Source &middot; Community Driven
        </div>
        <h1 className="mb-4 text-4xl font-bold tracking-tight sm:text-5xl">
          Your Knowledge Companion.
        </h1>
        <p className="mb-8 text-lg text-muted-foreground">
          OpenMate is an open AI companion platform that helps you think, learn,
          and create — with pluggable skills that adapt to your workflow.
        </p>
        <Link
          href="/chat"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Get Started <ArrowRight size={16} />
        </Link>
      </div>

      <div className="mt-20 grid w-full max-w-4xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/50"
          >
            <f.icon className="mb-3 h-5 w-5 text-primary" />
            <h3 className="mb-1 text-sm font-medium">{f.title}</h3>
            <p className="text-xs text-muted-foreground">{f.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

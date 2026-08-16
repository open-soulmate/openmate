"use client";

import Link from "next/link";
import { Home, ArrowLeft, Search, Map } from "lucide-react";

export default function NotFound() {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="w-full max-w-md text-center">
        {/* Large 404 */}
        <div className="relative mb-8">
          <span className="text-[120px] font-bold text-muted-foreground/10 leading-none select-none">
            404
          </span>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="rounded-full bg-muted/80 p-4">
              <Search size={32} className="text-muted-foreground" />
            </div>
          </div>
        </div>

        {/* Message */}
        <h2 className="text-xl font-bold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        {/* Quick links */}
        <div className="mt-8 grid grid-cols-2 gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <Home size={16} className="text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Dashboard</p>
              <p className="text-[10px] text-muted-foreground">System overview</p>
            </div>
          </Link>
          <Link
            href="/chat"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <Search size={16} className="text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Chat</p>
              <p className="text-[10px] text-muted-foreground">Start a conversation</p>
            </div>
          </Link>
          <Link
            href="/knowledge"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <Map size={16} className="text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Knowledge</p>
              <p className="text-[10px] text-muted-foreground">Browse knowledge base</p>
            </div>
          </Link>
          <Link
            href="/topology"
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
          >
            <Map size={16} className="text-muted-foreground" />
            <div className="text-left">
              <p className="font-medium">Topology</p>
              <p className="text-[10px] text-muted-foreground">System topology</p>
            </div>
          </Link>
        </div>

        {/* Back button */}
        <div className="mt-6">
          <button
            onClick={() => window.history.back()}
            className="flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground hover:bg-muted transition-colors mx-auto"
          >
            <ArrowLeft size={14} />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}

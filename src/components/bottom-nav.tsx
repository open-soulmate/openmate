"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import {
  MessageSquare, Users, BookOpen, Workflow, Settings, Brain, Activity,
  MoreHorizontal,
} from "lucide-react";
import { useRef, useEffect, useState, type MouseEvent } from "react";

interface BottomNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: BottomNavItem[] = [
  { href: "/chat", label: "nav.chat", icon: MessageSquare },
  { href: "/ai-groups", label: "nav.aiGroups", icon: Users },
  { href: "/knowledge", label: "nav.knowledge", icon: BookOpen },
  { href: "/workflow", label: "nav.workflow", icon: Workflow },
  { href: "/agents", label: "nav.agents", icon: Brain },
  { href: "/dashboard", label: "nav.dashboard", icon: Activity },
  { href: "/settings", label: "nav.settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showMore, setShowMore] = useState(false);

  // Mouse wheel → horizontal scroll
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        e.preventDefault();
        el.scrollLeft += e.deltaY;
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:h-12">
        <div
          ref={scrollRef}
          className="flex h-full flex-1 items-center gap-0.5 overflow-x-auto px-2 scrollbar-none"
          style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
        >
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-1.5 text-[10px] font-medium transition-colors min-w-[56px]",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                <span className="truncate max-w-[48px]">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>
      </nav>
      {/* Bottom spacer so content isn't hidden behind fixed nav */}
      <div className="h-14 shrink-0" />
    </>
  );
}

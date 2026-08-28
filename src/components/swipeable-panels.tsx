"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  BookOpen,
  Server,
  Workflow,
  Puzzle,
} from "lucide-react";

// ── Panel definitions ──────────────────────────────────────────────

interface PanelDef {
  id: string;
  label: string;
  href: string;
  icon: React.ElementType;
  description: string;
  gradient: string;
  iconColor: string;
}

const PANELS: PanelDef[] = [
  {
    id: "chat",
    label: "Chat",
    href: "/chat",
    icon: MessageSquare,
    description: "Conversations with your AI agents",
    gradient: "from-blue-500/20 to-blue-600/5",
    iconColor: "text-blue-500",
  },
  {
    id: "knowledge",
    label: "Knowledge",
    href: "/knowledge",
    icon: BookOpen,
    description: "Your documents, notes, and links",
    gradient: "from-emerald-500/20 to-emerald-600/5",
    iconColor: "text-emerald-500",
  },
  {
    id: "agents",
    label: "Agents",
    href: "/agents",
    icon: Server,
    description: "Manage and monitor your AI agents",
    gradient: "from-violet-500/20 to-violet-600/5",
    iconColor: "text-violet-500",
  },
  {
    id: "workflow",
    label: "Workflow",
    href: "/workflow",
    icon: Workflow,
    description: "Automate tasks with workflows",
    gradient: "from-amber-500/20 to-amber-600/5",
    iconColor: "text-amber-500",
  },
  {
    id: "skills",
    label: "Skills",
    href: "/skills",
    icon: Puzzle,
    description: "Extend capabilities with skills",
    gradient: "from-rose-500/20 to-rose-600/5",
    iconColor: "text-rose-500",
  },
];

const SWIPE_THRESHOLD = 50;
const TRANSITION_DURATION = 300;

// ── Component ──────────────────────────────────────────────────────

interface SwipeablePanelsProps {
  children: React.ReactNode;
  /** Whether the current route is a "home" page eligible for swipe */
  isHomePage: boolean;
}

export function SwipeablePanels({ children, isHomePage }: SwipeablePanelsProps) {
  const isMobile = useIsMobile();
  const router = useRouter();
  const currentPanel = useAppStore((s) => s.currentPanel);
  const setCurrentPanel = useAppStore((s) => s.setCurrentPanel);

  const containerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const lockedAxisRef = useRef<"horizontal" | "vertical" | null>(null);

  // On desktop or not a home page, render children normally
  if (!isMobile || !isHomePage) {
    return <>{children}</>;
  }

  const panelCount = PANELS.length;

  const goToPanel = useCallback(
    (index: number) => {
      const clamped = Math.max(0, Math.min(panelCount - 1, index));
      setCurrentPanel(clamped);
      setIsTransitioning(true);
      setDragOffset(0);
      setTimeout(() => setIsTransitioning(false), TRANSITION_DURATION);
    },
    [panelCount, setCurrentPanel],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (isTransitioning) return;
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
      lockedAxisRef.current = null;
      setIsDragging(true);
    },
    [isTransitioning],
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || isTransitioning) return;
      const touch = e.touches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = touch.clientY - touchStartRef.current.y;

      // Lock axis on first significant movement
      if (lockedAxisRef.current === null) {
        if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
          lockedAxisRef.current =
            Math.abs(dx) >= Math.abs(dy) ? "horizontal" : "vertical";
        }
        return;
      }

      // If vertical locked, let browser scroll
      if (lockedAxisRef.current === "vertical") return;

      // Horizontal locked — prevent vertical scroll interference
      e.preventDefault();

      // Apply rubber-band at edges
      let offset = dx;
      if (
        (currentPanel === 0 && dx > 0) ||
        (currentPanel === panelCount - 1 && dx < 0)
      ) {
        offset = dx * 0.3; // rubber-band resistance
      }

      setDragOffset(offset);
    },
    [currentPanel, panelCount, isTransitioning],
  );

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!touchStartRef.current || isTransitioning) return;

      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const elapsed = Date.now() - touchStartRef.current.time;

      // Momentum: fast swipe with smaller distance also counts
      const velocity = Math.abs(dx) / elapsed;
      const isQuickSwipe = velocity > 0.3 && Math.abs(dx) > 20;

      if (lockedAxisRef.current === "horizontal" || isQuickSwipe) {
        if (dx < -SWIPE_THRESHOLD || (isQuickSwipe && dx < 0)) {
          goToPanel(currentPanel + 1);
        } else if (dx > SWIPE_THRESHOLD || (isQuickSwipe && dx > 0)) {
          goToPanel(currentPanel - 1);
        } else {
          // Snap back
          setDragOffset(0);
        }
      } else {
        setDragOffset(0);
      }

      touchStartRef.current = null;
      lockedAxisRef.current = null;
      setIsDragging(false);
    },
    [currentPanel, goToPanel, isTransitioning],
  );

  const translateX =
    -currentPanel * 100 + (dragOffset / (typeof window !== "undefined" ? window.innerWidth : 375)) * 100;

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Swipeable panel track */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-hidden relative touch-pan-y"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={cn("flex h-full", isTransitioning && "transition-transform")}
          style={{
            transform: `translateX(${translateX}%)`,
            transitionDuration: isTransitioning ? `${TRANSITION_DURATION}ms` : "0ms",
            transitionTimingFunction: "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
            width: `${panelCount * 100}%`,
          }}
        >
          {PANELS.map((panel, index) => (
            <PanelCard
              key={panel.id}
              panel={panel}
              isActive={currentPanel === index}
              onTap={() => router.push(panel.href)}
            />
          ))}
        </div>
      </div>

      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-1.5 py-2 shrink-0">
        {PANELS.map((panel, index) => (
          <button
            key={panel.id}
            onClick={() => goToPanel(index)}
            className={cn(
              "rounded-full transition-all duration-300",
              currentPanel === index
                ? "w-5 h-2 bg-primary"
                : "w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/50",
            )}
            aria-label={`Go to ${panel.label}`}
          />
        ))}
      </div>
    </div>
  );
}

// ── Panel Preview Card ─────────────────────────────────────────────

function PanelCard({
  panel,
  isActive,
  onTap,
}: {
  panel: PanelDef;
  isActive: boolean;
  onTap: () => void;
}) {
  const Icon = panel.icon;

  return (
    <div
      className="flex items-center justify-center p-4"
      style={{ width: `${100 / PANELS.length}%` }}
    >
      <button
        onClick={onTap}
        className={cn(
          "w-full max-w-sm rounded-2xl border border-border/50 bg-gradient-to-br p-6",
          "flex flex-col items-center gap-4 text-center",
          "transition-all duration-300 active:scale-[0.97]",
          "shadow-sm hover:shadow-md",
          panel.gradient,
        )}
      >
        <div
          className={cn(
            "flex h-16 w-16 items-center justify-center rounded-2xl",
            "bg-background/80 border border-border/50 shadow-sm",
          )}
        >
          <Icon size={28} className={panel.iconColor} />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">{panel.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
            {panel.description}
          </p>
        </div>
        <span className="text-xs text-muted-foreground/70">Tap to open →</span>
      </button>
    </div>
  );
}

// ── Exports for use in app-shell ───────────────────────────────────

/** Panel route prefixes that are eligible for swipe */
export const SWIPE_PANEL_ROUTES = PANELS.map((p) => p.href);

/** Get panel index from a pathname, or -1 if not a panel route */
export function getPanelIndex(pathname: string): number {
  return PANELS.findIndex((p) => pathname.startsWith(p.href));
}

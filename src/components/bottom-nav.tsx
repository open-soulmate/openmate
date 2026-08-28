"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect, useState } from "react";
import {
  MessageSquare, Users, BookOpen, Workflow, Settings, Brain, Activity,
  LayoutDashboard, Bell, Server, GraduationCap, Network, Share2, Search,
  FileText, Clock, GitBranch, Zap, Sparkles, Puzzle, Plug, FolderKanban,
  Camera, Download, Tag, User, Bot, Droplets, Dna, Eye, Shield, Bone,
  Volume2, Layers, Link2, Home, MousePointer, Mic, ImageIcon, Smile,
  Stethoscope, Cpu, Bolt, Heart, Gauge, BarChart3, Package, ScrollText,
  History, Store, Pill, X,
} from "lucide-react";

interface BottomNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

const navItems: BottomNavItem[] = [
  // Core
  { href: "/chat", label: "nav.chat", icon: MessageSquare },
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/notifications", label: "nav.notifications", icon: Bell },
  // AI Group
  { href: "/ai-groups", label: "nav.aiGroups", icon: Users },
  { href: "/agents", label: "nav.agents", icon: Server },
  // Knowledge
  { href: "/knowledge", label: "nav.knowledge", icon: BookOpen },
  { href: "/learn", label: "nav.learn", icon: GraduationCap },
  { href: "/graph", label: "nav.graph", icon: Network },
  { href: "/graph-builder", label: "nav.graphBuilder", icon: Share2 },
  { href: "/search", label: "nav.search", icon: Search },
  { href: "/kb-sharing", label: "nav.kbSharing", icon: Share2 },
  { href: "/knowledge-requests", label: "nav.knowledgeRequests", icon: FileText },
  // Automation
  { href: "/cron", label: "nav.cron", icon: Clock },
  { href: "/workflow", label: "nav.workflow", icon: Workflow },
  { href: "/workflow-builder", label: "nav.workflowBuilder", icon: GitBranch },
  { href: "/pipeline", label: "nav.pipeline", icon: Zap },
  { href: "/will", label: "nav.will", icon: Sparkles },
  // Tools
  { href: "/skills", label: "nav.skills", icon: Puzzle },
  { href: "/mcp", label: "nav.mcp", icon: Plug },
  { href: "/workspace", label: "nav.workspace", icon: FolderKanban },
  { href: "/capture", label: "nav.capture", icon: Camera },
  { href: "/download", label: "nav.download", icon: Download },
  { href: "/tags", label: "nav.tags", icon: Tag },
  // Organs
  { href: "/body-map", label: "nav.bodyMap", icon: User },
  { href: "/soma", label: "nav.soma", icon: Bot },
  { href: "/discovery", label: "nav.discovery", icon: Search },
  { href: "/cortex", label: "nav.cortex", icon: Cpu },
  { href: "/vein", label: "nav.vein", icon: Droplets },
  { href: "/gene", label: "nav.gene", icon: Dna },
  { href: "/vital", label: "nav.vital", icon: Activity },
  { href: "/gland", label: "nav.gland", icon: Zap },
  { href: "/hippo", label: "nav.hippo", icon: Brain },
  { href: "/reflex", label: "nav.reflex", icon: Bolt },
  { href: "/heredity", label: "nav.heredity", icon: GitBranch },
  { href: "/pulse", label: "nav.pulse", icon: Heart },
  { href: "/nerve", label: "nav.nerve", icon: Zap },
  { href: "/sense", label: "nav.sense", icon: Eye },
  { href: "/immune", label: "nav.immune", icon: Shield },
  { href: "/marrow", label: "nav.marrow", icon: Bone },
  { href: "/echo", label: "nav.echo", icon: Volume2 },
  { href: "/mirror", label: "nav.mirror", icon: Layers },
  { href: "/link", label: "nav.link", icon: Link2 },
  { href: "/nest", label: "nav.nest", icon: Home },
  { href: "/limb", label: "nav.limb", icon: MousePointer },
  { href: "/voice", label: "nav.voice", icon: Mic },
  { href: "/vision", label: "nav.vision", icon: ImageIcon },
  { href: "/mind", label: "nav.mind", icon: Smile },
  // System
  { href: "/system", label: "nav.system", icon: Server },
  { href: "/soul", label: "nav.soul", icon: Brain },
  { href: "/soma-admin", label: "nav.somaAdmin", icon: Bot },
  { href: "/admin", label: "nav.admin", icon: Shield },
  { href: "/permission", label: "nav.permission", icon: Shield },
  { href: "/enterprise", label: "nav.enterprise", icon: Shield },
  { href: "/sessions", label: "nav.sessions", icon: History },
  { href: "/diagnostics", label: "nav.diagnostics", icon: Stethoscope },
  { href: "/metrics", label: "nav.metrics", icon: BarChart3 },
  { href: "/benchmark", label: "nav.benchmark", icon: Gauge },
  { href: "/intelligence", label: "nav.intelligence", icon: Brain },
  { href: "/ai-engine", label: "nav.aiEngine", icon: Cpu },
  { href: "/healer", label: "nav.healer", icon: Pill },
  { href: "/topology", label: "nav.topology", icon: Network },
  { href: "/registry", label: "nav.registry", icon: Package },
  { href: "/trajectory", label: "nav.trajectory", icon: Activity },
  { href: "/timeline", label: "nav.timeline", icon: History },
  { href: "/changelog", label: "nav.changelog", icon: ScrollText },
  { href: "/plugins", label: "nav.plugins", icon: Puzzle },
  { href: "/marketplace", label: "nav.marketplace", icon: Store },
  { href: "/settings", label: "nav.settings", icon: Settings },
];

export function BottomNav() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const [centerOpen, setCenterOpen] = useState(false);

  // Split items: left half and right half
  const mid = Math.ceil(navItems.length / 2);
  const leftItems = navItems.slice(0, mid);
  const rightItems = navItems.slice(mid);

  // Mouse wheel → horizontal scroll for both sides
  useEffect(() => {
    const handlers: Array<{ el: HTMLDivElement; fn: (e: WheelEvent) => void }> = [];
    for (const el of [leftRef.current, rightRef.current]) {
      if (!el) continue;
      const fn = (e: WheelEvent) => {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          e.preventDefault();
          el.scrollLeft += e.deltaY;
        }
      };
      el.addEventListener("wheel", fn, { passive: false });
      handlers.push({ el, fn });
    }
    return () => handlers.forEach(({ el, fn }) => el.removeEventListener("wheel", fn));
  }, []);

  // Auto-scroll to active item
  useEffect(() => {
    if (activeRef.current) {
      const container = activeRef.current.closest("[data-scroll-container]") as HTMLDivElement;
      if (container) {
        const left = activeRef.current.offsetLeft - container.clientWidth / 2 + activeRef.current.clientWidth / 2;
        container.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
      }
    }
  }, [pathname]);

  const renderItems = (items: BottomNavItem[], scrollRef: React.RefObject<HTMLDivElement | null>, side: "left" | "right") => (
    <div
      ref={scrollRef}
      data-scroll-container
      className="flex h-full flex-1 items-center gap-0.5 overflow-x-auto px-1.5"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch", [side === "left" ? "paddingRight" : "paddingLeft"]: "4px" }}
    >
      {items.map((item) => {
        const active = pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            ref={active ? activeRef : undefined}
            className={cn(
              "flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 text-[9px] font-medium transition-colors min-w-[46px]",
              active
                ? "text-primary bg-primary/10"
                : "text-muted-foreground hover:text-foreground hover:bg-accent"
            )}
          >
            <Icon size={16} strokeWidth={active ? 2.2 : 1.5} />
            <span className="truncate max-w-[42px] leading-tight">{t(item.label)}</span>
          </Link>
        );
      })}
    </div>
  );

  return (
    <>
      <nav className="relative flex h-14 shrink-0 items-center border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        {/* Left items */}
        {renderItems(leftItems, leftRef, "left")}

        {/* Center logo button */}
        <div className="relative flex shrink-0 items-center justify-center px-2">
          {/* Center logo button — 3D sphere */}
          <button
            onClick={() => setCenterOpen(!centerOpen)}
            className={cn(
              "relative flex h-12 w-12 items-center justify-center rounded-full transition-all duration-300",
              centerOpen ? "scale-110" : "hover:scale-105"
            )}
            style={{
              background: centerOpen
                ? "radial-gradient(circle at 50% 40%, #a78bfa, #7c3aed 60%, #5b21b6)"
                : "radial-gradient(circle at 50% 40%, #c4b5fd, #7c3aed 60%, #4c1d95)",
              boxShadow: "0 4px 12px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)",
            }}
            title="Search & Voice"
          >
            {/* Glossy highlight */}
            <div
              className="absolute h-3 w-4 rounded-full opacity-25"
              style={{ top: "25%", left: "50%", transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(255,255,255,0.7), transparent)" }}
            />
            {centerOpen ? (
              <X size={18} className="relative z-10 text-white drop-shadow-sm" />
            ) : (
              <span className="relative z-10 text-[11px] font-bold text-white drop-shadow-sm tracking-tight">OM</span>
            )}
          </button>

          {/* Popup menu: search + voice */}
          {centerOpen && (
            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 flex gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
              <button
                onClick={() => {
                  setCenterOpen(false);
                  document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{
                  background: "radial-gradient(circle at 50% 40%, #e5e7eb, #9ca3af 60%, #4b5563)",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)",
                }}
                title="Search (Ctrl+K)"
              >
                <div className="absolute h-2.5 w-3.5 rounded-full opacity-20" style={{ top: "22%", left: "50%", transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(255,255,255,0.7), transparent)" }} />
                <Search size={18} className="relative z-10 text-white drop-shadow-sm" />
              </button>
              <button
                onClick={() => {
                  setCenterOpen(false);
                  document.dispatchEvent(new CustomEvent("openmate-voice-input"));
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full transition-transform hover:scale-110"
                style={{
                  background: "radial-gradient(circle at 50% 40%, #fca5a5, #ef4444 60%, #991b1b)",
                  boxShadow: "0 4px 10px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)",
                }}
                title="Voice Input"
              >
                <div className="absolute h-2.5 w-3.5 rounded-full opacity-20" style={{ top: "22%", left: "50%", transform: "translateX(-50%)", background: "radial-gradient(ellipse, rgba(255,255,255,0.7), transparent)" }} />
                <Mic size={18} className="relative z-10 text-white drop-shadow-sm" />
              </button>
            </div>
          )}
        </div>

        {/* Right items */}
        {renderItems(rightItems, rightRef, "right")}
      </nav>
    </>
  );
}

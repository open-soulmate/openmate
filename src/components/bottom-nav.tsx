"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect, useCallback, useState } from "react";
import { getUserName, getUserId } from "@/lib/api-client";
import {
  MessageSquare, Users, BookOpen, Workflow, Settings, Brain, Activity,
  LayoutDashboard, Bell, Server, GraduationCap, Network, Share2, Search,
  FileText, Clock, GitBranch, Zap, Sparkles, Puzzle, Plug, FolderKanban,
  Camera, Download, Tag, User, Bot, Droplets, Dna, Eye, Shield, Bone,
  Volume2, Layers, Link2, Home, MousePointer, Mic, ImageIcon, Smile,
  Stethoscope, Cpu, Bolt, Heart, Gauge, BarChart3, Package, ScrollText,
  History, Store, Pill, LogOut, Moon, Sun,
} from "lucide-react";

interface BottomNavItem {
  href: string;
  label: string;
  icon: React.ElementType;
}

// Settings is NOT in scrollable items — it's fixed on the right
const navItems: BottomNavItem[] = [
  { href: "/chat", label: "nav.chat", icon: MessageSquare },
  { href: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard },
  { href: "/ai-groups", label: "nav.aiGroups", icon: Users },
  { href: "/agents", label: "nav.agents", icon: Server },
  { href: "/knowledge", label: "nav.knowledge", icon: BookOpen },
  { href: "/learn", label: "nav.learn", icon: GraduationCap },
  { href: "/graph", label: "nav.graph", icon: Network },
  { href: "/kb-sharing", label: "nav.kbSharing", icon: Share2 },
  { href: "/knowledge-requests", label: "nav.knowledgeRequests", icon: FileText },
  { href: "/cron", label: "nav.cron", icon: Clock },
  { href: "/workflow", label: "nav.workflow", icon: Workflow },

  { href: "/pipeline", label: "nav.pipeline", icon: Zap },
  { href: "/will", label: "nav.will", icon: Sparkles },
  { href: "/skills", label: "nav.skills", icon: Puzzle },
  { href: "/mcp", label: "nav.mcp", icon: Plug },
  { href: "/workspace", label: "nav.workspace", icon: FolderKanban },
  { href: "/capture", label: "nav.capture", icon: Camera },
  { href: "/tags", label: "nav.tags", icon: Tag },
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
  { href: "/soul", label: "nav.soul", icon: Brain },
  { href: "/soma-admin", label: "nav.somaAdmin", icon: Bot },
  { href: "/admin", label: "nav.admin", icon: Shield },
  { href: "/permission", label: "nav.permission", icon: Shield },
  { href: "/enterprise", label: "nav.enterprise", icon: Shield },
  { href: "/sessions", label: "nav.sessions", icon: History },
  { href: "/intelligence", label: "nav.intelligence", icon: Brain },
  { href: "/ai-engine", label: "nav.aiEngine", icon: Cpu },
  { href: "/healer", label: "nav.healer", icon: Pill },
  { href: "/topology", label: "nav.topology", icon: Network },
  { href: "/registry", label: "nav.registry", icon: Package },
  { href: "/trajectory", label: "nav.trajectory", icon: Activity },
  { href: "/timeline", label: "nav.timeline", icon: History },
  { href: "/changelog", label: "nav.changelog", icon: ScrollText },
  { href: "/marketplace", label: "nav.marketplace", icon: Store },
];

interface BottomNavProps {
  totalUnread?: number;
  onOpenConversations?: () => void;
}

export function BottomNav({ totalUnread = 0, onOpenConversations }: BottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLAnchorElement>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPress = useRef(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const userId = getUserName() || getUserId() || "User";

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

  useEffect(() => {
    if (activeRef.current && scrollRef.current) {
      const container = scrollRef.current;
      const active = activeRef.current;
      const left = active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2;
      container.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [pathname]);

  // Close user menu on outside click
  useEffect(() => {
    if (!userMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [userMenuOpen]);

  const handlePointerDown = useCallback(() => {
    isLongPress.current = false;
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true;
      document.dispatchEvent(new CustomEvent("openmate-voice-input"));
    }, 500);
  }, []);

  const handlePointerUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const handlePointerLeave = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  function handleLogout() {
    localStorage.removeItem("openmate-token");
    localStorage.removeItem("openmate-api-url");
    window.location.href = "/login";
  }

  return (
    <nav className="nav-wave relative z-20 shrink-0 h-12 bg-background border-t border-border safe-area-bottom">
      {/* CSS wave bump */}
      <div className="nav-wave-bump" />
      <div className="nav-wave-border" />

      {/* Center voice button in the bump */}
      <div className="nav-wave-btn">
        <button
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onContextMenu={(e) => e.preventDefault()}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-background border border-border transition-transform hover:scale-105 active:scale-95 cursor-pointer shadow-sm"
          title="Hold: Voice"
        >
          <Mic size={18} className="text-muted-foreground" />
        </button>
      </div>

      <div className="flex h-full items-center">
        {/* Fixed left: User avatar button */}
        <div className="relative shrink-0 flex items-center justify-center w-12 h-full" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground transition-transform hover:scale-105"
          >
            {userId[0].toUpperCase()}
          </button>

          {/* User popup menu */}
          {userMenuOpen && (
            <div className="absolute bottom-full left-0 mb-2 w-56 rounded-xl border border-border bg-card shadow-lg overflow-hidden z-50">
              <div className="p-3 border-b border-border">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                    {userId[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{userId}</div>
                    <div className="text-[10px] text-muted-foreground">v0.1.0</div>
                  </div>
                </div>
              </div>
              <div className="py-1">
                <button onClick={() => { router.push('/settings#account'); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                  <User size={14} className="text-muted-foreground" />
                  {t("account.viewProfile", "个人资料")}
                </button>
                <button onClick={() => { router.push('/settings'); setUserMenuOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors">
                  <Settings size={14} className="text-muted-foreground" />
                  {t("nav.settings", "设置")}
                </button>
              </div>
              <div className="border-t border-border py-1">
                <button onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/50 transition-colors text-red-500">
                  <LogOut size={14} />
                  {t("account.logout", "退出登录")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Scrollable middle items */}
        <div
          ref={scrollRef}
          className="flex-1 flex h-full items-center gap-0.5 overflow-x-auto"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            paddingLeft: "4px",
            paddingRight: "4px",
          }}
        >
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            const isChat = item.href === '/chat';
            const isChatActive = isChat && active;
            return isChatActive ? (
              <button
                key={item.href}
                onClick={() => onOpenConversations?.()}
                className={cn(
                  "relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[9px] font-medium transition-colors min-w-[48px]",
                  "text-primary bg-primary/10"
                )}
              >
                <div className="relative">
                  <Icon size={16} strokeWidth={2.2} />
                  {totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[7px] font-bold leading-none">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-[42px] leading-tight">{t(item.label)}</span>
              </button>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                ref={active ? activeRef : undefined}
                className={cn(
                  "relative flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2.5 py-1.5 text-[9px] font-medium transition-colors min-w-[48px]",
                  active
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                <div className="relative">
                  <Icon size={16} strokeWidth={active ? 2.2 : 1.5} />
                  {isChat && totalUnread > 0 && (
                    <span className="absolute -top-1.5 -right-2 flex items-center justify-center min-w-[14px] h-3.5 px-0.5 rounded-full bg-red-500 text-white text-[7px] font-bold leading-none">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </div>
                <span className="truncate max-w-[42px] leading-tight">{t(item.label)}</span>
              </Link>
            );
          })}
        </div>


      </div>

      <style jsx global>{`
        .nav-wave {
          overflow: visible;
        }
        .nav-wave-bump {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: 100%;
          width: 80px;
          height: 40px;
          border-radius: 80px 80px 0 0;
          background: hsl(var(--background));
          z-index: 5;
        }
        .nav-wave-border {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: 100%;
          width: 80px;
          height: 40px;
          border-radius: 80px 80px 0 0;
          border: 1px solid hsl(var(--border));
          border-bottom: none;
          z-index: 6;
          pointer-events: none;
        }
        .nav-wave-btn {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          bottom: calc(100% + 4px);
          z-index: 10;
        }
      `}</style>
    </nav>
  );
}

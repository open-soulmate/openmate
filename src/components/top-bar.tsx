"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect } from "react";
import {
  Bell, PanelRightOpen, PanelRightClose, Search,
  Activity, BarChart3, Stethoscope, Gauge, Shield, Plug,
} from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HealthWidget } from "@/components/health-widget";

interface TopBarProps {
  rightPanelOpen: boolean;
  onToggleRightPanel: () => void;
  eventCount?: number;
  pageTitle?: React.ReactNode;
}

export function TopBar({ rightPanelOpen, onToggleRightPanel, eventCount = 0, pageTitle }: TopBarProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const scrollRef = useRef<HTMLDivElement>(null);

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

  const utilityItems = [
    { id: "notifications", icon: Bell, label: t("nav.notifications", "通知"), badge: eventCount, href: "/notifications" },
    { id: "activity", icon: Activity, label: t("nav.activity", "动态"), href: "/activity" },
    { id: "diagnostics", icon: Stethoscope, label: t("nav.diagnostics", "诊断"), href: "/diagnostics" },
    { id: "metrics", icon: BarChart3, label: t("nav.metrics", "指标"), href: "/metrics" },
    { id: "benchmark", icon: Gauge, label: t("nav.benchmark", "基准"), href: "/benchmark" },
    { id: "plugins", icon: Plug, label: t("nav.plugins", "插件"), href: "/plugins" },
    { id: "system", icon: Shield, label: t("nav.system", "系统"), href: "/system" },
  ];

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-border bg-background px-3">
      {/* Left: page title (always visible) */}
      <div className="shrink-0 min-w-0">
        {pageTitle || <span className="text-sm font-medium">OpenMate</span>}
      </div>

      {/* Right: scrollable utility icons */}
      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 overflow-x-auto ml-2"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Health Widget */}
        <HealthWidget />

        {/* Global Search (⌘K) */}
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title={t("nav.search", "搜索")}
        >
          <Search size={14} />
          <span className="hidden lg:inline truncate">{t("nav.search", "搜索")}</span>
          <kbd className="hidden lg:inline pointer-events-none select-none rounded border border-border bg-muted px-1 text-[9px] font-mono text-muted-foreground">⌘K</kbd>
        </button>

        {utilityItems.map((item) => {
          const Icon = item.icon;
          const active = item.href && pathname.startsWith(item.href);

          return (
            <Link
              key={item.id}
              href={item.href}
              className={cn(
                "relative flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors",
                active
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
              title={item.label}
            >
              <div className="relative">
                <Icon size={14} />
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex items-center justify-center min-w-[12px] h-3 px-0.5 rounded-full bg-red-500 text-white text-[6px] font-bold leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="hidden lg:inline truncate">{item.label}</span>
            </Link>
          );
        })}

        {/* Workspace toggle */}
        <button
          onClick={onToggleRightPanel}
          className={cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors",
            rightPanelOpen
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
          title={rightPanelOpen ? "关闭工作区" : "打开工作区"}
        >
          {rightPanelOpen ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
          <span className="hidden lg:inline truncate">{t("nav.workspace", "工作区")}</span>
        </button>
      </div>
    </div>
  );
}

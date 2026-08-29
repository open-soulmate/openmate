"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect } from "react";
import {
  Bell, Search, Download, Settings,
  Activity, BarChart3, Stethoscope, Gauge, Shield, Plug,
} from "lucide-react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { HealthWidget } from "@/components/health-widget";

interface TopBarProps {
  eventCount?: number;
}

export function TopBar({ eventCount = 0 }: TopBarProps) {
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

  const statusItems = [
    { id: "activity", icon: Activity, label: t("nav.activity", "动态"), href: "/activity" },
    { id: "diagnostics", icon: Stethoscope, label: t("nav.diagnostics", "诊断"), href: "/diagnostics" },
    { id: "metrics", icon: BarChart3, label: t("nav.metrics", "指标"), href: "/metrics" },
    { id: "benchmark", icon: Gauge, label: t("nav.benchmark", "基准"), href: "/benchmark" },
  ];

  const navItems = [
    { id: "notifications", icon: Bell, label: t("nav.notifications", "通知"), badge: eventCount, href: "/notifications" },
    { id: "download", icon: Download, label: t("nav.download", "下载"), href: "/download" },
    { id: "plugins", icon: Plug, label: t("nav.plugins", "插件"), href: "/plugins" },
    { id: "system", icon: Shield, label: t("nav.system", "系统"), href: "/system" },
  ];

  type NavItem = { id: string; icon: React.ElementType; label: string; href: string; badge?: number };

  const renderItem = (item: NavItem) => {
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
  };

  return (
    <div className="flex h-12 shrink-0 items-center border-b border-border bg-background safe-area-top">
      {/* Fixed left: logo only */}
      <div className="flex items-center shrink-0 px-3">
        <span className="text-sm font-bold text-primary">OM</span>
        <span className="text-sm font-semibold text-foreground hidden sm:inline">OpenMate</span>
      </div>

      {/* Scrollable middle area: health + status + nav + search */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-1 overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        <HealthWidget />
        {statusItems.map(renderItem)}
        {/* Divider */}
        <div className="w-px h-4 bg-border shrink-0 mx-1" />
        {navItems.map(renderItem)}
        <button
          onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true }))}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-medium transition-colors text-muted-foreground hover:text-foreground hover:bg-accent"
          title={t("nav.search", "搜索")}
        >
          <Search size={14} />
          <span className="hidden lg:inline truncate">{t("nav.search", "搜索")}</span>
          <kbd className="hidden lg:inline pointer-events-none select-none rounded border border-border bg-muted px-1 text-[9px] font-mono text-muted-foreground">⌘K</kbd>
        </button>
      </div>

      {/* Fixed settings button on far right */}
      <Link
        href="/settings"
        className={cn(
          "flex shrink-0 items-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors border-l border-border h-full",
          pathname.startsWith("/settings")
            ? "text-primary bg-primary/10"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title={t("nav.settings", "设置")}
      >
        <Settings size={16} />
      </Link>
    </div>
  );
}

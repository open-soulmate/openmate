"use client";

import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useRef, useEffect, useState } from "react";
import {
  Bell, Search, PanelRightOpen, PanelRightClose,
  Settings, Moon, Sun, Wifi, WifiOff,
  Terminal, Download, Activity, BarChart3,
  Stethoscope, Gauge, Shield, Plug,
} from "lucide-react";
import { NotificationCenter } from "@/components/notification-center";
import { usePathname } from "next/navigation";
import Link from "next/link";

interface TopBarItem {
  id: string;
  icon: React.ElementType;
  label: string;
  badge?: number;
  onClick?: () => void;
  href?: string;
  active?: boolean;
}

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

  const items: TopBarItem[] = [
    { id: "notifications", icon: Bell, label: t("nav.notifications", "通知"), badge: eventCount, href: "/notifications" },
    { id: "activity", icon: Activity, label: t("nav.activity", "动态"), href: "/activity" },
    { id: "diagnostics", icon: Stethoscope, label: t("nav.diagnostics", "诊断"), href: "/diagnostics" },
    { id: "metrics", icon: BarChart3, label: t("nav.metrics", "指标"), href: "/metrics" },
    { id: "benchmark", icon: Gauge, label: t("nav.benchmark", "基准"), href: "/benchmark" },
    { id: "plugins", icon: Plug, label: t("nav.plugins", "插件"), href: "/plugins" },
    { id: "system", icon: Shield, label: t("nav.system", "系统"), href: "/system" },
    { id: "workspace", icon: PanelRightOpen, label: t("nav.workspace", "工作区"), onClick: onToggleRightPanel, active: rightPanelOpen },
  ];

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-border bg-background">
      {/* Left: page title (mobile) or spacer */}
      {pageTitle && (
        <div className="shrink-0 px-3 md:hidden">
          {pageTitle}
        </div>
      )}

      {/* Scrollable utility items */}
      <div
        ref={scrollRef}
        className="flex flex-1 h-full items-center gap-0.5 overflow-x-auto px-2"
        style={{
          scrollbarWidth: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {/* Spacer on desktop to push items right */}
        <div className="hidden md:block shrink-0 flex-1" />

        {items.map((item) => {
          const Icon = item.icon;
          const active = item.active || (item.href && pathname.startsWith(item.href));

          const content = (
            <>
              <div className="relative">
                {item.id === "workspace" && rightPanelOpen ? (
                  <PanelRightClose size={14} />
                ) : (
                  <Icon size={14} />
                )}
                {item.badge && item.badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 flex items-center justify-center min-w-[12px] h-3 px-0.5 rounded-full bg-red-500 text-white text-[6px] font-bold leading-none">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </div>
              <span className="truncate leading-tight">{item.label}</span>
            </>
          );

          const className = cn(
            "flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium transition-colors",
            active
              ? "text-primary bg-primary/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          );

          if (item.href) {
            return (
              <Link key={item.id} href={item.href} className={className}>
                {content}
              </Link>
            );
          }

          return (
            <button key={item.id} onClick={item.onClick} className={className}>
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
}

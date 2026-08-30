"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Clock, GitBranch } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import dynamic from "next/dynamic";

const TimelineTab = dynamic(
  () => import("./tabs/timeline-tab").then((m) => m.TimelineTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Clock className="w-4 h-4 animate-spin mr-2" />
        Loading…
      </div>
    ),
  }
);

const ChangelogTab = dynamic(
  () => import("./tabs/changelog-tab").then((m) => m.ChangelogTab),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <GitBranch className="w-4 h-4 animate-spin mr-2" />
        Loading…
      </div>
    ),
  }
);

const TABS = [
  { id: "timeline" as const, labelKey: "activity.timelineTab", fallback: "事件时间线", icon: Clock },
  { id: "changelog" as const, labelKey: "activity.changelogTab", fallback: "变更日志", icon: GitBranch },
];

export function ActivityClient() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"timeline" | "changelog">("timeline");

  return (
    <PageLayout title={t("activity.pageTitle", "Activity")}>
      <div className="flex flex-col h-full">
        {/* Top-level tab bar */}
        <div className="flex items-center gap-1 px-3 lg:px-6 pt-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-4 py-2 text-sm rounded-t-lg border-b-2 transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary font-medium bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <tab.icon className="w-4 h-4" />
              {t(tab.labelKey, tab.fallback)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === "timeline" ? <TimelineTab /> : <ChangelogTab />}
        </div>
      </div>
    </PageLayout>
  );
}

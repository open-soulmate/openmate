"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { CommandMenu } from "@/components/command-menu";
import { useAppStore } from "@/stores/app-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const hasCompletedOnboarding = useAppStore((s) => s.hasCompletedOnboarding);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!hasCompletedOnboarding && pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [hasCompletedOnboarding, pathname, router]);

  if (!hasCompletedOnboarding && pathname !== "/onboarding") {
    return null;
  }

  if (pathname === "/onboarding") {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <AppShell />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <CommandMenu />
    </div>
  );
}

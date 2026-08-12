"use client";
import { AppShell } from "@/components/app-shell";
import { Topbar } from "@/components/topbar";
import { CommandMenu } from "@/components/command-menu";

export default function AppLayout({ children }: { children: React.ReactNode }) {
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

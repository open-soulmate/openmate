"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts for OpenMate.
 *
 * Cmd/Ctrl + K  — Command palette (handled by command-menu.tsx)
 * Cmd/Ctrl + /  — Toggle sidebar
 * Cmd/Ctrl + B  — Go to Chat
 * Cmd/Ctrl + D  — Go to Dashboard
 * Cmd/Ctrl + E  — Go to Knowledge
 * Cmd/Ctrl + J  — Go to Workspace
 * Cmd/Ctrl + ,  — Go to Settings
 * Cmd/Ctrl + Shift + S — Go to Search
 */
export function GlobalShortcuts() {
  const router = useRouter();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Only allow Cmd+K in inputs (command palette)
        if (e.key === "k") return; // let command-menu handle it
        return;
      }

      switch (e.key) {
        case "b":
          e.preventDefault();
          router.push("/chat");
          break;
        case "d":
          e.preventDefault();
          router.push("/dashboard");
          break;
        case "e":
          e.preventDefault();
          router.push("/knowledge");
          break;
        case "j":
          e.preventDefault();
          router.push("/workspace");
          break;
        case ",":
          e.preventDefault();
          router.push("/settings");
          break;
        case "s":
          if (e.shiftKey) {
            e.preventDefault();
            router.push("/search");
          }
          break;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [router]);

  return null; // This component renders nothing
}

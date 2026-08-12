"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  MessageSquare,
  BookOpen,
  Network,
  Search,
  GraduationCap,
  Server,
  Settings,
  Plus,
  RefreshCw,
  Trash2,
  Moon,
  Sun,
  Palette,
  Command,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
  group: string;
}

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const commands: CommandItem[] = [
    // Navigation
    { id: "nav-chat", label: "对话", icon: <MessageSquare size={16} />, action: () => router.push("/chat"), keywords: ["chat", "对话"], group: "跳转" },
    { id: "nav-knowledge", label: "知识库", icon: <BookOpen size={16} />, action: () => router.push("/knowledge"), keywords: ["knowledge", "知识"], group: "跳转" },
    { id: "nav-graph", label: "图谱", icon: <Network size={16} />, action: () => router.push("/graph"), keywords: ["graph", "图谱"], group: "跳转" },
    { id: "nav-search", label: "搜索", icon: <Search size={16} />, action: () => router.push("/search"), keywords: ["search", "搜索"], group: "跳转" },
    { id: "nav-learn", label: "学习", icon: <GraduationCap size={16} />, action: () => router.push("/learn"), keywords: ["learn", "学习"], group: "跳转" },
    { id: "nav-agents", label: "Agents", icon: <Server size={16} />, action: () => router.push("/agents"), keywords: ["agent", "节点"], group: "跳转" },
    { id: "nav-settings", label: "设置", icon: <Settings size={16} />, action: () => router.push("/settings"), keywords: ["settings", "设置"], group: "跳转" },

    // Quick actions
    { id: "new-chat", label: "新建对话", icon: <Plus size={16} />, action: () => { router.push("/chat"); }, keywords: ["new", "新建", "对话"], group: "快捷操作" },
    { id: "new-knowledge", label: "新建知识", icon: <Plus size={16} />, action: () => router.push("/knowledge"), keywords: ["new", "新建", "知识"], group: "快捷操作" },
    { id: "new-learn", label: "新建课程", icon: <Plus size={16} />, action: () => router.push("/learn"), keywords: ["new", "新建", "课程"], group: "快捷操作" },

    // System
    { id: "refresh", label: "刷新页面", icon: <RefreshCw size={16} />, action: () => window.location.reload(), keywords: ["refresh", "刷新"], group: "系统" },
    { id: "clear-cache", label: "清除缓存", icon: <Trash2 size={16} />, action: () => { localStorage.clear(); window.location.reload(); }, keywords: ["clear", "清除", "缓存"], group: "系统" },
    { id: "theme-dark", label: "切换深色主题", icon: <Moon size={16} />, action: () => { document.documentElement.classList.add("dark"); document.documentElement.classList.remove("light"); }, keywords: ["dark", "深色", "主题"], group: "系统" },
    { id: "theme-light", label: "切换浅色主题", icon: <Sun size={16} />, action: () => { document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); }, keywords: ["light", "浅色", "主题"], group: "系统" },
    { id: "theme-purple", label: "切换紫色主题", icon: <Palette size={16} />, action: () => { document.documentElement.classList.add("dark", "theme-purple"); }, keywords: ["purple", "紫色", "主题"], group: "系统" },
  ];

  const filtered = query.trim()
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          cmd.keywords.some((k) => k.includes(query.toLowerCase())),
      )
    : commands;

  // Group filtered commands
  const grouped = filtered.reduce<Record<string, CommandItem[]>>((acc, cmd) => {
    (acc[cmd.group] ??= []).push(cmd);
    return acc;
  }, {});

  const flatList = filtered;

  // Keyboard shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      setOpen(false);
      cmd.action();
    },
    [],
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % flatList.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + flatList.length) % flatList.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = flatList[selectedIndex];
      if (cmd) executeCommand(cmd);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[20vh]">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Panel */}
      <div className="relative z-50 w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <Command size={16} className="shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="搜索命令..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="shrink-0 select-none rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1.5">
          {flatList.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              未找到匹配命令
            </div>
          ) : (
            Object.entries(grouped).map(([group, items]) => {
              let globalIdx = flatList.indexOf(items[0]);
              return (
                <div key={group}>
                  <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                    {group}
                  </div>
                  {items.map((cmd) => {
                    const idx = globalIdx++;
                    const isSelected = idx === selectedIndex;
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          isSelected
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent/50",
                        )}
                      >
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                          {cmd.icon}
                        </span>
                        <span className="flex-1 text-left">{cmd.label}</span>
                        {isSelected && (
                          <kbd className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                            Enter
                          </kbd>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-2">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1">↑</kbd>
              <kbd className="rounded border border-border px-1">↓</kbd>
              导航
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1">↵</kbd>
              执行
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border px-1">Esc</kbd>
              关闭
            </span>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {flatList.length} 条命令
          </span>
        </div>
      </div>
    </div>
  );
}

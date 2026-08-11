import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  type: "document" | "note" | "link";
  tags: string[];
  updatedAt: number;
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  version: string;
}

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  activeChatId: string | null;
  messages: ChatMessage[];
  setActiveChat: (id: string | null) => void;
  addMessage: (msg: ChatMessage) => void;
  clearMessages: () => void;

  knowledgeItems: KnowledgeItem[];
  setKnowledgeItems: (items: KnowledgeItem[]) => void;

  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
  toggleSkill: (id: string) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  activeChatId: null,
  messages: [],
  setActiveChat: (id) => set({ activeChatId: id }),
  addMessage: (msg) => set((s) => ({ messages: [...s.messages, msg] })),
  clearMessages: () => set({ messages: [] }),

  knowledgeItems: [],
  setKnowledgeItems: (items) => set({ knowledgeItems: items }),

  skills: [],
  setSkills: (skills) => set({ skills }),
  toggleSkill: (id) =>
    set((s) => ({
      skills: s.skills.map((sk) =>
        sk.id === id ? { ...sk, enabled: !sk.enabled } : sk,
      ),
    })),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
}));

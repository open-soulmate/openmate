import { create } from "zustand";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  sources?: { title: string; url: string }[];
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeItem {
  id: string;
  title: string;
  type: "document" | "note" | "link";
  tags: string[];
  updatedAt: string;
  excerpt: string;
  starred?: boolean;
  pinned?: boolean;
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

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  clearActiveConversation: () => void;

  // Legacy single-chat support
  messages: ChatMessage[];
  clearMessages: () => void;

  knowledgeItems: KnowledgeItem[];
  setKnowledgeItems: (items: KnowledgeItem[]) => void;
  toggleStar: (id: string) => void;
  togglePin: (id: string) => void;

  skills: Skill[];
  setSkills: (skills: Skill[]) => void;
  toggleSkill: (id: string) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // Conversations
  conversations: [],
  activeConversationId: null,
  setActiveConversation: (id) => set({ activeConversationId: id }),
  createConversation: () => {
    const id = Math.random().toString(36).slice(2, 10);
    const conv: Conversation = {
      id,
      title: "New conversation",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      conversations: [conv, ...s.conversations],
      activeConversationId: id,
    }));
    return id;
  },
  deleteConversation: (id) =>
    set((s) => {
      const convs = s.conversations.filter((c) => c.id !== id);
      return {
        conversations: convs,
        activeConversationId:
          s.activeConversationId === id
            ? convs[0]?.id ?? null
            : s.activeConversationId,
      };
    }),
  addMessage: (msg) =>
    set((s) => {
      let convId = s.activeConversationId;
      if (!convId) {
        convId = Math.random().toString(36).slice(2, 10);
        const conv: Conversation = {
          id: convId,
          title: msg.content.slice(0, 40),
          messages: [msg],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          conversations: [conv, ...s.conversations],
          activeConversationId: convId,
          messages: [...s.messages, msg],
        };
      }
      const convs = s.conversations.map((c) =>
        c.id === convId
          ? {
              ...c,
              messages: [...c.messages, msg],
              updatedAt: Date.now(),
              title:
                c.messages.length === 0 && msg.role === "user"
                  ? msg.content.slice(0, 40)
                  : c.title,
            }
          : c,
      );
      return { conversations: convs, messages: [...s.messages, msg] };
    }),
  clearActiveConversation: () =>
    set((s) => {
      if (!s.activeConversationId) return s;
      return {
        conversations: s.conversations.filter(
          (c) => c.id !== s.activeConversationId,
        ),
        activeConversationId: null,
        messages: [],
      };
    }),

  messages: [],
  clearMessages: () => set({ messages: [], activeConversationId: null }),

  knowledgeItems: [],
  setKnowledgeItems: (items) => set({ knowledgeItems: items }),
  toggleStar: (id) =>
    set((s) => ({
      knowledgeItems: s.knowledgeItems.map((i) =>
        i.id === id ? { ...i, starred: !i.starred } : i,
      ),
    })),
  togglePin: (id) =>
    set((s) => ({
      knowledgeItems: s.knowledgeItems.map((i) =>
        i.id === id ? { ...i, pinned: !i.pinned } : i,
      ),
    })),

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

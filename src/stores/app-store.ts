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

export interface LLMConfig {
  provider: string;
  url: string;
  apiKey: string;
  model: string;
}

export interface AgentNode {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "error";
  lastSeen: string;
}

export type Theme = "dark" | "light" | "system";

interface AppState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Conversations
  conversations: Conversation[];
  activeConversationId: string | null;
  setActiveConversation: (id: string | null) => void;
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  updateConversationTitle: (id: string, title: string) => void;
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

  // LLM Config
  llmConfig: LLMConfig;
  setLLMConfig: (config: Partial<LLMConfig>) => void;

  // Agent Nodes
  agentNodes: AgentNode[];
  setAgentNodes: (nodes: AgentNode[]) => void;

  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

  // LLM Config
  llmConfig: {
    provider: "openai",
    url: "https://api.openai.com/v1",
    apiKey: "",
    model: "gpt-4o",
  },
  setLLMConfig: (config) =>
    set((s) => ({ llmConfig: { ...s.llmConfig, ...config } })),

  // Agent Nodes
  agentNodes: [
    { id: "soul-1", name: "Soul Core", type: "soul", status: "online", lastSeen: "Just now" },
    { id: "memory-1", name: "Memory Agent", type: "memory", status: "online", lastSeen: "2 min ago" },
    { id: "retrieval-1", name: "Retrieval Agent", type: "retrieval", status: "offline", lastSeen: "1 hour ago" },
    { id: "skill-1", name: "Skill Executor", type: "skill", status: "online", lastSeen: "Just now" },
  ],
  setAgentNodes: (nodes) => set({ agentNodes: nodes }),

  // Theme
  theme: "dark",
  setTheme: (theme) => {
    set({ theme });
    if (typeof document !== "undefined") {
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      if (theme === "system") {
        const sys = window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        root.classList.add(sys);
      } else {
        root.classList.add(theme);
      }
    }
  },

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

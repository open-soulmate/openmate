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
  pinned?: boolean;
  unreadCount?: number;
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

export type AgentType = "soma" | "ai" | "mcp";

export interface AgentNode {
  id: string;
  name: string;
  type: AgentType;
  status: "online" | "offline" | "error";
  lastSeen: string;
  // Soma fields
  nodeId?: string;
  endpoint?: string;
  // AI fields
  provider?: string;
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  // MCP fields
  serverUrl?: string;
  tools?: string[];
}

export type Theme = "dark" | "light" | "system";

export type GroupDispatchMode = "auto" | "manual";

export interface AgentGroup {
  id: string;
  name: string;
  description: string;
  masterAgentId: string;
  memberAgentIds: string[];
  dispatchMode: GroupDispatchMode;
  createdAt: number;
  updatedAt: number;
}

export interface GroupChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  agentId?: string;
  agentName?: string;
  agentType?: AgentType;
  timestamp: number;
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
  updateConversationTitle: (id: string, title: string) => void;
  togglePinConversation: (id: string) => void;
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

  // Agent Groups
  groups: AgentGroup[];
  setGroups: (groups: AgentGroup[]) => void;
  addGroup: (group: AgentGroup) => void;
  updateGroup: (id: string, updates: Partial<AgentGroup>) => void;
  deleteGroup: (id: string) => void;

  // Group Chat Messages (keyed by group id)
  groupMessages: Record<string, GroupChatMessage[]>;
  addGroupMessage: (groupId: string, msg: GroupChatMessage) => void;
  clearGroupMessages: (groupId: string) => void;

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
    { id: "soma-1", name: "采集分身-北京", type: "soma", status: "online", lastSeen: "Just now", nodeId: "soma-bj-01", endpoint: "ws://10.0.1.12:8900" },
    { id: "soma-2", name: "采集分身-上海", type: "soma", status: "offline", lastSeen: "1 hour ago", nodeId: "soma-sh-01", endpoint: "ws://10.0.2.12:8900" },
    { id: "ai-1", name: "GPT-4o", type: "ai", status: "online", lastSeen: "Just now", provider: "OpenAI", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
    { id: "ai-2", name: "Claude Sonnet", type: "ai", status: "online", lastSeen: "3 min ago", provider: "Claude", model: "claude-sonnet-4-20250514", baseUrl: "https://api.anthropic.com/v1" },
    { id: "mcp-1", name: "文件系统 MCP", type: "mcp", status: "online", lastSeen: "5 min ago", serverUrl: "http://localhost:3001", tools: ["read_file", "write_file", "list_dir"] },
    { id: "mcp-2", name: "数据库 MCP", type: "mcp", status: "error", lastSeen: "30 min ago", serverUrl: "http://localhost:3002", tools: ["query", "execute", "schema"] },
  ],
  setAgentNodes: (nodes) => set({ agentNodes: nodes }),

  // Agent Groups
  groups: [],
  setGroups: (groups) => set({ groups }),
  addGroup: (group) => set((s) => ({ groups: [group, ...s.groups] })),
  updateGroup: (id, updates) =>
    set((s) => ({
      groups: s.groups.map((g) =>
        g.id === id ? { ...g, ...updates, updatedAt: Date.now() } : g,
      ),
    })),
  deleteGroup: (id) =>
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
    })),

  // Group Chat Messages
  groupMessages: {},
  addGroupMessage: (groupId, msg) =>
    set((s) => ({
      groupMessages: {
        ...s.groupMessages,
        [groupId]: [...(s.groupMessages[groupId] ?? []), msg],
      },
    })),
  clearGroupMessages: (groupId) =>
    set((s) => ({
      groupMessages: { ...s.groupMessages, [groupId]: [] },
    })),

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
  updateConversationTitle: (id, title) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, title } : c,
      ),
    })),
  togglePinConversation: (id) =>
    set((s) => ({
      conversations: s.conversations.map((c) =>
        c.id === id ? { ...c, pinned: !c.pinned } : c,
      ),
    })),
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

// ─── localStorage persistence for conversations ────────────────────────────
if (typeof window !== "undefined") {
  try {
    const saved = localStorage.getItem("openmate-conversations");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        useAppStore.setState({
          conversations: parsed,
          activeConversationId: parsed[0]?.id ?? null,
        });
      }
    }
  } catch {
    // ignore
  }

  useAppStore.subscribe((state, prevState) => {
    if (state.conversations !== prevState.conversations) {
      try {
        localStorage.setItem("openmate-conversations", JSON.stringify(state.conversations));
      } catch {
        // ignore
      }
    }
  });
}

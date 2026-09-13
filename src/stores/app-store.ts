type AgentInfo = { id: string; name: string; icon: string; description: string; available: boolean; category?: string; path?: string; version?: string; };
import { create } from "zustand";
import { type ThemeId, getStoredTheme, applyTheme } from "@/lib/theme";

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  status: "running" | "success" | "error";
}

export interface FilePreview {
  path: string;
  language: string;
  content: string;
  lineCount: number;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  sources?: { title: string; url: string }[];
  toolCalls?: ToolCall[];
  filePreviews?: FilePreview[];
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

export type Theme = ThemeId;

export type GroupDispatchMode = "auto" | "manual";

// ─── Team types ─────────────────────────────────────────────────────────────

export type TeamMemberRole = "leader" | "member" | "observer";
export type TeamMemberStatus = "online" | "offline" | "busy";
export type ActivityType = "task_created" | "task_completed" | "member_joined" | "member_left" | "code_committed";
export type TaskStatus = "todo" | "in_progress" | "done";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface TeamMember {
  id: string;
  agentId: string;
  name: string;
  type: AgentType;
  role: TeamMemberRole;
  status: TeamMemberStatus;
  capabilities: string[];
  joinedAt: number;
}

export interface TeamActivity {
  id: string;
  type: ActivityType;
  actorId: string;
  actorName: string;
  description: string;
  taskId?: string;
  timestamp: number;
}

export interface TeamTask {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId?: string;
  assigneeName?: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  tasks: TeamTask[];
  activities: TeamActivity[];
  createdAt: number;
  updatedAt: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

export interface AppState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isGenerating: boolean;
  isSidebarOpen: boolean;
  isKnowledgePanelOpen: boolean;
  theme: Theme;
  agents: AgentNode[];
  groupDispatchMode: GroupDispatchMode;
  llmConfigs: LLMConfig[];
  teams: Team[];
  skills: Skill[];
  knowledgeItems: KnowledgeItem[];
  lastDNASyncTime: number | null;
  
  // Actions
  createConversation: (title?: string) => Conversation;
  updateConversationTitle: (conversationId: string, title: string) => void;
  sendMessage: (content: string) => void;
  setCurrentConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => void;
  togglePinConversation: (conversationId: string) => void;
  toggleSidebar: () => void;
  toggleKnowledgePanel: () => void;
  setTheme: (theme: Theme) => void;
  addAgent: (agent: AgentNode) => void;
  removeAgent: (agentId: string) => void;
  setGroupDispatchMode: (mode: GroupDispatchMode) => void;
  addLLMConfig: (config: LLMConfig) => void;
  removeLLMConfig: (provider: string) => void;
  addTeam: (team: Team) => void;
  removeTeam: (teamId: string) => void;
  addSkill: (skill: Skill) => void;
  removeSkill: (skillId: string) => void;
  toggleSkillEnabled: (skillId: string) => void;
  addKnowledgeItem: (item: KnowledgeItem) => void;
  removeKnowledgeItem: (itemId: string) => void;
  toggleStarKnowledgeItem: (itemId: string) => void;
  togglePinKnowledgeItem: (itemId: string) => void;
  
  // DNA sync methods
  syncToDNA: () => Promise<void>;
  forceSyncDNA: () => Promise<void>;
}

// Debounce utility
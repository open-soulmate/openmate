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
}

// ─── Self Diagnosis types ───────────────────────────────────────────────────

export type SelfDiagnosisStatus = 'idle' | 'running' | 'completed' | 'failed';
export type DiagnosisSeverity = 'info' | 'warning' | 'error' | 'critical';

export interface IDiagnosisFinding {
  id: string;
  severity: DiagnosisSeverity;
  message: string;
  component?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface ISelfDiagnosisState {
  status: SelfDiagnosisStatus;
  lastRun: string;
  findings: IDiagnosisFinding[];
}

// ─── App State ──────────────────────────────────────────────────────────────

export interface IAppState {
  // ... existing state properties (conversations, activeId, agents, theme, etc.)
  agents: AgentInfo[];
  conversations: Conversation[];
  activeConversationId: string | null;
  knowledgeBase: KnowledgeItem[];
  skills: Skill[];
  llmConfig: LLMConfig;
  nodes: AgentNode[];
  theme: Theme;
  groupDispatchMode: GroupDispatchMode;
  sidebarOpen: boolean;
  currentTeamId: string | null;
  teams: Team[];
  selfDiagnosisState: ISelfDiagnosisState; // New state for self-diagnosis

  // ... existing actions (createConversation, sendMessage, setActiveConversation, etc.)
  createConversation: () => void;
  setActiveConversation: (id: string | null) => void;
  sendMessage: (content: string) => Promise<void>;
  updateLLMConfig: (config: Partial<LLMConfig>) => void;
  toggleAgent: (id: string) => void;
  setTheme: (theme: Theme) => void;
  toggleSidebar: () => void;
  setCurrentTeam: (teamId: string | null) => void;
  addTeamMember: (teamId: string, member: Omit<TeamMember, "id" | "joinedAt">) => void;
  removeTeamMember: (teamId: string, memberId: string) => void;
  createTeamTask: (teamId: string, task: Omit<TeamTask, "id" | "createdAt" | "updatedAt">) => void;
  updateTeamTask: (teamId: string, taskId: string, updates: Partial<TeamTask>) => void;
  addTeamActivity: (teamId: string, activity: Omit<TeamActivity, "id" | "timestamp">) => void;
  fetchAgents: () => Promise<void>;

  // New action for self-diagnosis
  triggerSelfDiagnosis: () => Promise<void>;
}

// Helper to generate a simple ID
const generateId = () => Math.random().toString(36).substring(2, 9);

export const useAppStore = create<IAppState>((set, get) => ({
  // Initial state values
  agents: [],
  conversations: [],
  activeConversationId: null,
  knowledgeBase: [
    { id: "k1", title: "项目架构文档", type: "document", tags: ["架构", "设计"], updatedAt: "2024-01-15", excerpt: "本文档描述了项目的整体架构...", starred: true },
    { id: "k2", title: "API 设计规范", type: "document", tags: ["API", "规范"], updatedAt: "2024-01-20", excerpt: "RESTful API 设计指南...", pinned: true },
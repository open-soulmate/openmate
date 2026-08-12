import {
  Bot,
  MessageSquare,
  Globe,
  BrainCircuit,
  Server,
  Cpu,
  Workflow,
  Code2,
  Terminal,
  type LucideIcon,
} from "lucide-react";

// ─── Agent Type Enums (AionUi-inspired) ─────────────────────────────────────

export type AgentCategory = "local" | "remote" | "tool";

export type AgentSource = "internal" | "builtin" | "extension" | "custom";

export type AgentRuntimeStatus = "online" | "offline" | "missing" | "unchecked";

// ─── Agent Metadata ─────────────────────────────────────────────────────────

export interface DetectedAgent {
  id: string;
  name: string;
  binary?: string;
  category: AgentCategory;
  source: AgentSource;
  status: AgentRuntimeStatus;
  description: string;
  icon: LucideIcon;
  color: string;
  installCommand?: string;
  detectedAt?: number;
  taskTypes?: string[];
}

// ─── Predefined Agent Definitions ───────────────────────────────────────────

export const LOCAL_AGENT_DEFS: Omit<DetectedAgent, "status" | "detectedAt">[] = [
  {
    id: "hermes",
    name: "Hermes",
    binary: "hermes",
    category: "local",
    source: "builtin",
    description: "Hermes 消息代理，支持多协议通信。",
    icon: Workflow,
    color: "text-cyan-400",
    installCommand: "# Install Hermes",
    taskTypes: ["messaging", "automation"],
  },
  {
    id: "claude-cli",
    name: "Claude CLI",
    binary: "claude",
    category: "local",
    source: "builtin",
    description: "Anthropic Claude 命令行客户端。",
    icon: MessageSquare,
    color: "text-orange-400",
    installCommand: "npm install -g @anthropic-ai/claude-cli",
    taskTypes: ["chat", "code", "reasoning"],
  },
  {
    id: "codex",
    name: "Codex CLI",
    binary: "codex",
    category: "local",
    source: "builtin",
    description: "OpenAI Codex 命令行编码助手。",
    icon: Code2,
    color: "text-emerald-400",
    installCommand: "npm install -g @openai/codex",
    taskTypes: ["code", "reasoning"],
  },
  {
    id: "opencode",
    name: "OpenCode",
    binary: "opencode",
    category: "local",
    source: "builtin",
    description: "开源 AI 编码助手，支持多种模型。",
    icon: Terminal,
    color: "text-blue-400",
    installCommand: "npm install -g opencode",
    taskTypes: ["code", "chat"],
  },
  {
    id: "ollama",
    name: "Ollama",
    binary: "ollama",
    category: "local",
    source: "builtin",
    description: "本地大模型推理框架，一键运行 Llama、Qwen 等模型。",
    icon: Cpu,
    color: "text-violet-400",
    installCommand: "curl -fsSL https://ollama.com/install.sh | sh",
    taskTypes: ["chat", "code", "reasoning"],
  },
  {
    id: "interpreter",
    name: "Open Interpreter",
    binary: "interpreter",
    category: "local",
    source: "builtin",
    description: "本地代码执行引擎，支持自然语言控制计算机。",
    icon: Terminal,
    color: "text-amber-400",
    installCommand: "pip install open-interpreter",
    taskTypes: ["code", "shell", "automation"],
  },
  {
    id: "aider",
    name: "Aider",
    binary: "aider",
    category: "local",
    source: "builtin",
    description: "AI 结对编程助手，直接在终端中编辑代码。",
    icon: Bot,
    color: "text-pink-400",
    installCommand: "pip install aider-chat",
    taskTypes: ["code", "refactor"],
  },
  {
    id: "n8n",
    name: "n8n",
    binary: "n8n",
    category: "local",
    source: "builtin",
    description: "开源工作流自动化平台，连接 400+ 应用与服务。",
    icon: Workflow,
    color: "text-rose-400",
    installCommand: "docker run -it --rm -p 5678:5678 n8nio/n8n",
    taskTypes: ["workflow", "automation"],
  },
];

export const REMOTE_AGENT_DEFS: Omit<DetectedAgent, "status" | "detectedAt">[] = [
  {
    id: "claude-api",
    name: "Claude API",
    category: "remote",
    source: "builtin",
    description: "Anthropic Claude API，擅长长文本与推理。",
    icon: MessageSquare,
    color: "text-orange-400",
    taskTypes: ["chat", "code", "reasoning", "writing"],
  },
  {
    id: "openai-api",
    name: "OpenAI API",
    category: "remote",
    source: "builtin",
    description: "OpenAI GPT 系列 API，支持 GPT-4o 及更早版本。",
    icon: Globe,
    color: "text-green-400",
    taskTypes: ["chat", "code", "reasoning"],
  },
  {
    id: "mimo-api",
    name: "MiMo API",
    category: "remote",
    source: "builtin",
    description: "小米自研大模型 API，中文理解与代码能力出色。",
    icon: BrainCircuit,
    color: "text-purple-400",
    taskTypes: ["chat", "code", "reasoning"],
  },
];

// ─── Icon Map for Registry Agents ───────────────────────────────────────────

export const AGENT_ICON_MAP: Record<string, LucideIcon> = {
  ollama: Cpu,
  claude: MessageSquare,
  gpt: Globe,
  mimo: BrainCircuit,
  "open-interpreter": Server,
  aider: Bot,
  n8n: Workflow,
  hermes: Workflow,
  codex: Code2,
  opencode: Terminal,
};

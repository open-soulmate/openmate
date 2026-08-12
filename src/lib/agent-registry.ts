export type MarketAgentType = "local" | "remote" | "tool";

export type AgentInstallStatus = "available" | "installing" | "installed" | "running" | "error";

export interface RegisteredAgent {
  id: string;
  name: string;
  type: MarketAgentType;
  status: AgentInstallStatus;
  config: Record<string, string>;
  installed_at: number;
  description?: string;
  installCommand?: string;
  port?: number;
  taskTypes?: string[];
}

const STORAGE_KEY = "openmate-agent-registry";

export class AgentRegistry {
  private agents: RegisteredAgent[] = [];
  private listeners: Array<() => void> = [];

  constructor() {
    this.load();
  }

  private load() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        this.agents = JSON.parse(raw);
      }
    } catch {
      this.agents = [];
    }
  }

  private save() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.agents));
    } catch {
      // ignore
    }
    this.notify();
  }

  private notify() {
    for (const fn of this.listeners) fn();
  }

  subscribe(fn: () => void) {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  getAll(): RegisteredAgent[] {
    return [...this.agents];
  }

  getById(id: string): RegisteredAgent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  getAvailableAgents(): RegisteredAgent[] {
    return this.agents.filter(
      (a) => a.status === "installed" || a.status === "running",
    );
  }

  getAgentForTask(taskType: string): RegisteredAgent | undefined {
    const available = this.getAvailableAgents();
    // Prefer local agents, then remote, then tools
    const priority: MarketAgentType[] = ["local", "remote", "tool"];
    for (const type of priority) {
      const match = available.find(
        (a) => a.type === type && (!a.taskTypes || a.taskTypes.includes(taskType)),
      );
      if (match) return match;
    }
    return available[0];
  }

  getDefaultChatAgent(): RegisteredAgent | undefined {
    const available = this.getAvailableAgents();
    // Prefer local (Ollama), then remote (Claude/GPT/MiMo)
    return (
      available.find((a) => a.type === "local" && a.id === "ollama") ??
      available.find((a) => a.type === "remote") ??
      available[0]
    );
  }

  register(agent: RegisteredAgent) {
    const idx = this.agents.findIndex((a) => a.id === agent.id);
    if (idx >= 0) {
      this.agents[idx] = { ...this.agents[idx], ...agent };
    } else {
      this.agents.push(agent);
    }
    this.save();
  }

  updateStatus(id: string, status: AgentInstallStatus, config?: Record<string, string>) {
    const agent = this.agents.find((a) => a.id === id);
    if (agent) {
      agent.status = status;
      if (config) agent.config = { ...agent.config, ...config };
      this.save();
    }
  }

  uninstall(id: string) {
    this.agents = this.agents.filter((a) => a.id !== id);
    this.save();
  }

  isInstalled(id: string): boolean {
    const agent = this.agents.find((a) => a.id === id);
    return !!agent && agent.status !== "available";
  }
}

// Singleton
let instance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (typeof window === "undefined") {
    return new AgentRegistry();
  }
  if (!instance) {
    instance = new AgentRegistry();
  }
  return instance;
}

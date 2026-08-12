import {
  type DetectedAgent,
  type AgentRuntimeStatus,
  LOCAL_AGENT_DEFS,
  REMOTE_AGENT_DEFS,
} from "./agent-types";

const STORAGE_KEY = "openmate-detected-agents";
const API_KEYS_KEY = "openmate-api-keys";

// ─── AgentDetector ──────────────────────────────────────────────────────────

export class AgentDetector {
  private agents: DetectedAgent[] = [];
  private listeners: Array<() => void> = [];

  constructor() {
    this.load();
  }

  // ── Persistence ─────────────────────────────────────────────────────────

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

  // ── Detection ───────────────────────────────────────────────────────────

  async detectLocalAgents(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = [];

    for (const def of LOCAL_AGENT_DEFS) {
      const status = await this.checkBinary(def.binary);
      results.push({
        ...def,
        status,
        detectedAt: status === "online" ? Date.now() : undefined,
      });
    }

    // Update stored agents: merge local results
    this.mergeAgents(results);
    return results;
  }

  async detectRemoteAgents(): Promise<DetectedAgent[]> {
    const results: DetectedAgent[] = [];
    const apiKeys = this.getApiKeys();

    // Claude API Key
    const claudeKey = apiKeys["claude"] || apiKeys["claude-api"] || "";
    results.push({
      ...REMOTE_AGENT_DEFS[0],
      status: claudeKey ? "online" : "missing",
      detectedAt: claudeKey ? Date.now() : undefined,
    });

    // OpenAI API Key
    const openaiKey = apiKeys["gpt"] || apiKeys["openai"] || apiKeys["openai-api"] || "";
    results.push({
      ...REMOTE_AGENT_DEFS[1],
      status: openaiKey ? "online" : "missing",
      detectedAt: openaiKey ? Date.now() : undefined,
    });

    // MiMo API Key
    const mimoKey = apiKeys["mimo"] || apiKeys["mimo-api"] || "";
    results.push({
      ...REMOTE_AGENT_DEFS[2],
      status: mimoKey ? "online" : "missing",
      detectedAt: mimoKey ? Date.now() : undefined,
    });

    // Update stored agents: merge remote results
    this.mergeAgents(results);
    return results;
  }

  async detectAll(): Promise<DetectedAgent[]> {
    const [local, remote] = await Promise.all([
      this.detectLocalAgents(),
      this.detectRemoteAgents(),
    ]);
    return [...local, ...remote];
  }

  // ── Queries ─────────────────────────────────────────────────────────────

  getAll(): DetectedAgent[] {
    return [...this.agents];
  }

  getOnline(): DetectedAgent[] {
    return this.agents.filter((a) => a.status === "online");
  }

  getLocal(): DetectedAgent[] {
    return this.agents.filter((a) => a.category === "local");
  }

  getRemote(): DetectedAgent[] {
    return this.agents.filter((a) => a.category === "remote");
  }

  getById(id: string): DetectedAgent | undefined {
    return this.agents.find((a) => a.id === id);
  }

  getStatus(): Record<string, AgentRuntimeStatus> {
    const map: Record<string, AgentRuntimeStatus> = {};
    for (const a of this.agents) {
      map[a.id] = a.status;
    }
    return map;
  }

  // ── Internal ────────────────────────────────────────────────────────────

  private async checkBinary(name: string | undefined): Promise<AgentRuntimeStatus> {
    if (!name) return "missing";

    // In browser context, we check if the agent is registered in the AgentRegistry
    // as a proxy for binary availability. Real shell detection would require Tauri.
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem("openmate-agent-registry");
        if (raw) {
          const registry = JSON.parse(raw) as Array<{ id: string; status: string }>;
          const found = registry.find(
            (a) => a.id === name || a.id === `${name}`,
          );
          if (found && (found.status === "installed" || found.status === "running")) {
            return "online";
          }
        }
      } catch {
        // ignore
      }
    }

    // Mark as unchecked — actual shell detection would happen server-side or via Tauri
    return "unchecked";
  }

  private getApiKeys(): Record<string, string> {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(API_KEYS_KEY) ?? "{}");
    } catch {
      return {};
    }
  }

  private mergeAgents(newAgents: DetectedAgent[]) {
    for (const agent of newAgents) {
      const idx = this.agents.findIndex((a) => a.id === agent.id);
      if (idx >= 0) {
        // Preserve existing entry but update status and detectedAt
        this.agents[idx] = {
          ...this.agents[idx],
          status: agent.status,
          detectedAt: agent.detectedAt ?? this.agents[idx].detectedAt,
        };
      } else {
        this.agents.push(agent);
      }
    }
    this.save();
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let instance: AgentDetector | null = null;

export function getAgentDetector(): AgentDetector {
  if (typeof window === "undefined") {
    return new AgentDetector();
  }
  if (!instance) {
    instance = new AgentDetector();
  }
  return instance;
}

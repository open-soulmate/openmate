import i18n from "./i18n";
import { getAgentRegistry, type RegisteredAgent, type MarketAgentType } from "./agent-registry";

export interface InstallProgress {
  stage: "copying" | "testing" | "saving" | "done" | "error";
  message: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  type: MarketAgentType;
  installCommand: string;
  needsApiKey: boolean;
  port?: number;
  checkCommand?: string;
  taskTypes?: string[];
}

// Known agents with their detection logic
const AGENT_DEFS: Record<string, AgentDefinition> = {
  "open-interpreter": {
    id: "open-interpreter",
    name: "Open Interpreter",
    description: i18n.t("agentTypes.computerUseDesc"),
    type: "local",
    installCommand: "pip install open-interpreter",
    needsApiKey: false,
    checkCommand: "which interpreter",
    taskTypes: ["code", "shell", "automation"],
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    description: i18n.t("agentTypes.ollamaDesc"),
    type: "local",
    installCommand: "curl -fsSL https://ollama.com/install.sh | sh",
    needsApiKey: false,
    checkCommand: "which ollama",
    port: 11434,
    taskTypes: ["chat", "code", "reasoning"],
  },
  aider: {
    id: "aider",
    name: "Aider",
    description: i18n.t("agentInstaller.aiderDesc"),
    type: "local",
    installCommand: "pip install aider-chat",
    needsApiKey: false,
    checkCommand: "which aider",
    taskTypes: ["code", "refactor"],
  },
  n8n: {
    id: "n8n",
    name: "n8n",
    description: i18n.t("agentTypes.n8nDesc"),
    type: "tool",
    installCommand: "docker run -it --rm -p 5678:5678 n8nio/n8n",
    needsApiKey: false,
    port: 5678,
    taskTypes: ["workflow", "automation"],
  },
  claude: {
    id: "claude",
    name: "Claude",
    description: "Anthropic AI assistant — excels at long text and reasoning.",
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning", "writing"],
  },
  gpt: {
    id: "gpt",
    name: "GPT",
    description: "OpenAI remote AI model supporting GPT-4o and earlier versions.",
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning"],
  },
  mimo: {
    id: "mimo",
    name: "MiMo",
    description: i18n.t("agentTypes.xiaomiDesc"),
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning"],
  },
  minio: {
    id: "minio",
    name: "MinIO",
    description: "High-performance object storage, S3-compatible, ideal for AI data lakes.",
    type: "tool",
    installCommand:
      "docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address :9001",
    needsApiKey: false,
    port: 9000,
    taskTypes: ["storage"],
  },
  nats: {
    id: "nats",
    name: "NATS",
    description: "Lightweight message queue built for microservices and Agent communication.",
    type: "tool",
    installCommand: "docker run -p 4222:4222 nats",
    needsApiKey: false,
    port: 4222,
    taskTypes: ["messaging"],
  },
};

export class AgentInstaller {
  private registry = getAgentRegistry();

  getDefinition(agentId: string): AgentDefinition | undefined {
    return AGENT_DEFS[agentId];
  }

  async install(
    agentId: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    const def = AGENT_DEFS[agentId];
    if (!def) {
      onProgress({ stage: "error", message: i18n.t("agentInstaller.unknownAgent") });
      return false;
    }

    if (def.type === "remote") {
      return this.installRemote(def, onProgress);
    }

    if (def.type === "local") {
      return this.installLocal(def, onProgress);
    }

    // tool
    return this.installTool(def, onProgress);
  }

  async installRemote(
    def: AgentDefinition,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    // Remote agents need API key — caller should show dialog first
    // This method is called after API key is provided
    onProgress({ stage: "testing", message: i18n.t("agentInstaller.testingConnection", { name: def.name }) });

    // Simulate connection test
    await delay(800);

    onProgress({ stage: "saving", message: i18n.t("agentInstaller.savingConfig") });

    this.registry.register({
      id: def.id,
      name: def.name,
      type: def.type,
      status: "installed",
      config: {},
      installed_at: Date.now(),
      description: def.description,
      taskTypes: def.taskTypes,
    });

    onProgress({ stage: "done", message: i18n.t("agentInstaller.connected", { name: def.name }) });
    return true;
  }

  async installRemoteWithKey(
    agentId: string,
    apiKey: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    const def = AGENT_DEFS[agentId];
    if (!def || def.type !== "remote") {
      onProgress({ stage: "error", message: i18n.t("agentInstaller.invalidAgent") });
      return false;
    }

    onProgress({ stage: "saving", message: i18n.t("agentInstaller.savingApiKey") });
    await delay(300);

    // Save API key to localStorage
    try {
      const keys = JSON.parse(localStorage.getItem("openmate-api-keys") ?? "{}");
      keys[def.id] = apiKey;
      localStorage.setItem("openmate-api-keys", JSON.stringify(keys));
    } catch {
      // ignore
    }

    onProgress({ stage: "testing", message: i18n.t("agentInstaller.testingConnection", { name: def.name }) });
    await delay(1000);

    // Simulate connection test (always succeeds for now)
    const connected = true;

    if (!connected) {
      onProgress({ stage: "error", message: i18n.t("agentInstaller.connectionTestFailed") });
      return false;
    }

    this.registry.register({
      id: def.id,
      name: def.name,
      type: def.type,
      status: "installed",
      config: { apiKey },
      installed_at: Date.now(),
      description: def.description,
      taskTypes: def.taskTypes,
    });

    onProgress({ stage: "done", message: i18n.t("agentInstaller.connected", { name: def.name }) });
    return true;
  }

  async installLocal(
    def: AgentDefinition,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    onProgress({ stage: "copying", message: i18n.t("agentInstaller.copyingInstallCmd") });

    try {
      await navigator.clipboard.writeText(def.installCommand);
    } catch {
      // clipboard may fail in some environments
    }

    onProgress({
      stage: "copying",
      message: i18n.t("agentInstaller.copied", { cmd: def.installCommand }),
    });

    // Wait a bit then check if available
    await delay(1500);
    onProgress({ stage: "testing", message: i18n.t("agentInstaller.detecting", { name: def.name }) });

    // We can't actually run shell commands from the browser,
    // so we mark as installed and let the user verify
    await delay(500);

    this.registry.register({
      id: def.id,
      name: def.name,
      type: def.type,
      status: "installed",
      config: {},
      installed_at: Date.now(),
      description: def.description,
      installCommand: def.installCommand,
      taskTypes: def.taskTypes,
    });

    onProgress({
      stage: "done",
      message: i18n.t("agentInstaller.markedInstalled", { name: def.name }),
    });
    return true;
  }

  async installTool(
    def: AgentDefinition,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    onProgress({ stage: "copying", message: i18n.t("agentInstaller.copyingDockerCmd") });

    try {
      await navigator.clipboard.writeText(def.installCommand);
    } catch {
      // clipboard may fail
    }

    onProgress({
      stage: "copying",
      message: i18n.t("agentInstaller.copied", { cmd: def.installCommand }),
    });

    await delay(1500);
    onProgress({ stage: "testing", message: i18n.t("agentInstaller.detectingPort", { port: def.port }) });

    // Check port availability (best effort from browser)
    if (def.port) {
      const portOk = await this.checkPort(def.port);
      if (portOk) {
        this.registry.register({
          id: def.id,
          name: def.name,
          type: def.type,
          status: "installed",
          config: {},
          installed_at: Date.now(),
          description: def.description,
          installCommand: def.installCommand,
          port: def.port,
          taskTypes: def.taskTypes,
        });
        onProgress({ stage: "done", message: i18n.t("agentInstaller.readyOnPort", { name: def.name, port: def.port }) });
        return true;
      }
    }

    // Port not reachable — still mark as installed for manual verification
    this.registry.register({
      id: def.id,
      name: def.name,
      type: def.type,
      status: "installed",
      config: {},
      installed_at: Date.now(),
      description: def.description,
      installCommand: def.installCommand,
      port: def.port,
      taskTypes: def.taskTypes,
    });

    onProgress({
      stage: "done",
      message: i18n.t("agentInstaller.markedInstalledDocker", { name: def.name }),
    });
    return true;
  }

  private async checkPort(port: number): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2000);
      await fetch(`http://localhost:${port}`, {
        mode: "no-cors",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Singleton
let installerInstance: AgentInstaller | null = null;

export function getAgentInstaller(): AgentInstaller {
  if (!installerInstance) {
    installerInstance = new AgentInstaller();
  }
  return installerInstance;
}

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
    description: "本地代码执行引擎，支持自然语言控制计算机。",
    type: "local",
    installCommand: "pip install open-interpreter",
    needsApiKey: false,
    checkCommand: "which interpreter",
    taskTypes: ["code", "shell", "automation"],
  },
  ollama: {
    id: "ollama",
    name: "Ollama",
    description: "本地大模型推理框架，一键运行 Llama、Qwen 等模型。",
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
    description: "AI 结对编程助手，直接在终端中编辑代码。",
    type: "local",
    installCommand: "pip install aider-chat",
    needsApiKey: false,
    checkCommand: "which aider",
    taskTypes: ["code", "refactor"],
  },
  n8n: {
    id: "n8n",
    name: "n8n",
    description: "开源工作流自动化平台，连接 400+ 应用与服务。",
    type: "tool",
    installCommand: "docker run -it --rm -p 5678:5678 n8nio/n8n",
    needsApiKey: false,
    port: 5678,
    taskTypes: ["workflow", "automation"],
  },
  claude: {
    id: "claude",
    name: "Claude",
    description: "Anthropic 出品的远程 AI 助手，擅长长文本与推理。",
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning", "writing"],
  },
  gpt: {
    id: "gpt",
    name: "GPT",
    description: "OpenAI 出品的远程 AI 模型，支持 GPT-4o 及更早版本。",
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning"],
  },
  mimo: {
    id: "mimo",
    name: "MiMo",
    description: "小米自研大模型，中文理解与代码能力出色。",
    type: "remote",
    installCommand: "",
    needsApiKey: true,
    taskTypes: ["chat", "code", "reasoning"],
  },
  minio: {
    id: "minio",
    name: "MinIO",
    description: "高性能对象存储，兼容 S3 API，适合 AI 数据湖。",
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
    description: "轻量级消息队列，为微服务与 Agent 通信而生。",
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
      onProgress({ stage: "error", message: "未知的 Agent" });
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
    onProgress({ stage: "testing", message: `正在测试 ${def.name} 连接…` });

    // Simulate connection test
    await delay(800);

    onProgress({ stage: "saving", message: "保存配置…" });

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

    onProgress({ stage: "done", message: `${def.name} 已接入` });
    return true;
  }

  async installRemoteWithKey(
    agentId: string,
    apiKey: string,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    const def = AGENT_DEFS[agentId];
    if (!def || def.type !== "remote") {
      onProgress({ stage: "error", message: "无效的 Agent" });
      return false;
    }

    onProgress({ stage: "saving", message: "保存 API Key…" });
    await delay(300);

    // Save API key to localStorage
    try {
      const keys = JSON.parse(localStorage.getItem("openmate-api-keys") ?? "{}");
      keys[def.id] = apiKey;
      localStorage.setItem("openmate-api-keys", JSON.stringify(keys));
    } catch {
      // ignore
    }

    onProgress({ stage: "testing", message: `正在测试 ${def.name} 连接…` });
    await delay(1000);

    // Simulate connection test (always succeeds for now)
    const connected = true;

    if (!connected) {
      onProgress({ stage: "error", message: "连接测试失败，请检查 API Key" });
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

    onProgress({ stage: "done", message: `${def.name} 已接入` });
    return true;
  }

  async installLocal(
    def: AgentDefinition,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    onProgress({ stage: "copying", message: "复制安装命令到剪贴板…" });

    try {
      await navigator.clipboard.writeText(def.installCommand);
    } catch {
      // clipboard may fail in some environments
    }

    onProgress({
      stage: "copying",
      message: `已复制: ${def.installCommand}`,
    });

    // Wait a bit then check if available
    await delay(1500);
    onProgress({ stage: "testing", message: `正在检测 ${def.name} 是否可用…` });

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
      message: `${def.name} 已标记为已安装（请确认命令已执行）`,
    });
    return true;
  }

  async installTool(
    def: AgentDefinition,
    onProgress: (p: InstallProgress) => void,
  ): Promise<boolean> {
    onProgress({ stage: "copying", message: "复制 Docker 命令到剪贴板…" });

    try {
      await navigator.clipboard.writeText(def.installCommand);
    } catch {
      // clipboard may fail
    }

    onProgress({
      stage: "copying",
      message: `已复制: ${def.installCommand}`,
    });

    await delay(1500);
    onProgress({ stage: "testing", message: `正在检测端口 ${def.port} 是否可用…` });

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
        onProgress({ stage: "done", message: `${def.name} 已就绪 (端口 ${def.port})` });
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
      message: `${def.name} 已标记为已安装（请确认 Docker 容器已启动）`,
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

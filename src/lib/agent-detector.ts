// Agent Auto-Detection - detects locally installed AI agents
// Inspired by AionUi's ACP protocol architecture

export interface DetectedAgent {
  id: string;
  name: string;
  backend: string;
  description: string;
  icon: string;
  binary: string;
  available: boolean;
  version?: string;
  configPath?: string;
  installCommand?: string;
}

// Registry of known agents and their detection patterns
const AGENT_REGISTRY: Omit<DetectedAgent, 'available' | 'version'>[] = [
  { id: 'claude', name: 'Claude Code', backend: 'claude', description: 'Anthropic Claude Code CLI', icon: '🟣', binary: 'claude', installCommand: 'npm install -g @anthropic-ai/claude-code' },
  { id: 'codex', name: 'Codex CLI', backend: 'codex', description: 'OpenAI Codex CLI', icon: '🟢', binary: 'codex', installCommand: 'npm install -g @openai/codex' },
  { id: 'gemini', name: 'Gemini CLI', backend: 'gemini', description: 'Google Gemini CLI', icon: '🔵', binary: 'gemini', installCommand: 'npm install -g @google/gemini-cli' },
  { id: 'qwen', name: 'Qwen CLI', backend: 'qwen', description: 'Alibaba Qwen CLI', icon: '🟠', binary: 'qwen', installCommand: 'pip install qwen-cli' },
  { id: 'opencode', name: 'OpenCode', backend: 'opencode', description: 'Open source coding agent', icon: '⚡', binary: 'opencode', installCommand: 'go install github.com/opencode-ai/opencode@latest' },
  { id: 'hermes', name: 'Hermes Agent', backend: 'hermes', description: 'Nous Research Hermes Agent', icon: '🏛️', binary: 'hermes', installCommand: 'pip install hermes-agent' },
  { id: 'mimo', name: 'MiMo Code', backend: 'mimo', description: 'Xiaomi MiMo Code CLI', icon: '📱', binary: 'mimo', installCommand: 'npm install -g @anthropic-ai/claude-code' },
  { id: 'cursor', name: 'Cursor Agent', backend: 'cursor', description: 'Cursor AI coding agent', icon: '▶️', binary: 'cursor', installCommand: 'https://cursor.sh' },
  { id: 'copilot', name: 'GitHub Copilot', backend: 'copilot', description: 'GitHub Copilot CLI', icon: '🐙', binary: 'gh', configPath: '~/.config/github-copilot/', installCommand: 'gh extension install github/gh-copilot' },
  { id: 'deepseek', name: 'DeepSeek CLI', backend: 'deepseek', description: 'DeepSeek AI CLI', icon: '🐋', binary: 'deepseek', installCommand: 'pip install deepseek-cli' },
  { id: 'aider', name: 'Aider', backend: 'aider', description: 'AI pair programming in your terminal', icon: '🤝', binary: 'aider', installCommand: 'pip install aider-chat' },
  { id: 'continue', name: 'Continue', backend: 'continue', description: 'Continue dev - open source AI code assistant', icon: '🔄', binary: 'continue', installCommand: 'https://continue.dev' },
  { id: 'windsurf', name: 'Windsurf', backend: 'windsurf', description: 'Windsurf AI coding agent', icon: '🏄', binary: 'windsurf', installCommand: 'https://windsurf.ai' },
  { id: 'cline', name: 'Cline', backend: 'cline', description: 'Cline AI coding assistant', icon: '🔧', binary: 'cline', installCommand: 'VS Code extension' },
  { id: 'roo', name: 'Roo Code', backend: 'roo', description: 'Roo Code AI assistant', icon: '🦘', binary: 'roo', installCommand: 'VS Code extension' },
  { id: 'kilo', name: 'Kilo Code', backend: 'kilo', description: 'Kilo Code AI assistant', icon: '⚡', binary: 'kilo', installCommand: 'VS Code extension' },
  { id: 'kiro', name: 'Kiro', backend: 'kiro', description: 'AWS Kiro AI IDE', icon: '🎯', binary: 'kiro', installCommand: 'https://kiro.dev' },
  { id: 'amazon-q', name: 'Amazon Q', backend: 'amazon-q', description: 'Amazon Q Developer CLI', icon: '☁️', binary: 'q', installCommand: 'https://aws.amazon.com/q/developer/' },
  { id: 'tabby', name: 'Tabby', backend: 'tabby', description: 'Tabby AI coding assistant', icon: '📋', binary: 'tabby', installCommand: 'https://tabby.tabbyml.com' },
  { id: 'devin', name: 'Devin', backend: 'devin', description: 'Devin AI software engineer', icon: '🤖', binary: 'devin', installCommand: 'https://devin.ai' },
];

// Detect if a binary exists on the system
async function detectBinary(binary: string): Promise<{ exists: boolean; version?: string }> {
  try {
    const res = await fetch('/api/agent/detect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ binary }),
    });
    if (res.ok) {
      return await res.json();
    }
  } catch {}
  return { exists: false };
}

// Detect all agents
export async function detectAllAgents(): Promise<DetectedAgent[]> {
  const results: DetectedAgent[] = [];

  for (const agent of AGENT_REGISTRY) {
    const detection = await detectBinary(agent.binary);
    results.push({
      ...agent,
      available: detection.exists,
      version: detection.version,
    });
  }

  return results;
}

// Get agent by ID
export function getAgentById(id: string): Omit<DetectedAgent, 'available' | 'version'> | undefined {
  return AGENT_REGISTRY.find(a => a.id === id);
}

// Get all registered agent IDs
export function getAllAgentIds(): string[] {
  return AGENT_REGISTRY.map(a => a.id);
}

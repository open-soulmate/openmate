"""A2A Protocol Client for OpenMate."""

export interface AgentSkill {
  id: string;
  name: string;
  description: string;
  tags: string[];
  examples: string[];
}

export interface AgentCapabilities {
  streaming: boolean;
  pushNotifications: boolean;
  stateTransitionHistory: boolean;
}

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  protocolVersion: string;
  capabilities: AgentCapabilities;
  skills: AgentSkill[];
  defaultInputModes: string[];
  defaultOutputModes: string[];
}

export interface Message {
  role: 'user' | 'agent';
  parts: { type: string; text?: string; [key: string]: unknown }[];
  messageId?: string;
  taskId?: string;
  contextId?: string;
}

export interface TaskStatus {
  state: 'submitted' | 'working' | 'input-required' | 'completed' | 'failed' | 'canceled';
  message?: Message;
  timestamp?: string;
}

export interface Task {
  id: string;
  contextId: string;
  status: TaskStatus;
  artifacts: unknown[];
  history: Message[];
  metadata: Record<string, unknown>;
}

export interface JSONRPCResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}


export class A2AClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /** Discover agent card */
  async getAgentCard(): Promise<AgentCard> {
    const res = await fetch(`${this.baseUrl}/.well-known/agent.json`);
    if (!res.ok) throw new Error(`Failed to get agent card: ${res.status}`);
    return res.json();
  }

  /** Send a task (create or continue) */
  async sendTask(message: Message, taskId?: string): Promise<Task> {
    const params: Record<string, unknown> = { message };
    if (taskId) params.id = taskId;

    const result = await this.rpc('tasks/send', params);
    return result as Task;
  }

  /** Get task status */
  async getTask(taskId: string): Promise<Task> {
    const result = await this.rpc('tasks/get', { id: taskId });
    return result as Task;
  }

  /** Cancel a task */
  async cancelTask(taskId: string): Promise<Task> {
    const result = await this.rpc('tasks/cancel', { id: taskId });
    return result as Task;
  }

  /** Send text message and get response */
  async chat(text: string, taskId?: string): Promise<Task> {
    const message: Message = {
      role: 'user',
      parts: [{ type: 'text', text }],
    };
    return this.sendTask(message, taskId);
  }

  /** JSON-RPC 2.0 call */
  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const body = {
      jsonrpc: '2.0',
      id: Date.now().toString(),
      method,
      params,
    };

    const res = await fetch(`${this.baseUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`A2A RPC failed: ${res.status}`);

    const data: JSONRPCResponse = await res.json();
    if (data.error) {
      throw new Error(`A2A Error ${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  }
}

/** Default client pointing to OpenSoul */
export const a2aClient = new A2AClient(
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8090'
);

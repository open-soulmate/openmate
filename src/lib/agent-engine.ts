import { executeCommand, readFile, writeFile, listDir } from "./tauri-bridge";

export interface AgentMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolResult {
  tool: string;
  success: boolean;
  output: string;
}

function parseIntent(msg: string): { tool: string; args: Record<string, string> } | null {
  const lower = msg.toLowerCase().trim();

  const shellMatch = lower.match(/^(run|execute|exec|shell|命令)\s+(.+)/i)
    || lower.match(/^>\s*(.+)/);
  if (shellMatch) {
    const cmd = shellMatch[2] || shellMatch[1];
    return { tool: "shell", args: { cmd: msg.replace(/^(run|execute|exec|shell|命令)\s+/i, "").replace(/^>\s*/, "") } };
  }

  const readMatch = lower.match(/^(read|cat|读取|查看)\s+(.+)/i);
  if (readMatch) {
    return { tool: "read_file", args: { path: readMatch[2].trim() } };
  }

  const writeMatch = lower.match(/^(write|save|写入|保存)\s+(\S+)\s+([\s\S]+)/i);
  if (writeMatch) {
    return { tool: "write_file", args: { path: writeMatch[2].trim(), content: writeMatch[3].trim() } };
  }

  const listMatch = lower.match(/^(ls|list|dir|列出|目录)\s*(.*)/i);
  if (listMatch) {
    return { tool: "list_dir", args: { path: listMatch[2].trim() || "." } };
  }

  return null;
}

export class AgentEngine {
  private history: AgentMessage[] = [];

  async processMessage(msg: string): Promise<ToolResult> {
    this.history.push({ role: "user", content: msg });

    const intent = parseIntent(msg);
    if (!intent) {
      return {
        tool: "none",
        success: true,
        output: "Available commands:\n  > <shell command> - execute shell\n  read <path> - read file\n  write <path> <content> - write file\n  ls [path] - list directory",
      };
    }

    let result: ToolResult;

    try {
      switch (intent.tool) {
        case "shell": {
          const output = await executeCommand(intent.args.cmd);
          result = { tool: "shell", success: true, output };
          break;
        }
        case "read_file": {
          const content = await readFile(intent.args.path);
          result = { tool: "read_file", success: true, output: content };
          break;
        }
        case "write_file": {
          await writeFile(intent.args.path, intent.args.content);
          result = { tool: "write_file", success: true, output: `Written to ${intent.args.path}` };
          break;
        }
        case "list_dir": {
          const entries = await listDir(intent.args.path);
          result = { tool: "list_dir", success: true, output: entries.join("\n") };
          break;
        }
        default:
          result = { tool: "unknown", success: false, output: `Unknown tool: ${intent.tool}` };
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      result = { tool: intent.tool, success: false, output: msg };
    }

    this.history.push({ role: "assistant", content: result.output });
    return result;
  }

  getHistory(): AgentMessage[] {
    return [...this.history];
  }

  clearHistory(): void {
    this.history = [];
  }
}

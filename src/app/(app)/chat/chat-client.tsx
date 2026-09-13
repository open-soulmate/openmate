'use client';
import { MarkdownContent } from "@/components/markdown-content";
import { MultiFileDiff, type FileChange } from "@/components/multi-file-diff";
import { TaskChoiceMenu, type ChoiceOption } from "@/components/task-choice-menu";
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAppStore } from '@/stores/app-store';
import { Send, Bot, User, Loader2, Paperclip, X, Wifi, WifiOff, FileText, Image as ImageIcon, Info, ChevronDown, Plus, Bookmark, RotateCcw, Zap, Brain, PanelLeft, Copy, ThumbsUp, ThumbsDown, Share2, RefreshCw, MoreHorizontal, Volume2, MessageSquare, FolderOpen } from "lucide-react";
import { ChatViewToggle } from "@opensoulmate/openface";
import { ContextRing } from "@/components/context-ring";
import { getApiBaseUrl, getToken, getUserId } from '@/lib/api-client';
import { copyToClipboard } from '@/lib/clipboard';
import { Dialog } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { useSidebar } from '@/components/ui/sidebar';
import { useTranslation } from 'react-i18next';
import { SmartPrompt } from '@/components/smart-prompt';
import { AcpApprovalModal, type AcpApprovalRequest } from '@/components/acp-approval-modal';

// --- Helper Functions ---
const getApiUrl = () => getApiBaseUrl();
const getWsUrl = () => getApiUrl().replace('http', 'ws');

// Tag a session with its owning agent via OpenSoul API
// This persists server-side, works across devices/browsers
async function tagSessionAgent(sessionId: string, agentId: string): Promise<void> {
  try {
    await fetch(`${getApiUrl()}/api/sessions/${sessionId}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag_name: `agent:${agentId}` }),
    });
  } catch (e) {
    console.warn('[session-tag] Failed to tag session:', e);
  }
}

/**
 * Gets the base URL for the ACP Proxy service.
 * Assumes it runs on the same hostname but a different port (8092).
 */
const getAcpProxyUrl = (): string => {
  // NOTE: Port 8092 is the expected default for the ACP Proxy.
  // This should ideally come from an environment variable or config.
  return `http://${window.location.hostname}:8092`;
};

/**
 * Gets the WebSocket URL for the ACP Proxy service.
 */
const getAcpWsUrl = (): string => {
  return getAcpProxyUrl().replace('http', 'ws');
};

// --- Type Definitions ---
interface MessagePart {
  type: string;
  text?: string;
  data?: string;
  name?: string;
  mime_type?: string;
  url?: string;
  choices?: ChoiceOption[];
}

interface TokenUsage {
  input: number;
  output: number;
}

/** 思考过程块 —— 用于存储 Agent 推理链/内心独白的流式文本 */
interface ThinkingBlock {
  id: string;        // 唯一标识（使用时间戳 + 随机后缀）
  text: string;      // 累积的思考文本内容
  isComplete: boolean; // 是否已完成接收（false = 仍在流式接收中）
}

/** 工具调用信息 —— 记录 Agent 调用外部工具的完整生命周期 */
interface ToolCallInfo {
  toolCallId: string;   // 唯一标识（来自 ACP 协议的 toolCallId）
  toolName: string;     // 工具名称（如 web_search、read_file）
  serverName?: string;  // MCP 服务器名称（可选）
  state: 'running' | 'completed' | 'failed'; // 工具调用状态
  args?: string;        // 调用参数（JSON 字符串）
  content?: string;     // 调用结果内容
}

interface Checkpoint {
  id: string;
  messageId: string;
  timestamp: Date;
  messages: Message[];
  label: string;
}

type Agent = {
  id: string;
  name: string;
  description?: string;
  avatar?: string;
  systemPrompt?: string;
};

// --- Main Component ---
export function ChatClient({ sessionId, initialMessages }: { sessionId: string; initialMessages?: Message[] }) {
  // 1. State Initialization
  const [messages, setMessages] = useState<Message[]>(initialMessages || []);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isAcpConnected, setIsAcpConnected] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [showAgentSelector, setShowAgentSelector] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [thinkingBlocks, setThinkingBlocks] = useState<ThinkingBlock[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [pendingApproval, setPendingApproval] = useState<AcpApprovalRequest | null>(null);
  const [filePreviews, setFilePreviews] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { toggleSidebar } = useSidebar();
  const appStore = useAppStore();

  // Memoized values
  const currentToken = useMemo(() => getToken(), []);
  const currentUserId = useMemo(() => getUserId(), []);

  // 2. Effects (Side Effects & WebSocket Management)

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

const getAcpProxyUrl = () => {
  // ACP Proxy runs on port 8092, same hostname
  return `http://${window.location.hostname}:8092`;
};
const getAcpWsUrl = () => getAcpProxyUrl().replace('http', 'ws');

interface MessagePart { type: string; text?: string; data?: string; name?: string; mime_type?: string; url?: string; choices?: ChoiceOption[]; }
interface TokenUsage { input: number; output: number; }

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

interface Checkpoint { id: string; messageId: string; timestamp: Date; messages: Message[]; label: string; }
type AgentStatus = 'idle' | 'thinking' | 'tool_calling' | 'error';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: MessagePart[];
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
  tokenUsage?: TokenUsage;
  agentStatus?: AgentStatus;
  sessionId?: string;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function ChatClient() {
  const { t } = useTranslation();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    addSession,
    updateSession,
    addMessageToSession,
    getActiveSession,
    globalLoading,
    setGlobalLoading,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveRequest, setApproveRequest] = useState<AcpApprovalRequest | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionAttemptRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const isMobile = useIsMobile();
  const { open: sidebarOpen } = useSidebar();

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const messages = useMemo(() => {
    return activeSession?.messages || [];
  }, [activeSession]);

  // 管理组件生命周期状态
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      // 只重置组件内部临时状态，不清理全局会话状态
      setLoading(false);
      setLocalLoading(false);
      setIsTyping(false);
      setConnectionStatus('disconnected');
      connectionAttemptRef.current = false;
      
      // 关闭WebSocket连接
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnection(null);
      }
    };
  }, []);

  // WebSocket连接管理
  const connectSession = useCallback(async (sessionId: string): Promise<WebSocket | null> => {
    if (!sessionId || connectionAttemptRef.current) return null;
    
    connectionAttemptRef.current = true;
    setConnectionStatus('connecting');
    setLocalLoading(true);
    
    try {
      const wsUrl = `${getWsUrl()}/ws/chat/${sessionId}?token=${getToken()}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        
        console.log('[WebSocket] Connected to session:', sessionId);
        setConnectionStatus('connected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
        
        wsRef.current = ws;
        setWsConnection(ws);
      };
      
      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message, sessionId);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };
      
      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
        
        if (wsRef.current === ws) {
          wsRef.current = null;
          setWsConnection(null);
        }
      };
      
      ws.onerror = (error) => {
        if (!isMountedRef.current) return;
        
        console.error('[WebSocket] Error:', error);
        setConnectionStatus('disconnected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
      };
      
      return ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setConnectionStatus('disconnected');
      setLocalLoading(false);
      connectionAttemptRef.current = false;
      return null;
    }
  }, []);

  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback((message: WebSocketMessage, sessionId: string) => {
    switch (message.type) {
      case 'text_delta':
        // 处理文本增量
        break;
      case 'thinking_delta':
        // 处理思考增量
        break;
      case 'tool_call_update':
        // 处理工具调用更新
        break;
      case 'agent_status':
        // 处理代理状态更新
        break;
      case 'error':
        // 处理错误
        break;
      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }, []);

  // 修正后的onSend函数 - 确保通过connectSession管理的连接发送
  const onSend = useCallback(async (message: string, sessionId?: string) => {
    const targetSessionId = sessionId || activeSessionId;
    if (!targetSessionId || !message.trim() || loading || localLoading) return;

    // 确保有活跃的会话
    let currentSession = sessions.find(s => s.id === targetSessionId);
    if (!currentSession) {
      // 如果会话不存在，创建一个新会话
      const newSessionId = await addSession();
      if (!newSessionId) return;
      setActiveSessionId(newSessionId);
      targetSessionId = newSessionId;
      currentSession = sessions.find(s => s.id === newSessionId);
    }

    // 设置加载状态
    setLoading(true);
    setLocalLoading(true);
    setIsTyping(true);

    // 添加用户消息到会话
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      parts: [{ type: 'text', text: message }],
      timestamp: new Date(),
      sessionId: targetSessionId,
    };

    addMessageToSession(targetSessionId, userMessage);
    setInput('');

    try {
      // 确保WebSocket连接已建立
      let ws = wsRef.current;
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // 如果没有连接或连接已关闭，重新建立连接
        ws = await connectSession(targetSessionId);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('Failed to establish WebSocket connection');
        }
      }

      // 通过已建立的连接发送消息
      const wsMessage = {
        type: 'user_message',
        content: message,
        parts: [{ type: 'text', text: message }],
        sessionId: targetSessionId,
        timestamp: new Date().toISOString(),
      };

      ws.send(JSON.stringify(wsMessage));
      console.log('[Chat] Message sent via WebSocket:', message);

    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      
      // 添加错误消息到会话
      const errorMessage: Message = {
        id: `msg-error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to send message. Please try again.',
        parts: [{ type: 'text', text: 'Failed to send message. Please try again.' }],
        timestamp: new Date(),
        sessionId: targetSessionId,
        agentStatus: 'error',
      };
      
      addMessageToSession(targetSessionId, errorMessage);
    } finally {
      // 确保在成功或失败时都重置加载状态
      setLoading(false);
      setLocalLoading```typescript
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

const getAcpProxyUrl = () => {
  // ACP Proxy runs on port 8092, same hostname
  return `http://${window.location.hostname}:8092`;
};
const getAcpWsUrl = () => getAcpProxyUrl().replace('http', 'ws');

interface MessagePart { type: string; text?: string; data?: string; name?: string; mime_type?: string; url?: string; choices?: ChoiceOption[]; }
interface TokenUsage { input: number; output: number; }

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

interface Checkpoint { id: string; messageId: string; timestamp: Date; messages: Message[]; label: string; }
type AgentStatus = 'idle' | 'thinking' | 'tool_calling' | 'error';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts: MessagePart[];
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
  timestamp: Date;
  tokenUsage?: TokenUsage;
  agentStatus?: AgentStatus;
  sessionId?: string;
}

interface WebSocketMessage {
  type: string;
  [key: string]: any;
}

export function ChatClient() {
  const { t } = useTranslation();
  const {
    sessions,
    activeSessionId,
    setActiveSessionId,
    addSession,
    updateSession,
    addMessageToSession,
    getActiveSession,
    globalLoading,
    setGlobalLoading,
  } = useAppStore();

  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [wsConnection, setWsConnection] = useState<WebSocket | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [approveRequest, setApproveRequest] = useState<AcpApprovalRequest | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const connectionAttemptRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  const isMobile = useIsMobile();
  const { open: sidebarOpen } = useSidebar();

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === activeSessionId) || null;
  }, [sessions, activeSessionId]);

  const messages = useMemo(() => {
    return activeSession?.messages || [];
  }, [activeSession]);

  // 管理组件生命周期状态
  useEffect(() => {
    isMountedRef.current = true;
    
    return () => {
      isMountedRef.current = false;
      // 只重置组件内部临时状态，不清理全局会话状态
      setLoading(false);
      setLocalLoading(false);
      setIsTyping(false);
      setConnectionStatus('disconnected');
      connectionAttemptRef.current = false;
      
      // 关闭WebSocket连接
      if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
        wsRef.current.close();
        wsRef.current = null;
        setWsConnection(null);
      }
    };
  }, []);

  // WebSocket连接管理
  const connectSession = useCallback(async (sessionId: string): Promise<WebSocket | null> => {
    if (!sessionId || connectionAttemptRef.current) return null;
    
    connectionAttemptRef.current = true;
    setConnectionStatus('connecting');
    setLocalLoading(true);
    
    try {
      const wsUrl = `${getWsUrl()}/ws/chat/${sessionId}?token=${getToken()}`;
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        
        console.log('[WebSocket] Connected to session:', sessionId);
        setConnectionStatus('connected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
        
        wsRef.current = ws;
        setWsConnection(ws);
      };
      
      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          handleWebSocketMessage(message, sessionId);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
        }
      };
      
      ws.onclose = (event) => {
        if (!isMountedRef.current) return;
        
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
        
        if (wsRef.current === ws) {
          wsRef.current = null;
          setWsConnection(null);
        }
      };
      
      ws.onerror = (error) => {
        if (!isMountedRef.current) return;
        
        console.error('[WebSocket] Error:', error);
        setConnectionStatus('disconnected');
        setLocalLoading(false);
        connectionAttemptRef.current = false;
      };
      
      return ws;
    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setConnectionStatus('disconnected');
      setLocalLoading(false);
      connectionAttemptRef.current = false;
      return null;
    }
  }, []);

  // 处理WebSocket消息
  const handleWebSocketMessage = useCallback((message: WebSocketMessage, sessionId: string) => {
    switch (message.type) {
      case 'text_delta':
        // 处理文本增量
        break;
      case 'thinking_delta':
        // 处理思考增量
        break;
      case 'tool_call_update':
        // 处理工具调用更新
        break;
      case 'agent_status':
        // 处理代理状态更新
        break;
      case 'error':
        // 处理错误
        break;
      default:
        console.log('[WebSocket] Unknown message type:', message.type);
    }
  }, []);

  // 修正后的onSend函数 - 确保通过connectSession管理的连接发送
  const onSend = useCallback(async (message: string, sessionId?: string) => {
    const targetSessionId = sessionId || activeSessionId;
    if (!targetSessionId || !message.trim() || loading || localLoading) return;

    // 确保有活跃的会话
    let currentSession = sessions.find(s => s.id === targetSessionId);
    if (!currentSession) {
      // 如果会话不存在，创建一个新会话
      const newSessionId = await addSession();
      if (!newSessionId) return;
      setActiveSessionId(newSessionId);
      targetSessionId = newSessionId;
      currentSession = sessions.find(s => s.id === newSessionId);
    }

    // 设置加载状态
    setLoading(true);
    setLocalLoading(true);
    setIsTyping(true);

    // 添加用户消息到会话
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message,
      parts: [{ type: 'text', text: message }],
      timestamp: new Date(),
      sessionId: targetSessionId,
    };

    addMessageToSession(targetSessionId, userMessage);
    setInput('');

    try {
      // 确保WebSocket连接已建立
      let ws = wsRef.current;
      
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // 如果没有连接或连接已关闭，重新建立连接
        ws = await connectSession(targetSessionId);
        
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error('Failed to establish WebSocket connection');
        }
      }

      // 通过已建立的连接发送消息
      const wsMessage = {
        type: 'user_message',
        content: message,
        parts: [{ type: 'text', text: message }],
        sessionId: targetSessionId,
        timestamp: new Date().toISOString(),
      };

      ws.send(JSON.stringify(wsMessage));
      console.log('[Chat] Message sent via WebSocket:', message);

    } catch (error) {
      console.error('[Chat] Failed to send message:', error);
      
      // 添加错误消息到会话
      const errorMessage: Message = {
        id: `msg-error-${Date.now()}`,
        role: 'assistant',
        content: 'Failed to send message. Please try again.',
        parts: [{ type: 'text', text: 'Failed to send message. Please try again.' }],
        timestamp: new Date(),
        sessionId: targetSessionId,
        agentStatus: 'error',
      };
      
      addMessageToSession(targetSessionId, errorMessage);
    } finally {
      // 确保在成功或失败时都重置加载状态
      setLoading(false);
      setLocal```typescript
      setLoading(false);
      setLocalLoading(false);
      setIsTyping(false);
    }
  }, [activeSessionId, sessions, loading, localLoading, addSession, setActiveSessionId, addMessageToSession, connectSession]);

  // 处理Acp审批请求
  const handleAcpApproval = useCallback(async (approved: boolean) => {
    if (!approveRequest) return;
    
    try {
      const response = await fetch(`${getAcpProxyUrl()}/api/approval/${approveRequest.requestId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      
      if (!response.ok) {
        console.error('[ACP] Approval request failed:', response.statusText);
      }
    } catch (error) {
      console.error('[ACP] Approval request error:', error);
    } finally {
      setShowApproveModal(false);
      setApproveRequest(null);
    }
  }, [approveRequest]);

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 处理键盘事件
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend(input);
    }
  }, [input, onSend]);

  // 渲染消息部分
  const renderMessagePart = useCallback((part: MessagePart, index: number) => {
    switch (part.type) {
      case 'text':
        return <MarkdownContent key={index} content={part.text || ''} />;
      case 'image':
        return (
          <div key={index} className="my-2">
            <img src={part.url} alt={part.name || 'Image'} className="max-w-full rounded-lg" />
          </div>
        );
      case 'file':
        return (
          <div key={index} className="my-2 p-3 bg-muted rounded-lg flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="text-sm">{part.name}</span>
          </div>
        );
      case 'choices':
        return part.choices ? <TaskChoiceMenu key={index} choices={part.choices} /> : null;
      default:
        return null;
    }
  }, []);

  // 渲染思考块
  const renderThinkingBlock = useCallback((block: ThinkingBlock) => {
    return (
      <div key={block.id} className="my-2 p-3 bg-muted/50 rounded-lg border border-muted">
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {block.isComplete ? t('thinking_complete') : t('thinking')}
          </span>
          {!block.isComplete && <Loader2 className="h-3 w-3 animate-spin" />}
        </div>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{block.text}</p>
      </div>
    );
  }, [t]);

  // 渲染工具调用信息
  const renderToolCall = useCallback((toolCall: ToolCallInfo) => {
    const stateIcon = {
      running: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
      completed: <Zap className="h-4 w-4 text-green-500" />,
      failed: <X className="h-4 w-4 text-red-500" />,
    };

    return (
      <div key={toolCall.toolCallId} className="my-2 p-3 bg-muted/50 rounded-lg border border-muted">
        <div className="flex items-center gap-2">
          {stateIcon[toolCall.state]}
          <span className="text-sm font-medium">{toolCall.toolName}</span>
          {toolCall.serverName && (
            <span className="text-xs text-muted-foreground">({toolCall.serverName})</span>
          )}
        </div>
        {toolCall.content && (
          <p className="mt-2 text-sm text-muted-foreground">{toolCall.content}</p>
        )}
      </div>
    );
  }, []);

  // 渲染单条消息
  const renderMessage = useCallback((message: Message) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    return (
      <div
        key={message.id}
        className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${isSystem ? 'justify-center' : ''}`}
      >
        {!isSystem && (
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isUser ? 'bg-primary' : 'bg-muted'
          }`}>
            {isUser ? <User className="h-4 w-4 text-primary-foreground" /> : <Bot className="h-4 w-4" />}
          </div>
        )}
        
        <div className={`flex flex-col gap-1 max-w-[80%] ${isUser ? 'items-end' : ''}`}>
          {message.thinkingBlocks?.map(renderThinkingBlock)}
          {message.toolCalls?.map(renderToolCall)}
          
          <div className={`rounded-lg p-3 ${
            isUser 
              ? 'bg-primary text-primary-foreground' 
              : isSystem 
                ? 'bg-muted/50 text-center' 
                : 'bg-muted'
          }`}>
            {message.parts.map((part, index) => renderMessagePart(part, index))}
          </div>
          
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{message.timestamp.toLocaleTimeString()}</span>
            {message.tokenUsage && (
              <span>{message.tokenUsage.input + message.tokenUsage.output} tokens</span>
            )}
          </div>
        </div>
      </div>
    );
  }, [renderThinkingBlock, renderToolCall, renderMessagePart]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button onClick={() => setShowSidebar(true)} className="p-2 hover:bg-muted rounded-lg">
              <PanelLeft className="h-5 w-5" />
            </button>
          )}
          <h1 className="text-lg font-semibold">{t('chat')}</h1>
          <div className="flex items-center gap-1">
            {connectionStatus === 'connected' ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : connectionStatus === 'connecting' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-xs text-muted-foreground">
              {t(`connection_${connectionStatus}`)}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => addSession()}
            className="p-2 hover:bg-muted rounded-lg"
            title={t('new_chat')}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Bot className="h-12 w-12 mb-4 text-muted-foreground" />
            <h2 className="text-lg font-semibold mb-2">{t('welcome_title')}</h2>
            <p className="text-muted-foreground max-w-md">{t('welcome_description')}</p>
          </div>
        ) : (
          messages.map(renderMessage)
        )}
        
        {(loading || localLoading) && (
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
            <div className="rounded-lg p-3 bg-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-4">
        <div className="flex items-end gap-2">
          <ContextRing sessionId={activeSessionId || ''}>
            <SmartPrompt
              ref={inputRef}
              value={input}
              onChange={setInput}
              onKeyDown={handleKeyDown}
              placeholder={t('type_message')}
              className="flex-1 min-h-[40px] max-h-[120px]"
              disabled={loading || localLoading}
            />
          </ContextRing>
          
          <button
            onClick={() => onSend(input)}
            disabled={!input.trim() || loading || localLoading}
            className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading || localLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Sidebar */}
      {isMobile && (
        <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
          <SheetContent side="left" className="w-[300px]">
            <SheetHeader>
              <SheetTitle>{t('sessions')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    setShowSidebar(false);
                  }}
                  className={`w-full p-3 text-left rounded-lg hover:bg-muted ${
                    session.id === activeSessionId ? 'bg-muted' : ''
                  }`}
                >
                  <div className="font-medium truncate">{session.title || t('untitled')}</div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* ACP Approval Modal */}
      <AcpApprovalModal
        open={showApproveModal}
        onOpenChange={setShowApproveModal}
        request={approveRequest}
        onApprove={() => handleAcpApproval(true)}
        onDeny={() => handleAcpApproval(false)}
      />
    </div>
  );
}
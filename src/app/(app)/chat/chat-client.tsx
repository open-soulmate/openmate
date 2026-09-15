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
type Agent = {
  id: string;
  name: string;
  avatar?: string;
  description?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
  tools?: string[];
  mcpServers?: string[];
};

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: MessagePart[];
  timestamp: Date;
  tokenUsage?: TokenUsage;
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
  status?: 'sending' | 'sent' | 'error';
  error?: string;
  attachments?: Array<{
    id: string;
    name: string;
    type: string;
    url: string;
    size?: number;
  }>;
  choices?: Array<{
    id: string;
    label: string;
    value: string;
    selected?: boolean;
  }>;
  // Agent-specific fields
  agentId?: string;
  agentName?: string;
  agentAvatar?: string;
}

export function ChatClient() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  
  // Global state from store
  const { 
    currentSession, 
    addMessage, 
    updateMessage,
    setCurrentSession,
    sessions,
    setSessions,
    agents,
    setAgents,
    setCurrentAgent,
    currentAgent,
    globalWebSocket,
    setGlobalWebSocket,
    addGlobalMessage,
    updateGlobalMessage,
    globalMessages,
    setGlobalMessages,
    isGlobalConnected,
    setIsGlobalConnected,
    globalError,
    setGlobalError,
    globalReconnectAttempts,
    setGlobalReconnectAttempts,
    resetGlobalConnection,
  } = useAppStore();
  
  // Local state - simplified to avoid conflict with global state
  const [inputText, setInputText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const [currentThinking, setCurrentThinking] = useState('');
  const [showToolCalls, setShowToolCalls] = useState(false);
  const [currentToolCalls, setCurrentToolCalls] = useState<ToolCallInfo[]>([]);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);
  const [approvalModal, setApprovalModal] = useState<AcpApprovalRequest | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'reconnecting'>('connecting');
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [lastConnectionError, setLastConnectionError] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Messages array - use global messages when in global mode, otherwise local
  const messages = useMemo(() => {
    if (currentSession?.isGlobal) {
      return globalMessages;
    }
    return currentSession?.messages || [];
  }, [currentSession, globalMessages]);
  
  // Reset chat state when session changes
  useEffect(() => {
    if (currentSession) {
      setInputText('');
      setSelectedFiles([]);
      setIsStreaming(false);
      setCurrentThinking('');
      setCurrentToolCalls([]);```tsx
        setCheckpoints([]);
        setSelectedMessageId(null);
      }
    }
  }, [currentSession]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, autoScroll]);

  // WebSocket connection management
  const connectWebSocket = useCallback((sessionId: string, isGlobal: boolean = false) => {
    const wsUrl = isGlobal ? getWsUrl() : getWsUrl();
    const token = getToken();
    const userId = getUserId();
    
    if (!token || !userId) {
      console.error('Missing authentication token or user ID');
      return;
    }

    const url = `${wsUrl}/ws/chat/${sessionId}?token=${token}&user_id=${userId}`;
    
    const ws = new WebSocket(url);
    
    ws.onopen = () => {
      console.log(`WebSocket connected for session: ${sessionId}`);
      if (isGlobal) {
        setIsGlobalConnected(true);
        setGlobalError(null);
      } else {
        setIsConnected(true);
        setConnectionStatus('connected');
        setLastConnectionError(null);
      }
      setReconnectAttempts(0);
      if (isGlobal) setGlobalReconnectAttempts(0);
      
      // Start ping interval
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data, isGlobal);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };
    
    ws.onclose = (event) => {
      console.log(`WebSocket closed for session ${sessionId}:`, event.code, event.reason);
      if (isGlobal) {
        setIsGlobalConnected(false);
        setGlobalError('Connection closed');
      } else {
        setIsConnected(false);
        setConnectionStatus('disconnected');
        setLastConnectionError('Connection closed');
      }
      
      // Clear ping interval
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      // Attempt to reconnect if not intentionally closed
      if (event.code !== 1000) {
        const attempts = isGlobal ? globalReconnectAttempts : reconnectAttempts;
        const maxAttempts = 5;
        
        if (attempts < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
          if (isGlobal) {
            setGlobalReconnectAttempts(attempts + 1);
          } else {
            setReconnectAttempts(attempts + 1);
            setConnectionStatus('reconnecting');
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket(sessionId, isGlobal);
          }, delay);
        } else {
          const errorMsg = `Failed to reconnect after ${maxAttempts} attempts`;
          if (isGlobal) {
            setGlobalError(errorMsg);
          } else {
            setLastConnectionError(errorMsg);
          }
        }
      }
    };
    
    ws.onerror = (error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
      const errorMsg = 'WebSocket connection error';
      if (isGlobal) {
        setGlobalError(errorMsg);
      } else {
        setLastConnectionError(errorMsg);
      }
    };
    
    // Store WebSocket reference
    if (isGlobal) {
      setGlobalWebSocket(ws);
    } else {
      wsRef.current = ws;
    }
    
    return ws;
  }, [reconnectAttempts, globalReconnectAttempts, setGlobalWebSocket, setIsGlobalConnected, setGlobalError, setGlobalReconnectAttempts]);

  // Connect/disconnect WebSocket when session changes
  useEffect(() => {
    if (!currentSession) return;
    
    const isGlobal = currentSession.isGlobal;
    const ws = connectWebSocket(currentSession.id, isGlobal);
    
    return () => {
      // Cleanup on unmount or session change
      if (ws) {
        ws.close(1000, 'Session changed');
      }
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      if (isGlobal) {
        setGlobalWebSocket(null);
        setIsGlobalConnected(false);
      } else {
        wsRef.current = null;
        setIsConnected(false);
        setConnectionStatus('disconnected');
      }
    };
  }, [currentSession?.id, currentSession?.isGlobal, connectWebSocket]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((data: any, isGlobal: boolean) => {
    switch (data.type) {
      case 'chat_response':
        handleChatResponse(data, isGlobal);
        break;
      case 'chat_error':
        handleChatError(data, isGlobal);
        break;
      case 'thinking_chunk':
        handleThinkingChunk(data);
        break;
      case 'thinking_complete':
        handleThinkingComplete(data);
        break;
      case 'tool_call':
        handleToolCall(data);
        break;
      case 'tool_result':
        handleToolResult(data);
        break;
      case 'tool_error':
        handleToolError(data);
        break;
      case 'choice_request':
        handleChoiceRequest(data, isGlobal);
        break;
      case 'acp_approval_request':
        handleAcpApprovalRequest(data);
        break;
      case 'pong':
        // Ping response received, connection is alive
        break;
      default:
        console.warn('Unknown WebSocket message type:', data.type);
    }
  }, []);

  const handleChatResponse = (data: any, isGlobal: boolean) => {
    const message: Message = {
      id: data.message_id || Date.now().toString(),
      role: 'assistant',
      content: [{ type: 'text', text: data.text || '' }],
      timestamp: new Date(),
      tokenUsage: data.token_usage ? {
        input: data.token_usage.input_tokens || 0,
        output: data.token_usage.output_tokens || 0
      } : undefined,
      thinkingBlocks: data.thinking_blocks ? data.thinking_blocks.map((block: any) => ({
        id: block.id || `thinking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        text: block.text || '',
        isComplete: block.is_complete || true
      })) : undefined,
      toolCalls: data.tool_calls ? data.tool_calls.map((tc: any) => ({
        toolCallId: tc.tool_call_id || '',
        toolName: tc.tool_name || '',
        serverName: tc.server_name,
        state: tc.state || 'completed',
        args: tc.args,
        content: tc.content
      })) : undefined,
      agentId: data.agent_id,
      agentName: data.agent_name,
      agentAvatar: data.agent_avatar
    };
    
    if (isGlobal) {
      addGlobalMessage(message);
    } else if (currentSession) {
      addMessage(currentSession.id, message);
    }
    
    setIsStreaming(false);
    setCurrentThinking('');
    setCurrentToolCalls([]);
  };

  const handleChatError = (data: any, isGlobal: boolean) => {
    const errorMessage: Message = {
      id: `error-${Date.now()}`,
      role: 'assistant',
      content: [{ type: 'text', text: `Error: ${data.error || 'Unknown error'}` }],
      timestamp: new Date(),
      status: 'error',
      error: data.error
    };
    
    if (isGlobal) {
      addGlobalMessage(errorMessage);
    } else if (currentSession) {
      addMessage(currentSession.id, errorMessage);
    }
    
    setIsStreaming(false);
    setCurrentThinking('');
    setCurrentToolCalls([]);
  };

  const handleThinkingChunk = (data: any) => {
    setCurrentThinking(prev => prev + (data.text || ''));
    setShowThinking(true);
  };

  const handleThinkingComplete = (data: any) => {
    // Thinking is already stored in the message when chat_response arrives
    setShowThinking(false);
    setCurrentThinking('');
  };

  const handleToolCall = (data: any) => {
    const toolCall: ToolCallInfo = {
      toolCallId: data.tool_call_id || '',
      toolName: data.tool_name || '',
      serverName: data.server_name,
      state: 'running',
      args: data.args
    };
    
    setCurrentToolCalls(prev => [...prev, toolCall]);
    setShowToolCalls(true);
  };

  const handleToolResult = (data: any) => {
    setCurrentToolCalls(prev => 
      prev.map(tc => 
        tc.toolCallId === data.tool_call_id 
          ? { ...tc, state: 'completed', content: data.content }
          : tc
      )
    );
  };

  const handleToolError = (data: any) => {
    setCurrentToolCalls(prev => 
      prev.map(tc => 
        tc.toolCallId === data.tool_call_id 
          ? { ...tc, state: 'failed', content: `Error: ${data.error}` }
          : tc
      )
    );
  };

  const handleChoiceRequest = (data: any, isGlobal: boolean) => {
    const message: Message = {
      id: data.message_id || Date.now().toString(),
      role: 'assistant',
      content: [{ type: 'text', text: data.prompt || '' }],
      timestamp: new Date(),
      choices: data.choices ? data.choices.map((choice: any) => ({
        id: choice.id || `choice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        label: choice.label || '',
        value: choice.value || '',
        selected: false
      })) : undefined
    };
    
    if (isGlobal) {
      addGlobalMessage(message);
    } else if (currentSession) {
      addMessage(currentSession.id, message);
    }
  };

  const handleAcpApprovalRequest = (data: AcpApprovalRequest) => {
    setApprovalModal(data);
  };

  // Send message function
  const sendMessage = useCallback(async (text: string, files?: File[]) => {
    if (!text.trim() && (!files || files.length === 0)) return;
    if (!currentSession) return;
    
    const isGlobal = currentSession.isGlobal;
    const ws = isGlobal ? globalWebSocket : wsRef.current;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      const errorMsg = 'Not connected to server';
      if (isGlobal) {
        setGlobalError(errorMsg);
      } else {
        setLastConnectionError(errorMsg);
      }
      return;
    }
    
    // Create user message
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: [{ type: 'text', text: text }],
      timestamp: new Date(),
      status: 'sending',
      attachments: files?.map(file => ({
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        type: file.type,
        url: URL.createObjectURL(file),
        size: file.size
      }))
    };
    
    // Add message to state
    if (isGlobal) {
      addGlobalMessage(userMessage);
    } else {
      addMessage(currentSession.id, userMessage);
    }
    
    // Prepare form data for file upload
    const formData = new FormData();
    formData.append('text', text);
    formData.append('session_id', currentSession.id);
    formData.append('is_global', isGlobal.toString());
    
    if (currentAgent) {
      formData.append('agent_id', currentAgent.id);
    }
    
    if (files && files.length > 0) {
      files.forEach(file => {
        formData.append('files', file);
      });
    }
    
    try {
      // Upload files and get response
      const response = await fetch(`${getApiUrl()}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`
        },
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update message status to sent
      const updateFn = isGlobal ? updateGlobalMessage : updateMessage;
      updateFn(isGlobal ? userMessage.id : currentSession.id, userMessage.id, {
        status: 'sent'
      });
      
      // If server returns immediate response
      if (data.response) {
        handleChatResponse(data.response, isGlobal);
      }
      
      // Tag session with agent if applicable
      if (currentAgent && currentSession.id) {
        await tagSessionAgent(currentSession.id, currentAgent.id);
      }
      
    } catch (error) {
      console.error('Failed to send message:', error);
      
      // Update message status to error
      const updateFn = isGlobal ? updateGlobalMessage : updateMessage;
      updateFn(isGlobal ? userMessage.id : currentSession.id, userMessage.id, {
        status: 'error',
        error: error instanceof Error ? error.message : 'Failed to send message'
      });
      
      const errorMsg = error instanceof Error ? error.message : 'Failed to send message';
      if (isGlobal) {
        setGlobalError(errorMsg);
      } else {
        setLastConnectionError(errorMsg);
      }
    }
    
    // Clear input
    setInputText('');
    setSelectedFiles([]);
    setAutoScroll(true);
    
    // Focus input
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentSession, currentAgent, globalWebSocket, addGlobalMessage, addMessage, updateGlobalMessage, updateMessage, setGlobalError]);

  // Handle choice selection
  const handleChoiceSelect = useCallback((messageId: string, choiceId: string, isGlobal: boolean) => {
    if (!currentSession) return;
    
    const ws = isGlobal ? globalWebSocket : wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    // Send choice selection to server
    ws.send(JSON.stringify({
      type: 'choice_response',
      message_id: messageId,
      choice_id: choiceId,
      session_id: currentSession.id
    }));
    
    // Update local message to reflect selection
    const updateFn = isGlobal ? updateGlobalMessage : updateMessage;
    const messagesArr = isGlobal ? globalMessages : currentSession.messages || [];
    const message = messagesArr.find(m => m.id === messageId);
    
    if (message && message.choices) {
      const updatedChoices = message.choices.map(choice => ({
        ...choice,
        selected: choice.id === choiceId
      }));
      
      updateFn(isGlobal ? messageId : currentSession.id, messageId, {
        choices: updatedChoices
      });
    }
  }, [currentSession, globalWebSocket, globalMessages, updateGlobalMessage, updateMessage]);

  // Handle ACP approval
  const handle```tsx
  // Handle ACP approval
  const handleAcpApproval = useCallback(async (requestId: string, approved: boolean) => {
    try {
      const response = await fetch(`${getAcpProxyUrl()}/api/approval`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`
        },
        body: JSON.stringify({
          request_id: requestId,
          approved,
          user_id: getUserId()
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      setApprovalModal(null);
    } catch (error) {
      console.error('Failed to handle ACP approval:', error);
    }
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setAutoScroll(true);
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  // Handle scroll events to detect if user has scrolled up
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 50;
    setAutoScroll(isAtBottom);
  }, []);

  // Create checkpoint
  const createCheckpoint = useCallback((messageId: string) => {
    if (!currentSession) return;
    
    const checkpoint: Checkpoint = {
      id: `checkpoint-${Date.now()}`,
      messageId,
      timestamp: new Date(),
      messages: [...messages],
      label: `Checkpoint at ${new Date().toLocaleTimeString()}`
    };
    
    setCheckpoints(prev => [...prev, checkpoint]);
  }, [currentSession, messages]);

  // Restore checkpoint
  const restoreCheckpoint = useCallback((checkpointId: string) => {
    const checkpoint = checkpoints.find(cp => cp.id === checkpointId);
    if (!checkpoint || !currentSession) return;
    
    // In a real implementation, this would restore the message history
    // For now, we'll just close the checkpoints panel
    setShowCheckpoints(false);
  }, [checkpoints, currentSession]);

  // Copy message to clipboard
  const copyMessage = useCallback(async (message: Message) => {
    const textContent = message.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
    
    await copyToClipboard(textContent);
  }, []);

  // Regenerate response
  const regenerateResponse = useCallback((messageId: string) => {
    if (!currentSession) return;
    
    const isGlobal = currentSession.isGlobal;
    const ws = isGlobal ? globalWebSocket : wsRef.current;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'regenerate',
      message_id: messageId,
      session_id: currentSession.id
    }));
    
    setIsStreaming(true);
  }, [currentSession, globalWebSocket]);

  // Share message
  const shareMessage = useCallback(async (message: Message) => {
    const textContent = message.content
      .filter(part => part.type === 'text')
      .map(part => part.text)
      .join('\n');
    
    if (navigator.share) {
      await navigator.share({
        title: 'Shared from AI Chat',
        text: textContent
      });
    } else {
      await copyToClipboard(textContent);
    }
  }, []);

  // Rate message
  const rateMessage = useCallback((messageId: string, rating: 'up' | 'down') => {
    if (!currentSession) return;
    
    const isGlobal = currentSession.isGlobal;
    const ws = isGlobal ? globalWebSocket : wsRef.current;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    
    ws.send(JSON.stringify({
      type: 'rate_message',
      message_id: messageId,
      rating,
      session_id: currentSession.id
    }));
  }, [currentSession, globalWebSocket]);

  // Handle file drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(prev => [...prev, ...files]);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setSelectedFiles(prev => [...prev, ...files]);
    }
  }, []);

  // Remove selected file
  const removeFile = useCallback((index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputText, selectedFiles);
    }
  }, [inputText, selectedFiles, sendMessage]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 200)}px`;
    }
  }, [inputText]);

  // Connection status icon
  const connectionStatusIcon = useMemo(() => {
    const connected = currentSession?.isGlobal ? isGlobalConnected : isConnected;
    
    if (connected) {
      return <Wifi className="w-4 h-4 text-green-500" />;
    }
    
    return <WifiOff className="w-4 h-4 text-red-500" />;
  }, [currentSession?.isGlobal, isGlobalConnected, isConnected]);

  // Format timestamp
  const formatTimestamp = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(date);
  };

  // Render message content
  const renderMessageContent = (message: Message) => {
    return message.content.map((part, index) => {
      switch (part.type) {
        case 'text':
          return (
            <div key={index} className="prose prose-sm max-w-none dark:prose-invert">
              <MarkdownContent content={part.text || ''} />
            </div>
          );
        case 'image':
          return (
            <div key={index} className="my-2">
              <img
                src={part.url}
                alt={part.name || 'Image'}
                className="max-w-full rounded-lg"
              />
            </div>
          );
        case 'file':
          return (
            <div key={index} className="my-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4" />
                <span className="text-sm font-medium">{part.name}</span>
              </div>
            </div>
          );
        case 'diff':
          return (
            <div key={index} className="my-2">
              <MultiFileDiff
                files={JSON.parse(part.data || '[]') as FileChange[]}
              />
            </div>
          );
        default:
          return null;
      }
    });
  };

  // Render thinking blocks
  const renderThinkingBlocks = (message: Message) => {
    if (!message.thinkingBlocks || message.thinkingBlocks.length === 0) return null;
    
    return (
      <div className="mt-2 border-l-2 border-yellow-400 pl-3">
        <button
          onClick={() => setShowThinking(!showThinking)}
          className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400 hover:text-yellow-700 dark:hover:text-yellow-300"
        >
          <Brain className="w-3 h-3" />
          <span>Thinking Process</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showThinking ? 'rotate-180' : ''}`} />
        </button>
        {showThinking && (
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
            {message.thinkingBlocks.map((block, i) => (
              <p key={block.id} className="mb-1">{block.text}</p>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render tool calls
  const renderToolCalls = (message: Message) => {
    if (!message.toolCalls || message.toolCalls.length === 0) return null;
    
    return (
      <div className="mt-2 border-l-2 border-blue-400 pl-3">
        <button
          onClick={() => setShowToolCalls(!showToolCalls)}
          className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
        >
          <Zap className="w-3 h-3" />
          <span>Tool Calls ({message.toolCalls.length})</span>
          <ChevronDown className={`w-3 h-3 transition-transform ${showToolCalls ? 'rotate-180' : ''}`} />
        </button>
        {showToolCalls && (
          <div className="mt-2 space-y-2">
            {message.toolCalls.map((tc) => (
              <div key={tc.toolCallId} className="p-2 bg-gray-50 dark:bg-gray-800 rounded text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{tc.toolName}</span>
                  <span className={`px-2 py-0.5 rounded ${
                    tc.state === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                    tc.state === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' :
                    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                  }`}>
                    {tc.state}
                  </span>
                </div>
                {tc.serverName && (
                  <div className="text-gray-500 mt-1">Server: {tc.serverName}</div>
                )}
                {tc.args && (
                  <div className="mt-1 text-gray-600 dark:text-gray-400">
                    <span className="font-medium">Args:</span> {tc.args}
                  </div>
                )}
                {tc.content && (
                  <div className="mt-1 text-gray-600 dark:text-gray-400 max-h-20 overflow-auto">
                    <span className="font-medium">Result:</span> {tc.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // Render choices
  const renderChoices = (message: Message) => {
    if (!message.choices || message.choices.length === 0) return null;
    
    const hasSelected = message.choices.some(c => c.selected);
    
    return (
      <div className="mt-3">
        <TaskChoiceMenu
          choices={message.choices}
          onSelect={(choiceId) => handleChoiceSelect(message.id, choiceId, currentSession?.isGlobal || false)}
          disabled={hasSelected}
        />
      </div>
    );
  };

  // Render message actions
  const renderMessageActions = (message: Message) => {
    const isAssistant = message.role === 'assistant';
    
    return (
      <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => copyMessage(message)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Copy"
        >
          <Copy className="w-3 h-3" />
        </button>
        
        {isAssistant && (
          <>
            <button
              onClick={() => rateMessage(message.id, 'up')}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Good response"
            >
              <ThumbsUp className="w-3 h-3" />
            </button>
            <button
              onClick={() => rateMessage(message.id, 'down')}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Bad response"
            >
              <ThumbsDown className="w-3 h-3" />
            </button>
            <button
              onClick={() => regenerateResponse(message.id)}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              title="Regenerate"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </>
        )}
        
        <button
          onClick={() => shareMessage(message)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Share"
        >
          <Share2 className="w-3 h-3" />
        </button>
        
        <button
          onClick={() => createCheckpoint(message.id)}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          title="Create checkpoint"
        >
          <Bookmark className="w-3 h-3" />
        </button>
      </div>
    );
  };

  // Main render
  return (
    <div
      className="flex flex-col h-full bg-white dark:bg-gray-900"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b dark:border-gray-800">
        <div className="flex items-center gap-3">
          {isMobile && (
            <button
              onClick={toggleSidebar}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
          
          <div className="flex items-center gap-2">
            {currentAgent ? (
              <>
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold">
                  {currentAgent.avatar || currentAgent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-sm font-semibold">{currentAgent.name}</h2>
                  <p className="text-xs text-gray-500">{currentAgent.description || 'AI Assistant'}</p>
                </div>
              </>
            ) : (
              <>
                <Bot className="w-6 h-6" />
                <h2 className="text-sm font-semibold">{t('chat.title', 'Chat')}</h2>
              </>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {connectionStatusIcon}
          
          {currentSession?.isGlobal && (
            <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded">
              Global
            </span>
          )}
          
          <button
            onClick={() => setShowCheckpoints(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            title="Checkpoints"
          >
            <Bookmark className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => setShowMobileMenu(true)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 md:hidden"
          >
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto p-4 space-y-4"
        onScroll={handleScroll}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageSquare className="w-12 h-12 mb-4" />
            <p className="text-lg font-medium">{t('chat.empty', 'Start a conversation')}</p>
            <p className="text-sm">{t('chat.emptyHint', 'Type a message or attach a file to begin')}</p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`group flex gap-3 ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {message.agentAvatar || message.agentName?.charAt(0) || 'A'}
                </div>
              )}
              
              <div
                className={`max-w-[80%] ${
                  message.role === 'user'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 dark:bg-gray-800'
                } rounded-lg p-3`}
              >
                {message.status === 'error' && (
                  <div className="text-red-500 text-xs mb-2">
                    {message.error || 'Failed to send'}
                  </div>
                )}
                
                {renderMessageContent(message)}
                
                {message.role === 'assistant' && (
                  <>
                    {renderThinkingBlocks(message)}
                    {renderToolCalls(message)}
                    {renderChoices(message)}
                  </>
                )}
                
                <div className="flex items-center justify-between mt-2">
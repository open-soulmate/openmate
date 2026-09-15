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

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  parts?: MessagePart[];
  timestamp: Date;
  tokenUsage?: TokenUsage;
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
  checkpoint?: Checkpoint;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
  agentId?: string;
}

// [evo:a] - Removed local WebSocket state management in favor of global store
// [evo:a] - Connection status now driven by useAppStore().globalWsConnected
// [evo:a] - Removed duplicate connection initialization/cleanup logic
// [evo:a] - Simplified useEffect hooks with proper dependency arrays

export function ChatClient() {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { open: sidebarOpen } = useSidebar();
  
  // [evo:a] - Use global WebSocket connection state from store instead of local state
  const { globalWsConnected, addGlobalMessageHandler, removeGlobalMessageHandler } = useAppStore();
  
  // Local UI state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showSidebar, setShowSidebar] = useState(!isMobile);
  const [streamingContent, setStreamingContent] = useState('');
  const [streamingThinking, setStreamingThinking] = useState<ThinkingBlock[]>([]);
  const [streamingToolCalls, setStreamingToolCalls] = useState<ToolCallInfo[]>([]);
  const [approvalRequest, setApprovalRequest] = useState<AcpApprovalRequest | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Current session derived state
  const currentSession = useMemo(() => 
    sessions.find(s => s.id === currentSessionId) || null,
    [sessions, currentSessionId]
  );

  const messages = useMemo(() => 
    currentSession?.messages || [],
    [currentSession]
  );

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // [evo:a] - Global WebSocket message handler registration
  // This effect registers/unregisters the component's message handler with the global WebSocket
  useEffect(() => {
    const handleGlobalMessage = (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data);
        
        // Handle chat-specific messages routed through global connection
        if (data.type === 'chat_message' && data.sessionId === currentSessionId) {
          handleIncomingMessage(data);
        } else if (data.type === 'chat_stream' && data.sessionId === currentSessionId) {
          handleStreamChunk(data);
        } else if (data.type === 'chat_stream_end' && data.sessionId === currentSessionId) {
          handleStreamEnd(data);
        } else if (data.type === 'thinking_update' && data.sessionId === currentSessionId) {
          handleThinkingUpdate(data);
        } else if (data.type === 'tool_call_update' && data.sessionId === currentSessionId) {
          handleToolCallUpdate(data);
        } else if (data.type === 'approval_request' && data.sessionId === currentSessionId) {
          setApprovalRequest(data.request);
        }
      } catch (e) {
        // Not a JSON message or not our concern
      }
    };

    // [evo:a] - Register with global WebSocket message handler
    addGlobalMessageHandler(handleGlobalMessage);
    
    // [evo:a] - Cleanup: unregister handler when component unmounts or session changes
    return () => {
      removeGlobalMessageHandler(handleGlobalMessage);
    };
  }, [currentSessionId, addGlobalMessageHandler, removeGlobalMessageHandler]);

  // [evo:a] - Removed local WebSocket connection effect
  // Connection management is now handled entirely by GlobalWebSocket component

  // Cleanup abort controller on unmount
  useEffect(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, []);

  const handleIncomingMessage = useCallback((data: any) => {
    const newMessage: Message = {
      id: data.messageId || `msg-${Date.now()}`,
      role: data.role || 'assistant',
      content: data.content || '',
      parts: data.parts || [],
      timestamp: new Date(data.timestamp || Date.now()),
      tokenUsage: data.tokenUsage,
      thinkingBlocks: data.thinkingBlocks,
      toolCalls: data.toolCalls,
    };

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: [...session.messages, newMessage],
          updatedAt: new Date(),
        };
      }
      return session;
    }));

    setIsSending(false);
    setStreamingContent('');
    setStreamingThinking([]);
    setStreamingToolCalls([]);
  }, [currentSessionId]);

  const handleStreamChunk = useCallback((data: any) => {
    setStreamingContent(prev => prev + (data.content || ''));
    setIsSending(true);
  }, []);

  const handleStreamEnd = useCallback((data: any) => {
    if (streamingContent) {
      const newMessage: Message = {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        content: streamingContent,
        timestamp: new Date(),
        thinkingBlocks: streamingThinking.length > 0 ? streamingThinking : undefined,
        toolCalls: streamingToolCalls.length > 0 ? streamingToolCalls : undefined,
      };

      setSessions(prev => prev.map(session => {
        if (session.id === currentSessionId) {
          return {
            ...session,
            messages: [...session.messages, newMessage],
            updatedAt: new Date(),
          };
        }
        return session;
      }));
    }

    setStreamingContent('');
    setStreamingThinking([]);
    setStreamingToolCalls([]);
    setIsSending(false);
  }, [streamingContent, streamingThinking, streamingToolCalls, currentSessionId]);

  const handleThinkingUpdate = useCallback((data: any) => {
    setStreamingThinking(prev => {
      const existing = prev.find(b => b.id === data.blockId);
      if (existing) {
        return prev.map(b => b.id === data.blockId ? { ...b, text: b.text + data.text, isComplete: data.isComplete } : b);
      }
      return [...prev, { id: data.blockId, text: data.text, isComplete: data.isComplete }];
    });
  }, []);

  const handleToolCallUpdate = useCallback((data: any) => {
    setStreamingToolCalls(prev => {
      const existing = prev.find(t => t.toolCallId === data.toolCallId);
      if (existing) {
        return prev.map(t => t.toolCallId === data.toolCallId ? { ...t, ...data } : t);
      }
      return [...prev, { toolCallId: data.toolCallId, toolName: data.toolName, serverName: data.serverName, state: data.state, args: data.args, content: data.content }];
    });
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (!currentSessionId || !globalWsConnected) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setSessions(prev => prev.map(session => {
      if (session.id === currentSessionId) {
        return {
          ...session,
          messages: [...session.messages, userMessage],
          updatedAt: new Date(),
        };
      }
      return session;
    }));

    setInput('');
    setAttachments([]);
    setIsSending(true);

    // Send via HTTP API (global WebSocket is for receiving)
    try {
      abortControllerRef.current = new AbortController();
      
      const formData = new FormData();
      formData.append('sessionId', currentSessionId);
      formData.append('content', input);
      attachments.forEach(file => formData.append('attachments', file));

      const response = await fetch(`${getApiUrl()}/api/chat/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${getToken()}`,
        },
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Send failed: ${response.statusText}`);
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('[chat] Send error:', error);
        setIsSending(false);
      }
    }
  }, [input, attachments, currentSessionId, globalWsConnected]);

  const createNewSession = useCallback(async (agentId?: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ agentId }),
      });

      if (!response.ok) throw new Error('Failed to create session');
      
      const data = await response.json();
      const newSession: ChatSession = {
        id: data.sessionId,
        title: t('chat.newChat', 'New Chat'),
        messages: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        agentId,
      };

      setSessions(prev => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);

      // Tag session with agent if specified
      if (agentId) {
        tagSessionAgent(newSession.id, agentId);
      }

      return newSession.id;
    } catch (error) {
      console.error('[chat] Create session error:', error);
      return null;
    }
  }, [t]);

  const handleApproval = useCallback(async (approved: boolean) => {
    if (!approvalRequest) return;

    try {
      await fetch(`${getAcpProxyUrl()}/api/approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: approvalRequest.requestId,
          approved,
        }),
      });
    } catch (error) {
      console.error('[chat] Approval error:', error);
    }

    setApprovalRequest(null);
  }, [approvalRequest]);

  const handleCopyMessage = useCallback(async (content: string) => {
    await copyToClipboard(content);
  }, []);

  const handleRegenerate = useCallback(async (messageId: string) => {
    if (!currentSessionId || !globalWsConnected) return;

    try {
      await fetch(`${getApiUrl()}/api/chat/regenerate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ sessionId: currentSessionId, messageId }),
      });
      setIsSending(true);
    } catch (error) {
      console.error('[chat] Regenerate error:', error);
    }
  }, [currentSessionId, globalWsConnected]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // [evo:a] - Connection status indicator uses global store state
  const ConnectionStatus = useMemo(() => (
    <div className="flex items-center gap-1 text-xs">
      {globalWsConnected ? (
        <>
          <Wifi className="h-3 w-3 text-green-500" />
          <span className="text-green-500">{t('chat.connected', 'Connected')}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3 w-3 text-red-500" />
          <span className="text-red-500">{t('chat.disconnected', 'Disconnected')}</span>
        </>
      )}
    </div>
  ), [globalWsConnected, t]);

  // Render message with thinking blocks and tool calls
  const renderMessage = useCallback((message: Message) => {
    const isUser = message.role === 'user';
    const isStreaming = false; // Only for current streaming message

    return (
      <div key={message.id} className={`flex gap-3 p-4 ${isUser ? 'bg-muted/50' : ''}`}>
        <div className="flex-shrink-0">
          {isUser ? (
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
              <Bot className="h-4 w-4" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">
              {isUser ? t```tsx
            ? t('chat.you', 'You') : t('chat.assistant', 'Assistant')}
            </span>
            <span className="text-xs text-muted-foreground">
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            {message.tokenUsage && (
              <span className="text-xs text-muted-foreground">
                {message.tokenUsage.input + message.tokenUsage.output} tokens
              </span>
            )}
          </div>

          {/* Thinking blocks */}
          {message.thinkingBlocks && message.thinkingBlocks.length > 0 && (
            <details className="mb-2 group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                <Brain className="h-3 w-3" />
                {t('chat.thinking', 'Thinking process')}
                <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground whitespace-pre-wrap">
                {message.thinkingBlocks.map(block => block.text).join('\n')}
              </div>
            </details>
          )}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2 space-y-1">
              {message.toolCalls.map(toolCall => (
                <div key={toolCall.toolCallId} className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                    toolCall.state === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    toolCall.state === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    {toolCall.state === 'running' && <Loader2 className="h-3 w-3 animate-spin" />}
                    <Zap className="h-3 w-3" />
                    {toolCall.toolName}
                    {toolCall.serverName && <span className="text-muted-foreground">({toolCall.serverName})</span>}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Message content */}
          <div className="prose prose-sm dark:prose-invert max-w-none">
            {message.parts && message.parts.length > 0 ? (
              message.parts.map((part, i) => {
                if (part.type === 'text') {
                  return <MarkdownContent key={i} content={part.text || ''} />;
                }
                if (part.type === 'image') {
                  return (
                    <div key={i} className="my-2">
                      <img src={part.url || `data:${part.mime_type};base64,${part.data}`} alt={part.name || 'Image'} className="max-w-sm rounded" />
                    </div>
                  );
                }
                if (part.type === 'file_diff') {
                  const changes: FileChange[] = part.data ? JSON.parse(part.data) : [];
                  return <MultiFileDiff key={i} changes={changes} />;
                }
                if (part.type === 'choices' && part.choices) {
                  return (
                    <TaskChoiceMenu
                      key={i}
                      options={part.choices}
                      onSelect={(choice) => {
                        setInput(choice.value);
                        handleSend();
                      }}
                    />
                  );
                }
                return null;
              })
            ) : (
              <MarkdownContent content={message.content} />
            )}
          </div>

          {/* Message actions */}
          {!isUser && (
            <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleCopyMessage(message.content)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={t('chat.copy', 'Copy')}
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleRegenerate(message.id)}
                className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                title={t('chat.regenerate', 'Regenerate')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={t('chat.good', 'Good response')}>
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground" title={t('chat.bad', 'Bad response')}>
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }, [t, handleCopyMessage, handleRegenerate]);

  // Streaming message display
  const renderStreamingMessage = useCallback(() => {
    if (!isSending && !streamingContent) return null;

    return (
      <div className="flex gap-3 p-4">
        <div className="flex-shrink-0">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-medium text-sm">{t('chat.assistant', 'Assistant')}</span>
            {isSending && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>

          {/* Streaming thinking blocks */}
          {streamingThinking.length > 0 && (
            <details open className="mb-2">
              <summary className="text-xs text-muted-foreground flex items-center gap-1">
                <Brain className="h-3 w-3 animate-pulse" />
                {t('chat.thinking', 'Thinking...')}
              </summary>
              <div className="mt-2 p-2 bg-muted/30 rounded text-xs text-muted-foreground whitespace-pre-wrap">
                {streamingThinking.map(block => (
                  <span key={block.id}>
                    {block.text}
                    {!block.isComplete && <span className="inline-block w-1.5 h-3 bg-primary animate-pulse" />}
                  </span>
                ))}
              </div>
            </details>
          )}

          {/* Streaming tool calls */}
          {streamingToolCalls.length > 0 && (
            <div className="mb-2 space-y-1">
              {streamingToolCalls.map(toolCall => (
                <div key={toolCall.toolCallId} className="flex items-center gap-2 text-xs">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${
                    toolCall.state === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                    toolCall.state === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                  }`}>
                    <Loader2 className={`h-3 w-3 ${toolCall.state === 'running' ? 'animate-spin' : ''}`} />
                    <Zap className="h-3 w-3" />
                    {toolCall.toolName}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Streaming content */}
          {streamingContent && (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <MarkdownContent content={streamingContent} />
              <span className="inline-block w-2 h-4 bg-primary animate-pulse ml-0.5" />
            </div>
          )}
        </div>
      </div>
    );
  }, [isSending, streamingContent, streamingThinking, streamingToolCalls, t]);

  return (
    <div className="flex h-full">
      {/* Sessions sidebar */}
      {showSidebar && (
        <div className={`${isMobile ? 'absolute inset-0 z-50 bg-background' : 'w-64 border-r'} flex flex-col`}>
          <div className="p-3 border-b flex items-center justify-between">
            <h2 className="font-semibold text-sm">{t('chat.sessions', 'Sessions')}</h2>
            <div className="flex items-center gap-1">
              <button
                onClick={() => createNewSession()}
                className="p-1.5 rounded hover:bg-muted"
                title={t('chat.newChat', 'New Chat')}
              >
                <Plus className="h-4 w-4" />
              </button>
              {isMobile && (
                <button
                  onClick={() => setShowSidebar(false)}
                  className="p-1.5 rounded hover:bg-muted"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => {
                  setCurrentSessionId(session.id);
                  if (isMobile) setShowSidebar(false);
                }}
                className={`w-full text-left p-3 hover:bg-muted flex items-start gap-2 ${
                  session.id === currentSessionId ? 'bg-muted' : ''
                }`}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{session.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {session.updatedAt.toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
            {sessions.length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">
                {t('chat.noSessions', 'No conversations yet')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat header */}
        <div className="border-b p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!showSidebar && (
              <button
                onClick={() => setShowSidebar(true)}
                className="p-1.5 rounded hover:bg-muted"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            )}
            <h1 className="font-semibold text-sm truncate">
              {currentSession?.title || t('chat.title', 'Chat')}
            </h1>
            {currentSession?.agentId && (
              <span className="text-xs bg-secondary px-2 py-0.5 rounded">
                {currentSession.agentId}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {ConnectionStatus}
          </div>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto">
          {!currentSession ? (
            <div className="h-full flex items-center justify-center">
              <div className="text-center max-w-md mx-auto p-6">
                <Bot className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <h2 className="text-lg font-semibold mb-2">{t('chat.welcome', 'Welcome to Chat')}</h2>
                <p className="text-muted-foreground text-sm mb-4">
                  {t('chat.welcomeDesc', 'Start a new conversation or select an existing one.')}
                </p>
                <button
                  onClick={() => createNewSession()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm"
                >
                  <Plus className="h-4 w-4" />
                  {t('chat.newChat', 'New Chat')}
                </button>
              </div>
            </div>
          ) : (
            <div className="pb-4">
              {messages.map(message => (
                <div key={message.id} className="group">
                  {renderMessage(message)}
                </div>
              ))}
              {renderStreamingMessage()}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input area */}
        {currentSession && (
          <div className="border-t p-3">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((file, index) => (
                  <div key={index} className="flex items-center gap-1 bg-muted px-2 py-1 rounded text-xs">
                    {file.type.startsWith('image/') ? (
                      <ImageIcon className="h-3 w-3" />
                    ) : (
                      <FileText className="h-3 w-3" />
                    )}
                    <span className="max-w-[100px] truncate">{file.name}</span>
                    <button
                      onClick={() => removeAttachment(index)}
                      className="hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
                accept="image/*,.pdf,.doc,.docx,.txt"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded hover:bg-muted text-muted-foreground"
                disabled={isSending || !globalWsConnected}
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <div className="flex-1 relative">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    globalWsConnected
                      ? t('chat.placeholder', 'Type a message...')
                      : t('chat.disconnectedPlaceholder', 'Disconnected - waiting for connection...')
                  }
                  className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-h-[40px] max-h-[200px]"
                  rows={1}
                  disabled={isSending || !globalWsConnected}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() && attachments.length === 0 || isSending || !globalWsConnected}
                className="p-2 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            </div>

            {/* Connection warning */}
            {!globalWsConnected && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <WifiOff className="h-3 w-3" />
                {t('chat.connectionLost', 'Connection lost. Messages cannot be sent until reconnected.')}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ACP Approval Modal */}
      {approvalRequest && (
        <AcpApprovalModal
          request={approvalRequest}
          onApprove={() => handleApproval(true)}
          onDeny={() => handleApproval(false)}
          onClose={() => setApprovalRequest(null)}
        />
      )}
    </div>
  );
}
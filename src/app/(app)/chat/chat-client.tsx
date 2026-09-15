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
};```tsx
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
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts?: MessagePart[];
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
  tokenUsage?: TokenUsage;
  timestamp: Date;
  isStreaming?: boolean;
  error?: string;
}

interface ChatClientProps {
  sessionId?: string;
  agentId?: string;
  initialMessages?: Message[];
}

export function ChatClient({ sessionId, agentId, initialMessages = [] }: ChatClientProps) {
  const { t } = useTranslation();
  const isMobile = useIsMobile();
  const { setOpen } = useSidebar();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<AcpApprovalRequest | null>(null);
  const [attachments, setAttachments] = useState<File[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const currentSessionId = useRef<string>(sessionId || '');
  const streamingMessageId = useRef<string | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Stable callback for handling code apply from MarkdownContent
  const handleCodeApply = useCallback(async (code: string, language?: string, filePath?: string) => {
    if (!filePath) {
      console.warn('[CodeApply] No file path provided');
      return;
    }

    try {
      const response = await fetch(`${getApiUrl()}/api/files/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getToken()}`,
        },
        body: JSON.stringify({
          path: filePath,
          content: code,
          language,
          sessionId: currentSessionId.current,
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to apply code: ${response.statusText}`);
      }

      const result = await response.json();
      console.log('[CodeApply] Successfully applied:', result);

      // Add a system message indicating the file was updated
      const systemMessage: Message = {
        id: `system-${Date.now()}`,
        role: 'system',
        content: `File updated: ${filePath}`,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, systemMessage]);
    } catch (error) {
      console.error('[CodeApply] Error:', error);
      const errorMessage: Message = {
        id: `error-${Date.now()}`,
        role: 'system',
        content: `Failed to apply code to ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        error: 'apply_failed',
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  }, []);

  // Connect to WebSocket
  useEffect(() => {
    if (!currentSessionId.current) return;

    const wsUrl = `${getWsUrl()}/ws/chat/${currentSessionId.current}`;
    const token = getToken();

    try {
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WS] Connected');
        setIsConnected(true);
      };

      ws.onclose = () => {
        console.log('[WS] Disconnected');
        setIsConnected(false);
      };

      ws.onerror = (error) => {
        console.error('[WS] Error:', error);
        setIsConnected(false);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleWebSocketMessage(data);
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      return () => {
        ws.close();
      };
    } catch (error) {
      console.error('[WS] Connection failed:', error);
    }
  }, [sessionId]);

  // Handle incoming WebSocket messages with stable state updates
  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'message_start': {
        const newMessage: Message = {
          id: data.messageId || `msg-${Date.now()}`,
          role: 'assistant',
          content: '',
          parts: [],
          thinkingBlocks: [],
          toolCalls: [],
          timestamp: new Date(),
          isStreaming: true,
        };
        streamingMessageId.current = newMessage.id;
        setMessages(prev => [...prev, newMessage]);
        setIsLoading(true);
        break;
      }

      case 'content_delta': {
        if (!streamingMessageId.current) break;
        const messageId = streamingMessageId.current;
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            return {
              ...msg,
              content: msg.content + (data.text || ''),
            };
          }
          return msg;
        }));
        break;
      }

      case 'thinking_delta': {
        if (!streamingMessageId.current) break;
        const messageId = streamingMessageId.current;
        const thinkingId = data.thinkingBlockId || 'default';
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            const existingBlocks = msg.thinkingBlocks || [];
            const blockIndex = existingBlocks.findIndex(b => b.id === thinkingId);
            if (blockIndex >= 0) {
              const updatedBlocks = [...existingBlocks];
              updatedBlocks[blockIndex] = {
                ...updatedBlocks[blockIndex],
                text: updatedBlocks[blockIndex].text + (data.text || ''),
              };
              return { ...msg, thinkingBlocks: updatedBlocks };
            } else {
              return {
                ...msg,
                thinkingBlocks: [...existingBlocks, {
                  id: thinkingId,
                  text: data.text || '',
                  isComplete: false,
                }],
              };
            }
          }
          return msg;
        }));
        break;
      }

      case 'thinking_end': {
        if (!streamingMessageId.current) break;
        const messageId = streamingMessageId.current;
        const thinkingId = data.thinkingBlockId || 'default';
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            const blocks = (msg.thinkingBlocks || []).map(b =>
              b.id === thinkingId ? { ...b, isComplete: true } : b
            );
            return { ...msg, thinkingBlocks: blocks };
          }
          return msg;
        }));
        break;
      }

      case 'tool_call_start': {
        if (!streamingMessageId.current) break;
        const messageId = streamingMessageId.current;
        const toolCall: ToolCallInfo = {
          toolCallId: data.toolCallId,
          toolName: data.toolName,
          serverName: data.serverName,
          state: 'running',
          args: data.args,
        };
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            return {
              ...msg,
              toolCalls: [...(msg.toolCalls || []), toolCall],
            };
          }
          return msg;
        }));
        break;
      }

      case 'tool_call_end': {
        if (!streamingMessageId.current) break;
        const messageId = streamingMessageId.current;
        setMessages(prev => prev.map(msg => {
          if (msg.id === messageId) {
            const toolCalls = (msg.toolCalls || []).map(tc =>
              tc.toolCallId === data.toolCallId
                ? { ...tc, state: data.success ? 'completed' as const : 'failed' as const, content: data.content }
                : tc
            );
            return { ...msg, toolCalls };
          }
          return msg;
        }));
        break;
      }

      case 'message_end': {
        if (streamingMessageId.current) {
          const messageId = streamingMessageId.current;
          setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
              return {
                ...msg,
                isStreaming: false,
                tokenUsage: data.tokenUsage,
              };
            }
            return msg;
          }));
          streamingMessageId.current = null;
        }
        setIsLoading(false);
        break;
      }

      case 'acp_approval_request': {
        setApprovalRequest(data.request);
        setShowApprovalModal(true);
        break;
      }

      case 'error': {
        console.error('[WS] Server error:', data.message);
        if (streamingMessageId.current) {
          const messageId = streamingMessageId.current;
          setMessages(prev => prev.map(msg => {
            if (msg.id === messageId) {
              return {
                ...msg,
                isStreaming: false,
                error: data.message,
              };
            }
            return msg;
          }));
          streamingMessageId.current = null;
        }
        setIsLoading(false);
        break;
      }

      default:
        console.log('[WS] Unknown message type:', data.type);
    }
  }, []);

  const sendMessage = useCallback(async () => {
    if (!input.trim() && attachments.length === 0) return;
    if (isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
      parts: attachments.length > 0
        ? [{ type: 'text', text: input.trim() }]
        : undefined,
    };

    // Add user message to state
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // Upload attachments if any
    const uploadedParts: MessagePart[] = [];
    if (attachments.length > 0) {
      for (const file of attachments) {
        try {
          const formData = new FormData();
          formData.append('file', file);
          const response = await fetch(`${getApiUrl()}/api/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${getToken()}` },
            body: formData,
          });
          if (response.ok) {
            const result = await response.json();
            uploadedParts.push({
              type: file.type.startsWith('image/') ? 'image' : 'file',
              url: result.url,
              name: file.name,
              mime_type: file.type,
            });
          }
        } catch (error) {
          console.error('[Upload] Failed:', error);
        }
      }
      setAttachments([]);
    }

    // Send via WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'send_message',
        content: input.trim(),
        parts: uploadedParts.length > 0 ? uploadedParts : undefined,
        sessionId: currentSessionId.current,
        agentId,
      }));
    } else {
      // Fallback to HTTP if WebSocket not connected
      try {
        const response = await fetch(`${getApiUrl()}/api/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getToken()}`,
          },
          body: JSON.stringify({
            message: input.trim(),
            parts: uploadedParts.length > 0 ? uploadedParts : undefined,
            sessionId: currentSessionId.current,
            agentId,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          // Create session if new
          if (!currentSessionId.current && result.sessionId) {
            currentSessionId.current = result.sessionId;
            if (agentId) {
              tagSessionAgent(result.sessionId, agentId);
            }
          }
        }
      } catch (error) {
        console.error('[Chat] Failed to send message:', error);
        setIsLoading(false);
      }
    }
  }, [input, attachments, isLoading, agentId]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const handleApprove = useCallback(async () => {
    if (approvalRequest && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'acp_approval_response',
        requestId: approvalRequest.requestId,
        approved: true,
      }));
    }
    setShowApprovalModal(false);
    setApprovalRequest(null);
  }, [approvalRequest]);

  const handleReject = useCallback(async () => {
    if (approvalRequest && wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'acp_approval_response',
        requestId: approvalRequest.requestId,
        approved: false,
      }));
    }
    setShowApprovalModal(false);
    setApprovalRequest(null);
  }, [approvalRequest]);

  const handleRetry = useCallback((messageId: string) => {
    const messageIndex = messages.findIndex(m => m.id === messageId);
    if (messageIndex >= 0) {
      // Find the last user message before this one
      const previousMessages = messages.slice(0, messageIndex);
      const lastUserMessage = [...previousMessages].reverse().find(m => m.role === 'user');
      if (lastUserMessage) {
        setInput(lastUserMessage.content);
      }
    }
  }, [messages]);

  const handleCopyMessage = useCallback(async (content: string) => {
    await copyToClipboard(content);
  }, []);

  const handleClearChat = useCallback(() => {
    setMessages([]);
    currentSessionId.current = '';
  }, []);

  const renderMessage = useCallback((message: Message) => {
    const isUser = message.role === 'user';
    const isSystem = message.role === 'system';

    if (isSystem) {
      return (
        <div key={message.id} className="flex justify-center py-2">
          <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
            {message.content}
          </span>
        </div>
      );
    }

    return (
      <div key={message.id} className={`flex gap-3 py-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
        )}
        <div className={`max-w-[80%] ${isUser ? 'order-first' : ''}`}>
          {/* Thinking blocks */}
          {message.thinkingBlocks && message.thinkingBlocks.length > 0 && (
            <details className="mb-2 group">
              <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground flex items-center gap-1">
                <Brain className="w-3 h-3" />
                {t('chat.thinking', 'Thinking process')}
                <ChevronDown className="w-3 h-3 transition-transform group-open:rotate-180" />
              </summary>
              <div className="mt-1 p-3 bg-muted/50 rounded-lg text-sm">```tsx
                {message.thinkingBlocks.map(block => (
                  <div key={block.id} className="text-muted-foreground">
                    <MarkdownContent
                      content={block.text}
                      onApply={handleCodeApply}
                    />
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Tool calls */}
          {message.toolCalls && message.toolCalls.length > 0 && (
            <div className="mb-2 space-y-1">
              {message.toolCalls.map(toolCall => (
                <div key={toolCall.toolCallId} className="flex items-center gap-2 text-xs bg-muted/50 px-3 py-2 rounded-lg">
                  {toolCall.state === 'running' && <Loader2 className="w-3 h-3 animate-spin" />}
                  {toolCall.state === 'completed' && <Zap className="w-3 h-3 text-green-500" />}
                  {toolCall.state === 'failed' && <X className="w-3 h-3 text-red-500" />}
                  <span className="font-mono">
                    {toolCall.serverName && <span className="text-muted-foreground">{toolCall.serverName}/</span>}
                    {toolCall.toolName}
                  </span>
                  {toolCall.state === 'running' && (
                    <span className="text-muted-foreground">{t('chat.toolRunning', 'Running...')}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Message content */}
          <div className={`rounded-lg px-4 py-3 ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted'
          }`}>
            {isUser ? (
              <p className="whitespace-pre-wrap">{message.content}</p>
            ) : (
              <MarkdownContent
                content={message.content}
                onApply={handleCodeApply}
              />
            )}

            {/* File/image parts */}
            {message.parts && message.parts.filter(p => p.type === 'image' || p.type === 'file').length > 0 && (
              <div className="mt-3 space-y-2">
                {message.parts.filter(p => p.type === 'image').map((part, idx) => (
                  <img
                    key={idx}
                    src={part.url}
                    alt={part.name || 'Uploaded image'}
                    className="max-w-full rounded-lg"
                  />
                ))}
                {message.parts.filter(p => p.type === 'file').map((part, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-sm bg-background/50 p-2 rounded">
                    <FileText className="w-4 h-4" />
                    <span>{part.name}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Error state */}
            {message.error && (
              <div className="mt-2 text-sm text-red-500 flex items-center gap-1">
                <X className="w-3 h-3" />
                {message.error}
              </div>
            )}

            {/* Streaming indicator */}
            {message.isStreaming && (
              <span className="inline-block w-2 h-4 bg-foreground/50 animate-pulse ml-1" />
            )}
          </div>

          {/* Message actions */}
          {!isUser && !message.isStreaming && (
            <div className="flex items-center gap-1 mt-1 opacity-0 hover:opacity-100 transition-opacity">
              <button
                onClick={() => handleCopyMessage(message.content)}
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                title={t('chat.copy', 'Copy')}
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => handleRetry(message.id)}
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                title={t('chat.retry', 'Retry')}
              >
                <RefreshCw className="w-3 h-3" />
              </button>
              <button
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                title={t('chat.good', 'Good response')}
              >
                <ThumbsUp className="w-3 h-3" />
              </button>
              <button
                className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground"
                title={t('chat.bad', 'Bad response')}
              >
                <ThumbsDown className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Timestamp */}
          <div className={`text-xs text-muted-foreground mt-1 ${isUser ? 'text-right' : ''}`}>
            {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {message.tokenUsage && (
              <span className="ml-2">
                {message.tokenUsage.input + message.tokenUsage.output} tokens
              </span>
            )}
          </div>
        </div>
        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <User className="w-4 h-4 text-primary-foreground" />
          </div>
        )}
      </div>
    );
  }, [handleCodeApply, handleCopyMessage, handleRetry, t]);

  return (
    <div className="flex flex-col h-full">
      {/* Chat header */}
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2">
          {isMobile && (
            <button
              onClick={() => setOpen(true)}
              className="p-2 hover:bg-muted rounded-lg"
            >
              <PanelLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="text-sm font-medium">
            {t('chat.title', 'Chat')}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-xs">
            {isConnected ? (
              <>
                <Wifi className="w-3 h-3 text-green-500" />
                <span className="text-green-600">{t('chat.connected', 'Connected')}</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-muted-foreground" />
                <span className="text-muted-foreground">{t('chat.disconnected', 'Disconnected')}</span>
              </>
            )}
          </div>
          <button
            onClick={handleClearChat}
            className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground"
            title={t('chat.clear', 'Clear chat')}
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageSquare className="w-12 h-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">{t('chat.emptyTitle', 'Start a conversation')}</p>
            <p className="text-sm">{t('chat.emptySubtitle', 'Send a message to begin')}</p>
          </div>
        ) : (
          <div className="py-4 space-y-2">
            {messages.map(renderMessage)}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="border-t p-4">
        {/* Attachments preview */}
        {attachments.length > 0 && (
          <div className="flex gap-2 mb-3 flex-wrap">
            {attachments.map((file, idx) => (
              <div key={idx} className="flex items-center gap-2 bg-muted px-3 py-2 rounded-lg text-sm">
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span className="max-w-[150px] truncate">{file.name}</span>
                <button
                  onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))}
                  className="hover:text-destructive"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('chat.placeholder', 'Type a message...')}
              className="w-full resize-none rounded-lg border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[48px] max-h-[200px]"
              rows={1}
              disabled={isLoading}
            />
            <div className="absolute right-2 bottom-2 flex items-center gap-1">
              <label className="p-1 hover:bg-muted rounded cursor-pointer text-muted-foreground hover:text-foreground">
                <Paperclip className="w-4 h-4" />
                <input
                  type="file"
                  className="hidden"
                  multiple
                  onChange={e => {
                    const files = Array.from(e.target.files || []);
                    setAttachments(prev => [...prev, ...files]);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>
          <button
            onClick={sendMessage}
            disabled={(!input.trim() && attachments.length === 0) || isLoading}
            className="p-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>

      {/* ACP Approval Modal */}
      <AcpApprovalModal
        open={showApprovalModal}
        request={approvalRequest}
        onApprove={handleApprove}
        onReject={handleReject}
        onClose={() => {
          setShowApprovalModal(false);
          setApprovalRequest(null);
        }}
      />
    </div>
  );
}
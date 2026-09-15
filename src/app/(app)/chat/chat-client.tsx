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
import { useSessionState } from '@/hooks/use-session-state';
import { useChatTitle } from '@/hooks/use-chat-title';

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
type Agent = any; // placeholder for Agent type

// Main chat client component
export default function ChatClient() {
  // Use new hooks for session and title management
  const { currentSessionId, sessions, setCurrentSessionId, setSessions, createSession, updateSession } = useSessionState();
  const { chatTitle, setChatTitle } = useChatTitle(currentSessionId);

  // Other state and refs remain for UI and interaction logic
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [showAttachmentPanel, setShowAttachmentPanel] = useState(false);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [thinkingBlocks, setThinkingBlocks] = useState<ThinkingBlock[]>([]);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [approvalRequest, setApprovalRequest] = useState<AcpApprovalRequest | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const appStore = useAppStore();
  const isMobile = useIsMobile();
  const { t } = useTranslation();
  const { open: openSidebar } = useSidebar();

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Connect to WebSocket when session changes
  useEffect(() => {
    if (!currentSessionId) return;
    
    const ws = new WebSocket(`${getWsUrl()}/ws/chat/${currentSessionId}`);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setIsConnected(true);
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Handle incoming messages, thinking blocks, tool calls, etc.
      // This is simplified; actual implementation would be more complex
      if (data.type === 'message') {
        setMessages(prev => [...prev, data.message]);
      }
    };
    
    ws.onclose = () => {
      setIsConnected(false);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
    
    return () => {
      ws.close();
    };
  }, [currentSessionId]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Event handlers for user interactions
  const handleSendMessage = useCallback(() => {
    if (!input.trim() || !currentSessionId) return;
    
    const message = {
      role: 'user' as const,
      content: input.trim(),
      parts: [{ type: 'text', text: input.trim() }],
      timestamp: new Date().toISOString(),
      id: Date.now().toString(),
    };
    
    setMessages(prev => [...prev, message]);
    setInput('');
    
    // Send to WebSocket
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'user_message',
        message,
      }));
    }
  }, [input, currentSessionId]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSessionSelect = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    // Load messages for this session would be handled by the hook or a separate effect
  };

  const handleCreateNewSession = () => {
    createSession();
  };

  const handleUpdateTitle = (newTitle: string) => {
    setChatTitle(newTitle);
    // Persist title update would be handled by the hook
  };

  const handleCopyMessage = (content: string) => {
    copyToClipboard(content);
  };

  const handleApproveAcp = (requestId: string) => {
    // Handle ACP approval
  };

  const handleRejectAcp = (requestId: string) => {
    // Handle ACP rejection
  };

  // Memoized session list for sidebar
  const sessionList = useMemo(() => {
    return sessions.map(session => ({
      ...session,
      isActive: session.id === currentSessionId,
    }));
  }, [sessions, currentSessionId]);

  // Render UI
  return (
    <div className="flex h-full bg-background">
      {/* Sidebar for sessions */}
      <Sheet open={showSidebar} onOpenChange={setShowSidebar}>
        <SheetContent side="left" className="w-80">
          <SheetHeader>
            <SheetTitle>{t('Sessions')}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col h-full">
            <button
              onClick={handleCreateNewSession}
              className="flex items-center gap-2 p-3 text-sm hover:bg-muted rounded-md"
            >
              <Plus size={16} />
              {t('New Chat')}
            </button>
            <div className="flex-1 overflow-y-auto">
              {sessionList.map(session => (
                <div
                  key={session.id}
                  onClick={() => handleSessionSelect(session.id)}
                  className={`p-3 cursor-pointer hover:bg-muted ${session.isActive ? 'bg-muted' : ''}`}
                >
                  <div className="font-medium truncate">{session.title || t('Untitled Chat')}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(true)}
              className="p-2 hover:bg-muted rounded-md"
            >
              <PanelLeft size={18} />
            </button>
            <h1 className="text-lg font-semibold">
              {chatTitle || t('New Chat')}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 hover:bg-muted rounded-md"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Bot size={48} />
              <p className="mt-4 text-lg">{t('How can I help you today?')}</p>
            </div>
          ) : (
            messages.map(message =>```tsx
              (
                <div
                  key={message.id}
                  className={`flex gap-3 mb-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {message.role !== 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot size={16} className="text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted'
                    }`}
                  >
                    {message.parts?.map((part, index) => (
                      part.type === 'text' ? (
                        <MarkdownContent key={index} content={part.text || ''} />
                      ) : part.type === 'diff' ? (
                        <MultiFileDiff key={index} files={part.data as unknown as FileChange[]} />
                      ) : part.type === 'choices' ? (
                        <TaskChoiceMenu
                          key={index}
                          options={part.choices || []}
                          onSelect={(choice) => {
                            if (wsRef.current?.readyState === WebSocket.OPEN) {
                              wsRef.current.send(JSON.stringify({
                                type: 'choice_selection',
                                choice,
                                messageId: message.id,
                              }));
                            }
                          }}
                        />
                      ) : null
                    ))}
                    {message.role !== 'user' && (
                      <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
                        <button
                          onClick={() => handleCopyMessage(message.content || '')}
                          className="p-1 hover:bg-background/50 rounded"
                          title={t('Copy')}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          className="p-1 hover:bg-background/50 rounded"
                          title={t('Good response')}
                        >
                          <ThumbsUp size={14} />
                        </button>
                        <button
                          className="p-1 hover:bg-background/50 rounded"
                          title={t('Bad response')}
                        >
                          <ThumbsDown size={14} />
                        </button>
                        <button
                          className="p-1 hover:bg-background/50 rounded"
                          title={t('Regenerate')}
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                      <User size={16} />
                    </div>
                  )}
                </div>
              )
            )
          )}
          {/* Thinking blocks */}
          {thinkingBlocks.map(block => (
            <div key={block.id} className="mb-4 p-3 bg-muted/50 rounded-lg border border-dashed">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
                <Brain size={14} />
                <span>{t('Thinking...')}</span>
                {!block.isComplete && <Loader2 size={14} className="animate-spin" />}
              </div>
              <div className="text-sm whitespace-pre-wrap">{block.text}</div>
            </div>
          ))}
          {/* Tool calls */}
          {toolCalls.map(tool => (
            <div key={tool.toolCallId} className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Zap size={14} />
                <span className="font-medium">{tool.toolName}</span>
                {tool.serverName && (
                  <span className="text-muted-foreground">({tool.serverName})</span>
                )}
                <span className={`ml-auto text-xs ${
                  tool.state === 'running' ? 'text-yellow-500' :
                  tool.state === 'completed' ? 'text-green-500' :
                  'text-red-500'
                }`}>
                  {tool.state === 'running' && <Loader2 size={12} className="animate-spin" />}
                  {tool.state === 'completed' && '✓'}
                  {tool.state === 'failed' && '✗'}
                </span>
              </div>
              {tool.content && (
                <div className="mt-2 text-sm text-muted-foreground">{tool.content}</div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex gap-3 mb-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot size={16} className="text-primary" />
              </div>
              <div className="bg-muted rounded-lg p-3">
                <Loader2 size={16} className="animate-spin" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input area */}
        <div className="p-4 border-t">
          {/* Attachment previews */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {attachments.map((file, index) => (
                <div key={index} className="flex items-center gap-2 bg-muted rounded-md px-3 py-1.5 text-sm">
                  {file.type.startsWith('image/') ? (
                    <ImageIcon size={14} />
                  ) : (
                    <FileText size={14} />
                  )}
                  <span className="truncate max-w-[150px]">{file.name}</span>
                  <button
                    onClick={() => setAttachments(prev => prev.filter((_, i) => i !== index))}
                    className="hover:text-destructive"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex items-end gap-2">
            <button
              onClick={() => setShowAttachmentPanel(true)}
              className="p-2 hover:bg-muted rounded-md"
              title={t('Attach file')}
            >
              <Paperclip size={18} />
            </button>
            
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyPress}
                placeholder={t('Type a message...')}
                className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary min-h-[40px] max-h-[200px]"
                rows={1}
              />
            </div>
            
            <button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="p-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          
          <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <span className="flex items-center gap-1">
                  <Wifi size={12} className="text-green-500" />
                  {t('Connected')}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <WifiOff size={12} className="text-red-500" />
                  {t('Disconnected')}
                </span>
              )}
            </div>
            <span>{t('Press Enter to send, Shift+Enter for new line')}</span>
          </div>
        </div>
      </div>

      {/* ACP Approval Modal */}
      {approvalRequest && (
        <AcpApprovalModal
          request={approvalRequest}
          onApprove={handleApproveAcp}
          onReject={handleRejectAcp}
          onClose={() => setApprovalRequest(null)}
        />
      )}
    </div>
  );
}
```
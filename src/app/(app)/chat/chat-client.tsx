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
type AgentStatus = 'idle' | 'thinking' | 'using_tool' | 'responding';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
  parts?: MessagePart[];
  timestamp: Date;
  tokenUsage?: TokenUsage;
  thinkingBlocks?: ThinkingBlock[];
  toolCalls?: ToolCallInfo[];
}

export default function ChatClient() {
  const { t } = useTranslation();
  const { state: sidebarState } = useSidebar();
  const isMobile = useIsMobile();
  const { 
    sessions,
    currentSessionId,
    setCurrentSessionId,
    updateSessionTitle,
    addSession,
    markSessionAsNew
  } = useAppStore();
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('default');
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(4096);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [acpApprovalRequest, setAcpApprovalRequest] = useState<AcpApprovalRequest | null>(null);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [thinkingBlockId, setThinkingBlockId] = useState<string | null>(null);
  const [toolCalls, setToolCalls] = useState<ToolCallInfo[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  
  // 标题状态管理 - 本地状态优先
  const [localTitle, setLocalTitle] = useState<string>('');
  const [titleInitialized, setTitleInitialized] = useState(false);
  
  // 从store中获取当前会话标题，但仅在标题已从后端同步后使用
  const currentSession = sessions.find(s => s.id === currentSessionId);
  const displayTitle = useMemo(() => {
    // 优先使用本地状态标题
    if (localTitle) return localTitle;
    // 其次使用store中的标题（已从后端同步）
    if (currentSession?.title && titleInitialized) return currentSession.title;
    // 最后使用默认占位符
    return t('chat.newChat', '新对话');
  }, [localTitle, currentSession?.title, titleInitialized, t]);

  // 更新标题的统一函数
  const updateTitle = useCallback((title: string, fromBackend = false) => {
    setLocalTitle(title);
    // 仅当从后端同步时更新store中的标题
    if (fromBackend) {
      updateSessionTitle(currentSessionId, title);
      setTitleInitialized(true);
    }
  }, [currentSessionId, updateSessionTitle]);

  // 初始化标题逻辑 - 仅在新建会话或从后端获取时设置
  useEffect(() => {
    if (!currentSessionId) return;
    
    // 检查是否是新会话（通过store中的标记或新生成的ID）
    const isNewSession = useAppStore.getState().newSessionIds.has(currentSessionId) || 
                         currentSessionId.startsWith('new_');
    
    if (isNewSession) {
      // 新建会话时设置默认标题
      const defaultTitle = t('chat.newChat', '新对话');
      updateTitle(defaultTitle, false);
      // 清除新建会话标记
      useAppStore.getState().clearNewSessionId(currentSessionId);
    } else {
      // 从后端获取已有会话数据时同步标题
      loadSessionTitle(currentSessionId);
    }
  }, [currentSessionId, t, updateTitle]);

  // 从后端加载会话标题
  const loadSessionTitle = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`${getApiUrl()}/api/sessions/${sessionId}/title`);
      if (response.ok) {
        const data = await response.json();
        if (data.title) {
          updateTitle(data.title, true);
        } else {
          // 后端无标题时，使用本地默认
          const defaultTitle = t('chat.newChat', '新对话');
          updateTitle(defaultTitle, false);
        }
      } else {
        // 网络错误时保持当前本地标题
        console.warn('Failed to load session title, keeping local title');
      }
    } catch (error) {
      console.warn('Error loading session title:', error);
      // 离线场景保持本地标题
    }
  }, [t, updateTitle]);

  // 明确重置函数 - 用户手动重置时调用
  const resetChat = useCallback(() => {
    const newSessionId = `new_${Date.now()}`;
    setCurrentSessionId(newSessionId);
    markSessionAsNew(newSessionId);
    setMessages([]);
    setInputValue('');
    setAttachedFiles([]);
    setToolCalls([]);
    setThinkingBlockId(null);
    setAgentStatus('idle');
    // 重置标题为新会话默认值
    const defaultTitle = t('chat.newChat', '新对话');
    updateTitle(defaultTitle, false);
  }, [setCurrentSessionId, markSessionAsNew, t, updateTitle]);

  // WebSocket连接和断开逻辑
  useEffect(() => {
    if (!currentSessionId) return;
    
    const wsUrl = `${getWsUrl()}/ws/chat/${currentSessionId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      console.log('WebSocket disconnected');
      // 自动重连
      setTimeout(() => {
        if (wsRef.current === ws) {
          // 重新连接时不会重置标题
          wsRef.current = new WebSocket(wsUrl);
        }
      }, 3000);
    };
    
    return () => {
      ws.close();
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
    };
  }, [currentSessionId]);

  // 处理WebSocket消息 - 包含标题同步
  const handleWebSocketMessage = useCallback((data: any) => {
    switch (data.type) {
      case 'title_update':
        // 从后端同步标题
        if (data.title && data.sessionId === currentSessionId) {
          updateTitle(data.title, true);
        }
        break;
      case 'chat_message':
        // 处理聊天消息
        setMessages(prev => [...prev, {
          id: data.id || Date.now().toString(),
          role: data.role || 'assistant',
          content: data.content,
          parts: data.parts,
          timestamp: new Date(data.timestamp || Date.now()),
          tokenUsage: data.tokenUsage,
          thinkingBlocks: data.thinkingBlocks,
          toolCalls: data.toolCalls
        }]);
        break;
      case 'agent_status':
        setAgentStatus(data.status);
        if (data.status === 'thinking' && data.thinkingBlockId) {
          setThinkingBlockId(data.thinkingBlockId);
        }
        break;
      case 'tool_update':
        // 更新工具调用状态
        setToolCalls(prev => {
          const existing = prev.find(t => t.toolCallId === data.toolCallId);
          if (existing) {
            return prev.map(t => 
              t.toolCallId === data.toolCallId 
                ? { ...t, ...data }
                : t
            );
          } else {
            return [...prev, {
              toolCallId: data.toolCallId,
              toolName: data.toolName,
              serverName: data.serverName,
              state: data.state,
              args: data.args,
              content: data.content
            }];
          }
        });
        break;
      case 'checkpoint_created':
        // 处理检查点创建
        if (data.checkpoint) {
          setCheckpoints(prev => [...prev, data.checkpoint]);
        }
        break;
      default:
        console.log('Unknown message type:', data.type);
    }
  }, [currentSessionId, updateTitle]);

  // 发送消息
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() && attachedFiles.length === 0) return;
    if (!isConnected || isLoading) return;
    
    const message = {
      role: 'user' as const,
      content: inputValue,
      parts: attachedFiles.map(file => ({
        type: file.type.startsWith('image/') ? 'image' : 'file',
        name: file.name,
        mime_type: file.type
      }))
    };
    
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      ...message,
      timestamp: new Date()
    }]);
    
    setInputValue('');
    setAttachedFiles([]);
    setIsLoading(true);
    
    // 通过WebSocket发送消息
    if (wsRef.current) {
      wsRef.current.send(JSON.stringify({
        type: 'chat_message',
        message,
        sessionId: currentSessionId,
        model: selectedModel,
        temperature,
        maxTokens
      }));
    }
  }, [inputValue, attachedFiles, isConnected, isLoading, currentSessionId, selectedModel, temperature, maxTokens]);

  // 文件上传处理
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const files = Array.from(e.target.files);
      setAttachedFiles(prev => [...prev, ...files]);
    }
  };

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 获取会话标题（用于显示）
  const getSessionTitle = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session?.title) return session.title;
    if (sessionId === currentSessionId) return displayTitle;
    return t('chat.newChat', '新对话');
  }, [sessions, currentSessionId, displayTitle, t]);

  return (
    <div className="flex flex-col h-full">
      {/* 标题栏 */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center space-x-2">
          {isMobile && (
            <button 
              onClick={() => sidebarState === 'expanded' ? useSidebar().setCollapsed() : useSidebar().setExpanded()}
              className="p-2 hover:bg-gray```tsx
-100 rounded-md">
              <PanelLeft className="w-5 h-5" />
            </button>
          )}
          <h2 className="text-lg font-semibold truncate">{displayTitle}</h2>
        </div>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={resetChat}
            className="p-2 hover:bg-gray-100 rounded-md"
            title={ t('chat.newChat', '新对话') }
          >
            <Plus className="w-5 h-5" />
          </button>
          
          <button
            onClick={() => setShowCheckpoints(!showCheckpoints)}
            className="p-2 hover:bg-gray-100 rounded-md"
            title={t('chat.checkpoints', '检查点')}
          >
            <Bookmark className="w-5 h-5" />
          </button>
          
          <div className="flex items-center space-x-1 text-sm text-gray-500">
            {isConnected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
          </div>
        </div>
      </div>
      
      {/* 消息列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-4 ${
                message.role === 'user'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              {message.role === 'assistant' && (
                <div className="flex items-center space-x-2 mb-2">
                  <Bot className="w-4 h-4" />
                  <span className="text-sm font-medium">Assistant</span>
                </div>
              )}
              
              {/* 思考过程展示 */}
              {message.thinkingBlocks && message.thinkingBlocks.length > 0 && (
                <div className="mb-3 p-2 bg-yellow-50 rounded border border-yellow-200">
                  <div className="flex items-center space-x-1 mb-1">
                    <Brain className="w-3 h-3 text-yellow-600" />
                    <span className="text-xs font-medium text-yellow-700">
                      {t('chat.thinking', '思考过程')}
                    </span>
                  </div>
                  {message.thinkingBlocks.map((block) => (
                    <p key={block.id} className="text-sm text-yellow-800 whitespace-pre-wrap">
                      {block.text}
                    </p>
                  ))}
                </div>
              )}
              
              {/* 工具调用展示 */}
              {message.toolCalls && message.toolCalls.length > 0 && (
                <div className="mb-3 space-y-1">
                  {message.toolCalls.map((tool) => (
                    <div
                      key={tool.toolCallId}
                      className="flex items-center space-x-2 p-2 bg-gray-50 rounded text-sm"
                    >
                      <Zap className={`w-3 h-3 ${
                        tool.state === 'completed' ? 'text-green-500' :
                        tool.state === 'failed' ? 'text-red-500' : 'text-blue-500'
                      }`} />
                      <span className="font-medium">{tool.toolName}</span>
                      {tool.serverName && (
                        <span className="text-gray-500">({tool.serverName})</span>
                      )}
                      <span className="text-gray-400 text-xs">
                        {tool.state === 'running' ? '...' : tool.state}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* 消息内容 */}
              {message.parts && message.parts.length > 0 ? (
                <div className="space-y-2">
                  {message.parts.map((part, idx) => {
                    if (part.type === 'text') {
                      return (
                        <MarkdownContent key={idx} content={part.text || ''} />
                      );
                    }
                    if (part.type === 'image') {
                      return (
                        <div key={idx} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                          <ImageIcon className="w-4 h-4" />
                          <span className="text-sm">{part.name || 'Image'}</span>
                        </div>
                      );
                    }
                    if (part.type === 'file') {
                      return (
                        <div key={idx} className="flex items-center space-x-2 p-2 bg-gray-50 rounded">
                          <FileText className="w-4 h-4" />
                          <span className="text-sm">{part.name || 'File'}</span>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              ) : (
                <MarkdownContent content={message.content} />
              )}
              
              {/* 消息操作栏 */}
              {message.role === 'assistant' && (
                <div className="flex items-center space-x-2 mt-3 pt-2 border-t border-gray-200">
                  <button
                    onClick={() => copyToClipboard(message.content)}
                    className="p-1 hover:bg-gray-200 rounded"
                    title={t('chat.copy', '复制')}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-gray-200 rounded" title={t('chat.like', '赞')}>
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-gray-200 rounded" title={t('chat.dislike', '踩')}>
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-gray-200 rounded" title={t('chat.share', '分享')}>
                    <Share2 className="w-3 h-3" />
                  </button>
                  <button className="p-1 hover:bg-gray-200 rounded" title={t('chat.regenerate', '重新生成')}>
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
        
        {/* Agent状态指示器 */}
        {agentStatus !== 'idle' && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm text-gray-600">
                  {agentStatus === 'thinking' && t('chat.thinking', '思考中...')}
                  {agentStatus === 'using_tool' && t('chat.usingTool', '使用工具中...')}
                  {agentStatus === 'responding' && t('chat.responding', '生成回复中...')}
                </span>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* 检查点面板 */}
      {showCheckpoints && (
        <Sheet open={showCheckpoints} onOpenChange={setShowCheckpoints}>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>{t('chat.checkpoints', '检查点')}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-2">
              {checkpoints.length === 0 ? (
                <p className="text-sm text-gray-500">{t('chat.noCheckpoints', '暂无检查点')}</p>
              ) : (
                checkpoints.map((cp) => (
                  <div
                    key={cp.id}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{cp.label}</span>
                      <span className="text-xs text-gray-500">
                        {cp.timestamp.toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}
      
      {/* ACP审批模态框 */}
      {acpApprovalRequest && (
        <AcpApprovalModal
          request={acpApprovalRequest}
          onApprove={() => {
            // 处理审批通过
            setAcpApprovalRequest(null);
          }}
          onReject={() => {
            // 处理审批拒绝
            setAcpApprovalRequest(null);
          }}
        />
      )}
      
      {/* 输入区域 */}
      <div className="border-t p-4">
        {/* 附件预览 */}
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachedFiles.map((file, idx) => (
              <div
                key={idx}
                className="flex items-center space-x-2 bg-gray-100 rounded-lg px-3 py-2"
              >
                {file.type.startsWith('image/') ? (
                  <ImageIcon className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                <span className="text-sm truncate max-w-[150px]">{file.name}</span>
                <button
                  onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                  className="p-1 hover:bg-gray-200 rounded"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        
        {/* 高级选项 */}
        {showAdvanced && (
          <div className="mb-3 p-3 bg-gray-50 rounded-lg space-y-3">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium">{t('chat.model', '模型')}:</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="text-sm border rounded px-2 py-1"
              >
                <option value="default">{t('chat.default', '默认')}</option>
                <option value="gpt-4">GPT-4</option>
                <option value="gpt-3.5-turbo">GPT-3.5 Turbo</option>
              </select>
            </div>
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium">{t('chat.temperature', '温度')}:</label>
              <input
                type="range"
                min="0"
                max="2"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-32"
              />
              <span className="text-sm">{temperature}</span>
            </div>
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium">{t('chat.maxTokens', '最大Token')}:</label>
              <input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="text-sm border rounded px-2 py-1 w-24"
              />
            </div>
          </div>
        )}
        
        {/* 输入框 */}
        <div className="flex items-end space-x-2">
          <div className="flex space-x-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-100 rounded-md"
              title={t('chat.attachFile', '附加文件')}
            >
              <Paperclip className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={`p-2 rounded-md ${showAdvanced ? 'bg-blue-100 text-blue-600' : 'hover:bg-gray-100'}`}
              title={t('chat.advanced', '高级选项')}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t('chat.inputPlaceholder', '输入消息...')}
              className="w-full resize-none rounded-lg border p-3 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={1}
              style={{ maxHeight: '150px' }}
            />
            <button
              onClick={sendMessage}
              disabled={!isConnected || isLoading || (!inputValue.trim() && attachedFiles.length === 0)}
              className="absolute right-2 bottom-2 p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
        
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={handleFileChange}
          className="hidden"
        />
        
        {/* 上下文环 */}
        <div className="mt-2">
          <ContextRing />
        </div>
      </div>
    </div>
  );
}
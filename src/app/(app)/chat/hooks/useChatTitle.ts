import { useState, useEffect, useCallback } from 'react';
import { useSessionState } from './useSessionState';
import { generateChatTitle } from '@/utils/titleGeneration';

// 定义输入参数的类型
interface UseChatTitleProps {
  sessionId: string | null;
  latestUserMessage?: string | null;
  latestAIMessage?: string | null;
  isGenerating: boolean;
}

// 定义Hook的返回类型
interface UseChatTitleReturn {
  title: string | null;
  updateTitle: () => Promise<void>;
}

export function useChatTitle({
  sessionId,
  latestUserMessage,
  latestAIMessage,
  isGenerating,
}: UseChatTitleProps): UseChatTitleReturn {
  // 本地状态管理标题
  const [title, setTitle] = useState<string | null>(null);
  // 从useSessionState获取会话更新方法
  const { updateSessionTitle } = useSessionState();

  // 标题生成策略函数
  const determineTitle = useCallback(async (): Promise<string | null> => {
    // 策略1：优先使用AI生成的标题（如果有摘要服务）
    if (latestAIMessage) {
      try {
        const generatedTitle = await generateChatTitle(latestAIMessage);
        if (generatedTitle) {
          return generatedTitle;
        }
      } catch (error) {
        console.warn('AI标题生成失败，使用备用策略:', error);
      }
    }

    // 策略2：使用第一条用户消息（或最新的用户消息）作为标题
    if (latestUserMessage) {
      // 截取前20个字符作为标题，避免过长
      const titleLength = 20;
      const truncatedTitle =
        latestUserMessage.length > titleLength
          ? `${latestUserMessage.substring(0, titleLength)}...`
          : latestUserMessage;
      return truncatedTitle;
    }

    // 策略3：使用默认标题
    return '新会话';
  }, [latestUserMessage, latestAIMessage]);

  // 更新标题的函数
  const updateTitle = useCallback(async () => {
    if (!sessionId || isGenerating) return;

    try {
      const newTitle = await determineTitle();
      if (newTitle && newTitle !== title) {
        setTitle(newTitle);
        // 单向同步到会话状态
        await updateSessionTitle(sessionId, newTitle);
      }
    } catch (error) {
      console.error('更新聊天标题失败:', error);
    }
  }, [sessionId, isGenerating, determineTitle, title, updateSessionTitle]);

  // 在以下时机自动更新标题：
  // 1. 会话切换后（sessionId变化）
  // 2. 新消息到来后（但不在生成过程中）
  useEffect(() => {
    if (!sessionId) {
      setTitle(null);
      return;
    }

    // 会话切换时，重置本地标题状态并触发更新
    setTitle(null);
    updateTitle();
  }, [sessionId]); // 仅在sessionId变化时执行

  // 当消息更新且不在生成中时，触发标题更新
  useEffect(() => {
    if (!sessionId || isGenerating) return;

    // 使用防抖，避免频繁更新
    const timer = setTimeout(() => {
      updateTitle();
    }, 1000); // 1秒延迟

    return () => clearTimeout(timer);
  }, [latestUserMessage, latestAIMessage, sessionId, isGenerating]);

  return { title, updateTitle };
}

// 导出默认标题生成策略函数，供外部使用或测试
export { generateChatTitle } from '@/utils/titleGeneration';
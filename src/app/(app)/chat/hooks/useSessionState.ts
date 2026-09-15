import { useState, useCallback, useRef, useEffect } from 'react';

interface Session {
  id: string;
  title: string;
  createdAt?: number;
  updatedAt?: number;
}

interface SessionState {
  currentSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
}

interface UseSessionStateReturn {
  currentSession: Session | null;
  sessions: Session[];
  isLoading: boolean;
  error: string | null;
  loadSession: () => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  createSession: (title?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
}

// 模拟API调用，实际项目中替换为真实API
const mockFetchSessions = async (signal?: AbortSignal): Promise<Session[]> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (signal?.aborted) return;
      resolve([
        { id: '1', title: '默认会话', createdAt: Date.now() },
        { id: '2', title: '技术讨论', createdAt: Date.now() - 86400000 },
      ]);
    }, 500);
  });
};

const mockFetchSessionById = async (
  id: string,
  signal?: AbortSignal
): Promise<Session | null> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (signal?.aborted) return;
      const sessions = [
        { id: '1', title: '默认会话', createdAt: Date.now() },
        { id: '2', title: '技术讨论', createdAt: Date.now() - 86400000 },
      ];
      resolve(sessions.find((s) => s.id === id) || null);
    }, 300);
  });
};

const mockSaveSession = async (session: Session): Promise<Session> => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ ...session, updatedAt: Date.now() });
    }, 200);
  });
};

export function useSessionState(): UseSessionStateReturn {
  const [state, setState] = useState<SessionState>({
    currentSession: null,
    sessions: [],
    isLoading: false,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const loadSessionControllerRef = useRef<AbortController | null>(null);
  const switchSessionControllerRef = useRef<AbortController | null>(null);

  // 清理所有的AbortController
  const cleanupControllers = useCallback(() => {
    if (loadSessionControllerRef.current) {
      loadSessionControllerRef.current.abort();
      loadSessionControllerRef.current = null;
    }
    if (switchSessionControllerRef.current) {
      switchSessionControllerRef.current.abort();
      switchSessionControllerRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  // 组件卸载时清理
  useEffect(() => {
    return cleanupControllers;
  }, [cleanupControllers]);

  const loadSession = useCallback(async () => {
    // 取消之前的加载请求
    if (loadSessionControllerRef.current) {
      loadSessionControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    loadSessionControllerRef.current = controller;
    
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const sessions = await mockFetchSessions(controller.signal);
      
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          sessions,
          currentSession: prev.currentSession || sessions[0] || null,
          isLoading: false,
        }));
        
        // 如果当前没有选中的会话，自动选择第一个
        if (!state.currentSession && sessions.length > 0) {
          await switchSession(sessions[0].id);
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : '加载会话列表失败',
        }));
      }
    }
  }, [state.currentSession]);

  const switchSession = useCallback(async (sessionId: string) => {
    // 取消之前的切换请求
    if (switchSessionControllerRef.current) {
      switchSessionControllerRef.current.abort();
    }
    
    const controller = new AbortController();
    switchSessionControllerRef.current = controller;
    
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const session = await mockFetchSessionById(sessionId, controller.signal);
      
      if (!controller.signal.aborted && session) {
        setState((prev) => ({
          ...prev,
          currentSession: session,
          isLoading: false,
        }));
      } else if (!controller.signal.aborted && !session) {
        throw new Error('会话不存在');
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : '切换会话失败',
        }));
      }
    }
  }, []);

  const createSession = useCallback(async (title?: string) => {
    const newSession: Session = {
      id: Date.now().toString(),
      title: title || `新会话 ${new Date().toLocaleString()}`,
      createdAt: Date.now(),
    };
    
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      const savedSession = await mockSaveSession(newSession);
      setState((prev) => ({
        ...prev,
        sessions: [...prev.sessions, savedSession],
        currentSession: savedSession,
        isLoading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : '创建会话失败',
      }));
    }
  }, []);

  const deleteSession = useCallback(async (sessionId: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // 模拟删除操作
      await new Promise((resolve) => setTimeout(resolve, 200));
      
      setState((prev) => {
        const newSessions = prev.sessions.filter((s) => s.id !== sessionId);
        let newCurrentSession = prev.currentSession;
        
        // 如果删除的是当前会话，切换到第一个会话
        if (prev.currentSession?.id === sessionId) {
          newCurrentSession = newSessions[0] || null;
        }
        
        return {
          ...prev,
          sessions: newSessions,
          currentSession: newCurrentSession,
          isLoading: false,
        };
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : '删除会话失败',
      }));
    }
  }, []);

  return {
    currentSession: state.currentSession,
    sessions: state.sessions,
    isLoading: state.isLoading,
    error: state.error,
    loadSession,
    switchSession,
    createSession,
    deleteSession,
  };
}

"use client";

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

// 定义连接状态枚举
enum WsState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  RECONNECTING = 'RECONNECTING',
  DISCONNECTED = 'DISCONNECTED'
}

// WebSocket 关闭码定义
const WsCloseCodes = {
  NORMAL: 1000,
  AUTH_FAILED: 4001,
  TOKEN_INVALID: 4002,
  SERVER_ERROR: 1006
};

/**
 * Global WebSocket connection — stays alive across page navigations.
 * Handles:
 * 1. Real-time unread message counts (like WeChat red dots)
 * 2. Session list refresh triggers
 * 3. Connection status indicator
 */
export function GlobalWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef(1000);
  const unmountedRef = useRef(false);
  const connectedTokenRef = useRef<string | null>(null);
  const wsStateRef = useRef<WsState>(WsState.IDLE);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 更新状态机状态并同步到全局store
  const updateWsState = (newState: WsState) => {
    wsStateRef.current = newState;
    // 同步连接状态到全局store
    const isConnected = newState === WsState.CONNECTED;
    useAppStore.getState().setGlobalWsConnected(isConnected);
  };

  // 重置连接状态为IDLE，允许重新连接
  const resetConnectionState = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    updateWsState(WsState.IDLE);
  };

  // 处理连接关闭事件
  const handleWebSocketClose = (event: CloseEvent) => {
    const { code, reason } = event;
    
    // 认证失败或token无效，停止自动重连
    if (code === WsCloseCodes.AUTH_FAILED || code === WsCloseCodes.TOKEN_INVALID) {
      console.warn(`WebSocket closed due to authentication error (code: ${code}, reason: ${reason})`);
      updateWsState(WsState.DISCONNECTED);
      // 设置较长的重试间隔或不重试（这里设置为30秒）
      retryRef.current = 30000;
    } else if (code === WsCloseCodes.SERVER_ERROR) {
      // 服务器错误，准备重连
      updateWsState(WsState.RECONNECTING);
      retryRef.current = Math.min(retryRef.current * 2, 30000); // 指数退避
    } else if (code !== WsCloseCodes.NORMAL && !unmountedRef.current) {
      // 非正常关闭，准备重连
      updateWsState(WsState.RECONNECTING);
      retryRef.current = Math.min(retryRef.current * 2, 30000);
    } else {
      // 正常关闭或组件已卸载
      updateWsState(WsState.IDLE);
    }
    
    // 清除WebSocket引用
    wsRef.current = null;
    connectedTokenRef.current = null;
  };

  useEffect(() => {
    const connect = () => {
      if (unmountedRef.current) return;

      // 根据当前状态决定行为
      if (wsStateRef.current === WsState.CONNECTED || wsStateRef.current === WsState.CONNECTING) {
        // 如果是CONNECTED状态但token已经改变，允许强制重连
        const currentToken = getToken();
        if (wsStateRef.current === WsState.CONNECTED && 
            connectedTokenRef.current && 
            connectedTokenRef.current !== currentToken) {
          // Token已改变，断开当前连接
          wsRef.current?.close();
          resetConnectionState();
        } else {
          // 已经在连接或已连接，跳过
          return;
        }
      }

      // 设置为连接中状态
      updateWsState(WsState.CONNECTING);

      // 每次连接都从 localStorage 读取最新 token，避免闭包捕获旧值
      const token = getToken();
      if (!token) {
        updateWsState(WsState.IDLE);
        return;
      }

      const apiBase = getApiBaseUrl();
      const wsUrl = apiBase.replace(/^http/, 'ws') + `/ws?token=${token}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        connectedTokenRef.current = token;

        ws.onopen = () => {
          updateWsState(WsState.CONNECTED);
          retryRef.current = 1000; // 重置重试间隔
        };

        ws.onmessage = (e) => {
          // 仅在CONNECTED状态下处理消息
          if (wsStateRef.current !== WsState.CONNECTED) {
            return;
          }

          try {
            const data = JSON.parse(e.data);

            // ACP session/update通知
            if (data.method === 'session/update' && data.params?.update) {
              const upd = data.params.update;
              const sid = upd.sessionId || data.params.sessionId;
              if (sid && (upd.sessionUpdate === 'agent_message_chunk' || upd.sessionUpdate === 'tool_call')) {
                const activeSessionId = useAppStore.getState().activeSessionId;
                if (sid !== activeSessionId) {
                  useAppStore.getState().incrementUnread(sid);
                }
              }
            }

            // 旧协议兼容
            // increment unread count
            if (data.type === 'done' && data.session_id) {
              const activeSessionId = useAppStore.getState().activeSessionId;
              if (data.session_id !== activeSessionId) {
                useAppStore.getState().incrementUnread(data.session_id);
              }
            }

            // session list refresh
            if (data.type === 'session_list_refresh') {
              useAppStore.getState().triggerSessionListRefresh();
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onclose = (event) => {
          handleWebSocketClose(event);
          
          // 如果需要重连且组件未卸载
          if (wsStateRef.current === WsState.RECONNECTING && !unmountedRef.current) {
            reconnectTimerRef.current = setTimeout(() => {
              connect();
            }, retryRef.current);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          // onerror 后通常会触发 onclose，在 onclose 中处理状态更新
        };
      } catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        updateWsState(WsState.DISCONNECTED);
      }
    };

    // 初始连接
    connect();

    return () => {
      unmountedRef.current = true;
      
      // 清理重连定时器
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      
      // 关闭连接
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      
      // 重置状态
      updateWsState(WsState.IDLE);
      connectedTokenRef.current = null;
    };
  }, []);

  return null;
}
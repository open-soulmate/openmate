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

  // 更新状态机状态并同步到全局store
  const updateWsState = (newState: WsState) => {
    wsStateRef.current = newState;
    // 同步连接状态到全局store
    const isConnected = newState === WsState.CONNECTED;
    useAppStore.getState().setGlobalWsConnected(isConnected);
  };

  useEffect(() => {
    const connect = () => {
      if (unmountedRef.current) return;

      // 根据当前状态决定行为
      if (wsStateRef.current === WsState.CONNECTED || wsStateRef.current === WsState.CONNECTING) {
        // 已经在连接或已连接，跳过
        return;
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

            // 可以在这里处理其他消息类型
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error);
          }
        };

        ws.onclose = (event) => {
          console.log('WebSocket closed:', event.code, event.reason);
          updateWsState(WsState.DISCONNECTED);
          wsRef.current = null;
          connectedTokenRef.current = null;
          // 重连逻辑
          if (!unmountedRef.current) {
            updateWsState(WsState.RECONNECTING);
            setTimeout(connect, retryRef.current);
            retryRef.current = Math.min(retryRef.current * 2, 30000); // 指数退避，最大30秒
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          // onerror 后通常会触发 onclose，所以这里可以不做处理，或者直接设置状态
          updateWsState(WsState.DISCONNECTED);
          wsRef.current = null;
          connectedTokenRef.current = null;
          // 重连逻辑
          if (!unmountedRef.current) {
            updateWsState(WsState.RECONNECTING);
            setTimeout(connect, retryRef.current);
            retryRef.current = Math.min(retryRef.current * 2, 30000);
          }
        };} catch (error) {
        console.error('Failed to create WebSocket connection:', error);
        updateWsState(WsState.DISCONNECTED);
        wsRef.current = null;
        connectedTokenRef.current = null;
        // 重连逻辑
        if (!unmountedRef.current) {
          updateWsState(WsState.RECONNECTING);
          setTimeout(connect, retryRef.current);
          retryRef.current = Math.min(retryRef.current * 2, 30000);
        }
      }
    };

    // 初始连接
    connect();

    // 监听 token 变化（例如用户登出/登入）
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'token' || e.key === 'access_token') {
        const currentToken = getToken();
        // Token 变化时断开旧连接，重新连接
        if (wsRef.current && connectedTokenRef.current !== currentToken) {
          wsRef.current.close(1000, 'Token changed');
          wsRef.current = null;
          connectedTokenRef.current = null;
          updateWsState(WsState.DISCONNECTED);
        }
        // 如果有新 token，触发连接
        if (currentToken && wsStateRef.current === WsState.IDLE) {
          connect();
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);

    // 清理函数
    return () => {
      unmountedRef.current = true;
      window.removeEventListener('storage', handleStorageChange);
      if (wsRef.current) {
        wsRef.current.close(1000, 'Component unmounting');
        wsRef.current = null;
      }
      connectedTokenRef.current = null;
      updateWsState(WsState.DISCONNECTED);
    };
  }, []);

  // 该组件不渲染任何 UI
  return null;
}
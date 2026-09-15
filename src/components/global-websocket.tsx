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

            // Also increment on 'message' type for streaming responses
            if (data.type === 'message' && data.session_id) {
              const activeSessionId = useAppStore.getState().activeSessionId;
              if (data.session_id !== activeSessionId) {
                useAppStore.getState().incrementUnread(data.session_id);
              }
            }
          } catch {
            // ignore parse errors
          }
        };

        ws.onclose = () => {
          wsRef.current = null;
          // 如果不是卸载导致的关闭，则尝试重连
          if (!unmountedRef.current) {
            updateWsState(WsState.RECONNECTING);
            setTimeout(connect, retryRef.current);
            retryRef.current = Math.min(retryRef.current * 1.5, 30000);
          } else {
            updateWsState(WsState.DISCONNECTED);
          }
        };

        ws.onerror = () => {
          // onerror后通常会触发onclose，所以这里只需关闭连接
          ws.close();
        };
      } catch (error) {
        // 连接创建失败
        updateWsState(WsState.RECONNECTING);
        setTimeout(connect, retryRef.current);
        retryRef.current = Math.min(retryRef.current * 1.5, 30000);
      }
    };

    // 初始化连接
    if (!unmountedRef.current) {
      connect();
    }

    // 监听 storage 事件，当 token 变化时强制重连
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'auth_token' && !unmountedRef.current) {
        // 如果token变化，关闭现有连接并重连
        if (wsRef.current) {
          wsRef.current.close();
        }
        // 重置状态以允许重新连接
        updateWsState(WsState.IDLE);
        connect();
      }
    };
    window.addEventListener('storage', onStorage);

    // 清理函数
    return () => {
      unmountedRef.current = true;
      window.removeEventListener('storage', onStorage);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      updateWsState(WsState.DISCONNECTED);
    };
  }, []);

  // 这个组件不渲染任何UI
  return null;
}
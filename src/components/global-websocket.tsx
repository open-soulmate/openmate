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

// 重连配置
const RECONNECT_CONFIG = {
  MAX_ATTEMPTS: 5,        // 最大重试次数
  BASE_DELAY: 1000,       // 基础延迟 1秒
  MAX_DELAY: 30000,       // 最大延迟 30秒
  PING_INTERVAL: 25000,   // 发送心跳间隔 25秒
  PONG_TIMEOUT: 30000,    // 等待pong响应超时 30秒
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
  const unmountedRef = useRef(false);
  const connectedTokenRef = useRef<string | null>(null);
  const wsStateRef = useRef<WsState>(WsState.IDLE);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pongTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isManualDisconnectRef = useRef<boolean>(false);

  // 更新状态机状态并同步到全局store
  const updateWsState = (newState: WsState) => {
    wsStateRef.current = newState;
    // 同步连接状态到全局store
    const isConnected = newState === WsState.CONNECTED;
    useAppStore.getState().setGlobalWsConnected(isConnected);

    // 确保在 IDLE 或 DISCONNECTED 状态下没有活跃的计时器
    if (newState === WsState.IDLE || newState === WsState.DISCONNECTED) {
      clearAllTimers();
    }
  };

  // 清除所有计时器
  const clearAllTimers = () => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pongTimerRef.current) {
      clearTimeout(pongTimerRef.current);
      pongTimerRef.current = null;
    }
  };

  // 清除心跳计时器
  const clearPingPongTimers = () => {
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
    if (pongTimerRef.current) {
      clearTimeout(pongTimerRef.current);
      pongTimerRef.current = null;
    }
  };

  // 重置连接状态为IDLE，允许重新连接
  const resetConnectionState = () => {
    clearAllTimers();
    if (wsRef.current) {
      wsRef.current.close(WsCloseCodes.NORMAL);
      wsRef.current = null;
    }
    connectedTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    isManualDisconnectRef.current = false;
    updateWsState(WsState.IDLE);
  };

  // 手动断开连接
  const disconnect = () => {
    isManualDisconnectRef.current = true;
    clearAllTimers();
    if (wsRef.current) {
      wsRef.current.close(WsCloseCodes.NORMAL);
      wsRef.current = null;
    }
    updateWsState(WsState.DISCONNECTED);
  };

  // 计算重试延迟（指数退避）
  const calculateRetryDelay = (attempt: number): number => {
    const delay = Math.min(
      RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, attempt),
      RECONNECT_CONFIG.MAX_DELAY
    );
    // 添加一些抖动以避免雷群效应
    const jitter = delay * 0.2 * Math.random();
    return delay + jitter;
  };

  // 开始保活机制
  const startPingPong = () => {
    clearPingPongTimers();

    // 发送ping帧
    pingTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        // 尝试发送应用层心跳（如果服务器支持）
        wsRef.current.send(JSON.stringify({ type: 'ping' }));

        // 设置等待pong响应的超时
        pongTimerRef.current = setTimeout(() => {
          // 如果在超时内没有收到pong，认为连接已断开
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.warn('Pong timeout, closing connection.');
            wsRef.current.close(WsCloseCodes.SERVER_ERROR);
          }
        }, RECONNECT_CONFIG.PONG_TIMEOUT);
      }
    }, RECONNECT_CONFIG.PING_INTERVAL);
  };

  // 处理连接打开
  const handleOpen = () => {
    console.log('WebSocket connected.');
    connectedTokenRef.current = getToken();
    reconnectAttemptsRef.current = 0;
    updateWsState(WsState.CONNECTED);
    startPingPong();
  };

  // 处理连接关闭
  const handleClose = (event: CloseEvent) => {
    console.log('WebSocket closed:', event.code, event.reason);
    clearPingPongTimers();

    // 如果是手动断开，不进行重连
    if (isManualDisconnectRef.current) {
      return;
    }

    // 认证失败或令牌无效，不进行重连
    if (event.code === WsCloseCodes.AUTH_FAILED || event.code === WsCloseCodes.TOKEN_INVALID) {
      console.error('Authentication failed, not reconnecting.');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    // 尝试重连
    updateWsState(WsState.RECONNECTING);
    scheduleReconnect();
  };

  // 处理错误
  const handleError = (error: Event) => {
    console.error('WebSocket error:', error);
    // 错误通常会触发关闭事件，所以这里不需要额外处理
  };

  // 处理接收到的消息
  const handleMessage = (event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      // 根据消息类型处理
      if (data.type === 'pong') {
        // 收到pong响应，清除等待pong的超时计时器
        if (pongTimerRef.current) {
          clearTimeout(pongTimerRef.current);
          pongTimerRef.current = null;
        }
      } else if (data.type === 'unread_count_update') {
        // 更新未读消息数，例如通过 store
        // useAppStore.getState().updateUnreadCount(data.sessionId, data.count);
        console.log('Unread count update:', data);
      } else if (data.type === 'session_refresh') {
        // 刷新会话列表，例如通过 store
        // useAppStore.getState().triggerSessionRefresh();
        console.log('Session refresh trigger:', data);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  };

  // 安排重连
  const scheduleReconnect = () => {
    if (unmountedRef.current || isManualDisconnectRef.current) {
      return;
    }

    if (reconnectAttemptsRef.current >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
      console.error('Max reconnection attempts reached.');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    const delay = calculateRetryDelay(reconnectAttemptsRef.current);
    console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})`);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectAttemptsRef.current += 1;
      connectWebSocket();
    }, delay);
  };

  // 连接WebSocket
  const connectWebSocket = () => {
    if (unmountedRef.current || isManualDisconnectRef.current) {
      return;
    }

    const token = getToken();
    if (!token) {
      console.warn('No token available, cannot connect WebSocket.');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    // 如果已经使用相同的token连接，则不需要重新连接
    if (wsRef.current?.readyState === WebSocket.OPEN && connectedTokenRef.current === token) {
      return;
    }

    // 关闭现有连接（如果有）
    if (wsRef.current) {
      wsRef.current.close(WsCloseCodes.NORMAL);
      wsRef.current = null;
    }

    updateWsState(WsState.CONNECTING);

    const wsUrl = `${getApiBaseUrl().replace(/^http/, 'ws')}/ws/global?token=${encodeURIComponent(token)}`;

    try {
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = handleOpen;
      wsRef.current.onclose = handleClose;
      wsRef.current.onerror = handleError;
      wsRef.current.onmessage = handleMessage;
    } catch (error) {
      console.error('Failed to create WebSocket:', error);
      updateWsState(WsState.DISCONNECTED);
      scheduleReconnect();
    }
  };

  useEffect(() => {
    unmountedRef.current = false;
    // 组件挂载时连接
    connectWebSocket();

    return () => {
      // 组件卸载时清理
      unmountedRef.current = true;
      clearAllTimers();
      if (wsRef.current) {
        wsRef.current.close(WsCloseCodes.NORMAL);
        wsRef.current = null;
      }
      // 重置状态，确保store更新
      updateWsState(WsState.DISCONNECTED);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 这个组件不渲染任何可见的UI
  return null;
}
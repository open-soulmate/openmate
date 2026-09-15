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
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (error) {
          console.warn('Failed to send heartbeat:', error);
        }
        
        // 设置pong超时计时器
        pongTimerRef.current = setTimeout(() => {
          if (wsStateRef.current === WsState.CONNECTED) {
            console.warn('WebSocket heartbeat timeout, initiating reconnect...');
            // 主动关闭连接以触发重连
            if (wsRef.current) {
              wsRef.current.close();
            }
          }
        }, RECONNECT_CONFIG.PONG_TIMEOUT);
      }
    }, RECONNECT_CONFIG.PING_INTERVAL);
  };

  // 清除保活计时器
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

  // 重置保活计时器（收到pong时调用）
  const resetPongTimer = () => {
    if (pongTimerRef.current) {
      clearTimeout(pongTimerRef.current);
      pongTimerRef.current = null;
    }
  };

  // 处理连接关闭事件
  const handleWebSocketClose = (event: CloseEvent) => {
    const { code, reason } = event;
    clearPingPongTimers();
    
    // 如果是手动断开，不进行重连
    if (isManualDisconnectRef.current) {
      resetConnectionState();
      return;
    }
    
    // 认证失败或token无效，停止自动重连
    if (code === WsCloseCodes.AUTH_FAILED || code === WsCloseCodes.TOKEN_INVALID) {
      console.warn(`WebSocket closed due to authentication error (code: ${code}, reason: ${reason})`);
      updateWsState(WsState.DISCONNECTED);
      return;
    }
    
    // 达到最大重试次数
    if (reconnectAttemptsRef.current >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
      console.warn(`Maximum reconnection attempts (${RECONNECT_CONFIG.MAX_ATTEMPTS}) reached`);
      updateWsState(WsState.DISCONNECTED);
      return;
    }
    
    // 其他错误或非正常关闭，尝试重连
    if (code !== WsCloseCodes.NORMAL && !unmountedRef.current) {
      const delay = calculateRetryDelay(reconnectAttemptsRef.current);
      reconnectAttemptsRef.current += 1;
      
      console.log(`WebSocket closed (code: ${code}), attempting reconnect in ${Math.round(delay/1000)}s (attempt ${reconnectAttemptsRef.current}/${RECONNECT_CONFIG.MAX_ATTEMPTS})`);
      
      updateWsState(WsState.RECONNECTING);
      
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          connect();
        }
      }, delay);
    } else {
      // 正常关闭或组件已卸载
      updateWsState(WsState.IDLE);
    }
    
    // 清除WebSocket引用
    wsRef.current = null;
    connectedTokenRef.current = null;
  };

  // 处理连接错误事件
  const handleWebSocketError = (event: Event) => {
    console.error('WebSocket error:', event);
    // 错误通常会跟随关闭事件，这里可以添加额外的错误处理逻辑
    if (wsStateRef.current === WsState.CONNECTING) {
      // 连接过程中出错，将状态转换为RECONNECTING
      updateWsState(WsState.RECONNECTING);
    }
  };

  // 处理接收消息
  const handleWebSocketMessage = (event: MessageEvent) => {
    // 收到消息时重置pong计时器（视为连接活跃）
    if (pongTimerRef.current) {
      resetPongTimer();
    }
    
    // 这里可以添加消息处理逻辑
    try {
      const data = JSON.parse(event.data);
      // 处理pong响应
      if (data.type === 'pong') {
        resetPongTimer();
        return;
      }
      // 处理其他消息类型...
    } catch (error) {
      // 非JSON消息，可能是原始文本
      console.log('Received message:', event.data);
    }
  };

  // 建立WebSocket连接
  const connect = () => {
    if (unmountedRef.current || wsStateRef.current === WsState.CONNECTED || wsStateRef.current === WsState.CONNECTING) {
      return;
    }

    const token = getToken();
    if (!token) {
      console.warn('No authentication token available for WebSocket connection');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    // 如果是重连且token变化，允许强制重连
    if (connectedTokenRef.current && connectedTokenRef.current !== token) {
      if (wsRef.current) {
        wsRef.current.close();
      }
      connectedTokenRef.current = null;
    }

    updateWsState(WsState.CONNECTING);
    isManualDisconnectRef.current = false;

    const wsUrl = `${getApiBaseUrl()}/ws?token=${encodeURIComponent(token)}`;
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmountedRef.current) {
          ws.close();
          return;
        }
        
        console.log('WebSocket connected');
        connectedTokenRef.current = token;
        reconnectAttemptsRef.current = 0; // 连接成功，重置重试计数
        updateWsState(WsState.CONNECTED);
        
        // 启动保活机制
        startPingPong();
      };

      ws.onmessage = handleWebSocketMessage;
      ws.onerror = handleWebSocketError;
      ws.onclose = handleWebSocketClose;
    } catch (error) {
      console.error('Failed to create WebSocket connection:', error);
      updateWsState(WsState.RECONNECTING);
      
      // 安排重连
      const delay = calculateRetryDelay(reconnectAttemptsRef.current);
      reconnectAttemptsRef.current += 1;
      
      reconnectTimerRef.current = setTimeout(() => {
        if (!unmountedRef.current) {
          connect();
        }
      }, delay);
    }
  };

  // 手动断开连接
  const disconnect = () => {
    isManualDisconnectRef.current = true;
    resetConnectionState();
  };

  useEffect(() => {
    unmountedRef.current = false;
    connect();

    // 监听token变化事件（如果需要）
    const handleTokenChange = () => {
      const currentToken = getToken();
      if (connectedTokenRef.current && connectedTokenRef.current !== currentToken) {
        // Token变化，重新连接
        if (wsRef.current) {
          wsRef.current.close();
        }
      }
    };

    // 可以添加事件监听，例如storage事件监听token变化
    window.addEventListener('storage', handleTokenChange);

    return () => {
      unmountedRef.current = true;
      disconnect();
      window.removeEventListener('storage', handleTokenChange);
    };
  }, []);

  return null; // 不渲染任何DOM
}
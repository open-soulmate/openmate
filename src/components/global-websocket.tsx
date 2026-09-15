"use client";

import { useEffect, useRef, useCallback } from 'react';
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
  
  // 新增：防抖相关引用
  const statusUpdateTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingStatusRef = useRef<WsState | null>(null);

  // 新增：防抖的全局状态更新函数
  const debouncedUpdateGlobalState = useCallback((isConnected: boolean) => {
    // 清除之前的防抖计时器
    if (statusUpdateTimerRef.current) {
      clearTimeout(statusUpdateTimerRef.current);
    }
    
    // 使用requestAnimationFrame确保在浏览器空闲时更新
    statusUpdateTimerRef.current = setTimeout(() => {
      // 确保在更新时检查组件是否已卸载
      if (!unmountedRef.current) {
        const currentConnected = useAppStore.getState().globalWsConnected;
        // 只有当连接状态实际发生变化时才更新
        if (currentConnected !== isConnected) {
          useAppStore.getState().setGlobalWsConnected(isConnected);
        }
      }
      statusUpdateTimerRef.current = null;
    }, 10); // 10ms 的防抖延迟，平衡响应速度和批量更新
  }, []);

  // 更新状态机状态并同步到全局store
  const updateWsState = (newState: WsState) => {
    const oldState = wsStateRef.current;
    wsStateRef.current = newState;
    
    // 确保在 IDLE 或 DISCONNECTED 状态下没有活跃的计时器
    if (newState === WsState.IDLE || newState === WsState.DISCONNECTED) {
      clearAllTimers();
    }
    
    // 只有当状态真正变化时才触发全局状态更新
    if (oldState !== newState) {
      const isConnected = newState === WsState.CONNECTED;
      debouncedUpdateGlobalState(isConnected);
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
    // 清除防抖计时器
    if (statusUpdateTimerRef.current) {
      clearTimeout(statusUpdateTimerRef.current);
      statusUpdateTimerRef.current = null;
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
    connectedTokenRef.current = null;
    reconnectAttemptsRef.current = 0;
    updateWsState(WsState.DISCONNECTED);
  };

  // 尝试重新连接
  const attemptReconnect = () => {
    if (isManualDisconnectRef.current || wsStateRef.current === WsState.DISCONNECTED) {
      return;
    }

    if (reconnectAttemptsRef.current >= RECONNECT_CONFIG.MAX_ATTEMPTS) {
      console.error('WebSocket max reconnect attempts reached');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    updateWsState(WsState.RECONNECTING);
    reconnectAttemptsRef.current++;

    // 指数退避延迟
    const delay = Math.min(
      RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
      RECONNECT_CONFIG.MAX_DELAY
    );

    reconnectTimerRef.current = setTimeout(() => {
      if (!unmountedRef.current && !isManualDisconnectRef.current) {
        connect();
      }
    }, delay);
  };

  // 开始心跳
  const startPing = () => {
    clearPingPongTimers();
    
    pingTimerRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        try {
          wsRef.current.send(JSON.stringify({ type: 'ping' }));
        } catch (error) {
          console.error('WebSocket send ping failed:', error);
        }
        
        // 设置pong响应超时
        pongTimerRef.current = setTimeout(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            console.warn('WebSocket pong timeout, closing connection');
            wsRef.current.close(WsCloseCodes.SERVER_ERROR);
          }
        }, RECONNECT_CONFIG.PONG_TIMEOUT);
      }
    }, RECONNECT_CONFIG.PING_INTERVAL);
  };

  // 连接WebSocket
  const connect = () => {
    if (unmountedRef.current || isManualDisconnectRef.current) {
      return;
    }

    const token = getToken();
    if (!token) {
      console.warn('WebSocket: No token available');
      updateWsState(WsState.DISCONNECTED);
      return;
    }

    // 如果已经有相同的token连接，则跳过
    if (wsRef.current?.readyState === WebSocket.OPEN && connectedTokenRef.current === token) {
      return;
    }

    // 关闭现有连接
    if (wsRef.current) {
      wsRef.current.close(WsCloseCodes.NORMAL);
      wsRef.current = null;
    }

    updateWsState(WsState.CONNECTING);
    connectedTokenRef.current = token;

    try {
      const wsUrl = getApiBaseUrl().replace(/^http/, 'ws') + '/ws';
      const ws = new WebSocket(`${wsUrl}?token=${token}`);
      
      ws.onopen = () => {
        if (!unmountedRef.current) {
          console.log('WebSocket connected');
          updateWsState(WsState.CONNECTED);
          startPing();
        }
      };

      ws.onclose = (event) => {
        if (!unmountedRef.current) {
          console.log(`WebSocket closed: ${event.code} - ${event.reason}`);
          
          switch (event.code) {
            case WsCloseCodes.AUTH_FAILED:
            case WsCloseCodes.TOKEN_INVALID:
              console.error('WebSocket authentication failed');
              updateWsState(WsState.DISCONNECTED);
              break;
            case WsCloseCodes.NORMAL:
              if (!isManualDisconnectRef.current) {
                attemptReconnect();
              }
              break;
            default:
              attemptReconnect();
          }
        }
      };

      ws.onerror = (error) => {
        if (!unmountedRef.current) {
          console.error('WebSocket error:', error);
        }
      };

      ws.onmessage = (event) => {
        if (!unmountedRef.current) {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'pong') {
              // 收到pong响应，清除超时计时器
              if (pongTimerRef.current) {
                clearTimeout(pongTimerRef.current);
                pongTimerRef.current = null;
              }
            } else {
              // 处理其他消息（业务逻辑）
              console.log('WebSocket message received:', data);
            }
          } catch (error) {
            console.error('WebSocket message parse error:', error);
          }
        }
      };

      wsRef.current = ws;
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      attemptReconnect();
    }
  };

  // 组件挂载时建立连接
  useEffect(() => {
    unmountedRef.current = false;
    
    // 延迟连接，避免在快速导航时频繁创建连接
    const connectTimeout = setTimeout(() => {
      if (!unmountedRef.current) {
        connect();
      }
    }, 100);

    return () => {
      unmountedRef.current = true;
      clearAllTimers();
      
      if (wsRef.current) {
        wsRef.current.close(WsCloseCodes.NORMAL);
        wsRef.current = null;
      }
      
      // 重置全局连接状态
      useAppStore.getState().setGlobalWsConnected(false);
    };
  }, []);

  // 监听token变化，重新连接
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe((state) => {
      // 如果token发生变化，重新连接
      const currentToken = getToken();
      if (currentToken && currentToken !== connectedTokenRef.current) {
        if (wsStateRef.current === WsState.CONNECTED) {
          // 先断开再重连
          disconnect();
          setTimeout(() => {
            if (!unmountedRef.current) {
              isManualDisconnectRef.current = false;
              connect();
            }
          }, 100);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // 这个组件不渲染任何UI
  return null;
}
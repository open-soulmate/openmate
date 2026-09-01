"use client";

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/stores/app-store';
import { getApiBaseUrl, getToken } from '@/lib/api-client';

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

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    const apiBase = getApiBaseUrl();
    const wsUrl = apiBase.replace(/^http/, 'ws').replace(/:\d+$/, ':8092') + `/ws/chat?token=${token}`;

    const connect = () => {
      if (unmountedRef.current) return;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        useAppStore.getState().setGlobalWsConnected(true);
        retryRef.current = 1000;
      };

      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);

          // When a new message arrives for a session that's NOT the current one,
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
        useAppStore.getState().setGlobalWsConnected(false);
        if (!unmountedRef.current) {
          setTimeout(connect, retryRef.current);
          retryRef.current = Math.min(retryRef.current * 1.5, 30000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
    };
  }, []);

  // Clear unread when active session changes
  const activeSessionId = useAppStore((s) => s.activeSessionId);
  useEffect(() => {
    if (activeSessionId) {
      useAppStore.getState().clearUnread(activeSessionId);
    }
  }, [activeSessionId]);

  return null; // This component renders nothing — it's a side-effect only
}

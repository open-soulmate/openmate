"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * Visibility-aware polling hook.
 * - Pauses polling when the tab is hidden
 * - Resumes with an immediate fetch when the tab becomes visible
 * - Reduces unnecessary API calls on background tabs
 */
export function useVisibilityPoll(
  callback: () => void | Promise<void>,
  intervalMs: number,
  deps: unknown[] = []
) {
  const savedCallback = useRef(callback);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update callback ref
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  const startPolling = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => savedCallback.current(), intervalMs);
  }, [intervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    savedCallback.current();

    // Start polling
    startPolling();

    // Visibility change handler
    const handleVisibility = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        // Immediate fetch on tab focus + restart polling
        savedCallback.current();
        startPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, startPolling, stopPolling, ...deps]);
}

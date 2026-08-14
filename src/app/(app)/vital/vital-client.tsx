"use client";
import { useState, useEffect, useCallback } from "react";
import { getApiBaseUrl } from "@/lib/api-client";

interface ComponentStatus {
  name: string;
  status: string;
  latency_ms: number;
  message: string;
}

interface HealthReport {
  status: string;
  components: ComponentStatus[];
  ts: number;
}

const STATUS_COLOR: Record<string, string> = {
  up: "#22c55e",
  down: "#ef4444",
  skipped: "#eab308",
};

const STATUS_BG: Record<string, string> = {
  up: "rgba(34,197,94,0.08)",
  down: "rgba(239,68,68,0.08)",
  skipped: "rgba(234,179,8,0.08)",
};

const STATUS_LABEL: Record<string, string> = {
  up: "UP",
  down: "DOWN",
  skipped: "SKIPPED",
};

export function VitalClient() {
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);
  const apiBase = getApiBaseUrl();

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/vital/health`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: HealthReport = await res.json();
      setHealth(data);
      setError(null);
      setLastFetch(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    }
  }, [apiBase]);

  useEffect(() => {
    fetchHealth();
    const timer = setInterval(fetchHealth, 30_000);
    return () => clearInterval(timer);
  }, [fetchHealth]);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 24px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>System Monitor</h1>
          <p style={{ fontSize: 13, color: "#888", margin: "4px 0 0" }}>
            Health check for backend services
          </p>
        </div>
        <button
          onClick={fetchHealth}
          style={{
            padding: "6px 16px",
            fontSize: 13,
            border: "1px solid #e5e5e5",
            borderRadius: 6,
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div
          style={{
            padding: "10px 16px",
            marginBottom: 24,
            borderRadius: 8,
            background: "rgba(239,68,68,0.08)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#ef4444",
            fontSize: 13,
          }}
        >
          Failed to fetch health data: {error}
        </div>
      )}

      {/* Overall status */}
      {health && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 28,
            padding: "12px 18px",
            borderRadius: 10,
            background: health.status === "up"
              ? "rgba(34,197,94,0.06)"
              : "rgba(239,68,68,0.06)",
            border: `1px solid ${health.status === "up"
              ? "rgba(34,197,94,0.2)"
              : "rgba(239,68,68,0.2)"}`,
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 10,
              height: 10,
              borderRadius: "50%",
              background: STATUS_COLOR[health.status] || STATUS_COLOR.down,
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 500 }}>
            Overall: {health.status.toUpperCase()}
          </span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#999" }}>
            {lastFetch ? lastFetch.toLocaleTimeString("zh-CN") : "—"}
          </span>
        </div>
      )}

      {/* Component list */}
      {health && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {health.components.map((comp) => {
            const color = STATUS_COLOR[comp.status] || STATUS_COLOR.down;
            const bg = STATUS_BG[comp.status] || STATUS_BG.down;
            return (
              <div
                key={comp.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "14px 18px",
                  borderRadius: 10,
                  border: `1px solid ${color}33`,
                  background: bg,
                }}
              >
                {/* Status dot */}
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: color,
                    flexShrink: 0,
                  }}
                />
                {/* Name */}
                <span
                  style={{
                    marginLeft: 12,
                    fontSize: 14,
                    fontWeight: 500,
                    minWidth: 120,
                    textTransform: "capitalize",
                  }}
                >
                  {comp.name}
                </span>
                {/* Status badge */}
                <span
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    fontWeight: 600,
                    color,
                    padding: "2px 8px",
                    borderRadius: 4,
                    background: `${color}18`,
                    letterSpacing: 0.5,
                  }}
                >
                  {STATUS_LABEL[comp.status] || comp.status.toUpperCase()}
                </span>
                {/* Latency */}
                <span style={{ marginLeft: "auto", fontSize: 13, color: "#888", fontVariantNumeric: "tabular-nums" }}>
                  {comp.latency_ms}ms
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Timestamp footer */}
      {health && (
        <p style={{ marginTop: 24, fontSize: 12, color: "#aaa", textAlign: "right" }}>
          Last updated: {new Date(health.ts * 1000).toLocaleString("zh-CN")}
        </p>
      )}

      {/* Auto-refresh hint */}
      <p style={{ marginTop: 8, fontSize: 11, color: "#ccc", textAlign: "center" }}>
        Auto-refreshes every 30 seconds
      </p>
    </div>
  );
}

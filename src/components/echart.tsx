"use client";

import { useRef, useEffect } from "react";
import * as echarts from "echarts";

interface EChartProps {
  option: any;
  style?: React.CSSProperties;
  opts?: { renderer?: "canvas" | "svg" };
  onEvents?: Record<string, (params: any) => void>;
  onChartReady?: (chart: echarts.ECharts) => void;
}

/**
 * 轻量 echarts 封装 — 纯 echarts，不依赖任何第三方 React 包。
 * 自动 resize、自动 dispose。
 */
export function EChart({ option, style, opts, onEvents, onChartReady }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = echarts.init(containerRef.current, undefined, {
      renderer: opts?.renderer || "canvas",
    });
    instanceRef.current = instance;

    // 绑定事件
    if (onEvents) {
      for (const [event, handler] of Object.entries(onEvents)) {
        instance.on(event, handler);
      }
    }

    // onChartReady 回调
    if (onChartReady) {
      onChartReady(instance);
    }

    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      instance.dispose();
      instanceRef.current = null;
    };
  }, [opts?.renderer]);

  useEffect(() => {
    if (instanceRef.current) {
      instanceRef.current.setOption(option, { notMerge: true });
    }
  }, [option]);

  return <div ref={containerRef} style={style} />;
}

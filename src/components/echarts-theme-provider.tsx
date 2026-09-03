"use client";
/**
 * ECharts 主题注册 — 在应用根组件中调用一次
 * 注册 "openmate" 主题，所有 ReactECharts 自动应用
 */
import { useEffect } from 'react';
import * as echarts from 'echarts';

export function EChartsThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // 注册 OpenMate 主题
    echarts.registerTheme('openmate', {
      backgroundColor: 'transparent',
      textStyle: {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: '#94a3b8',
      },
      title: {
        textStyle: { color: '#e2e8f0' },
        subtextStyle: { color: '#94a3b8' },
      },
      line: {
        itemStyle: { borderWidth: 2 },
        lineStyle: { width: 2.5 },
        symbolSize: 6,
        smooth: 0.3,
        areaStyle: { opacity: 0.15 },
      },
      bar: {
        itemStyle: {
          borderRadius: [4, 4, 0, 0],
          borderWidth: 0,
        },
      },
      pie: {
        itemStyle: {
          borderRadius: 6,
          borderColor: '#0f172a',
          borderWidth: 2,
        },
      },
      gauge: {
        axisLine: {
          lineStyle: {
            color: [
              [0.6, '#10b981'],
              [0.8, '#f59e0b'],
              [1, '#ef4444'],
            ],
          },
        },
      },
      categoryAxis: {
        axisLine: { lineStyle: { color: '#334155' } },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { show: false },
      },
      valueAxis: {
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#94a3b8', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' } },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderColor: '#334155',
        borderWidth: 1,
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);',
      },
      legend: {
        textStyle: { color: '#94a3b8', fontSize: 11 },
        icon: 'roundRect',
        itemWidth: 12,
        itemHeight: 8,
        itemGap: 16,
      },
      color: [
        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
        '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
        '#14b8a6', '#a855f7', '#eab308', '#6366f1',
      ],
    });
  }, []);

  return <>{children}</>;
}

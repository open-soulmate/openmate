/**
 * OpenMate 统一 ECharts 主题配置
 * 深蓝专业风格，参考远山人才管理系统仪表盘设计
 */

// 主题色板 — 深蓝系 + 高对比辅助色
export const COLORS = {
  primary: '#3b82f6',      // 主蓝
  primaryLight: '#60a5fa', // 浅蓝
  primaryDark: '#1d4ed8',  // 深蓝
  success: '#10b981',      // 绿
  warning: '#f59e0b',      // 橙
  danger: '#ef4444',       // 红
  purple: '#8b5cf6',       // 紫
  cyan: '#06b6d4',         // 青
  pink: '#ec4899',         // 粉
  gray: '#6b7280',         // 灰
  bg: '#0f172a',           // 深底色（暗色模式）
  cardBg: '#1e293b',       // 卡片背景
  text: '#e2e8f0',         // 主文字
  textSecondary: '#94a3b8', // 次要文字
  border: '#334155',       // 边框
};

// 渐变色工厂
export function createGradient(
  ctx: any,
  color1: string,
  color2: string,
  vertical = true
) {
  return {
    type: 'linear' as const,
    x: 0, y: 0,
    x2: vertical ? 0 : 1,
    y2: vertical ? 1 : 0,
    colorStops: [
      { offset: 0, color: color1 },
      { offset: 1, color: color2 },
    ],
  };
}

// 通用图表基础配置
export const BASE_CHART = {
  backgroundColor: 'transparent',
  textStyle: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    color: '#94a3b8',
  },
  grid: {
    top: 40,
    right: 20,
    bottom: 30,
    left: 50,
    containLabel: true,
  },
  tooltip: {
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderColor: '#334155',
    borderWidth: 1,
    textStyle: {
      color: '#e2e8f0',
      fontSize: 12,
    },
    extraCssText: 'backdrop-filter: blur(8px); border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);',
  },
  legend: {
    textStyle: {
      color: '#94a3b8',
      fontSize: 11,
    },
    icon: 'roundRect',
    itemWidth: 12,
    itemHeight: 8,
    itemGap: 16,
  },
};

// 折线图主题
export const LINE_THEME = {
  ...BASE_CHART,
  xAxis: {
    axisLine: { lineStyle: { color: '#334155' } },
    axisTick: { show: false },
    axisLabel: { color: '#94a3b8', fontSize: 10 },
    splitLine: { show: false },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#94a3b8', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' as const } },
  },
};

// 饼图主题
export const PIE_THEME = {
  ...BASE_CHART,
  legend: {
    ...BASE_CHART.legend,
    orient: 'vertical' as const,
    right: 10,
    top: 'center',
  },
};

// 仪表盘主题 — 参考远山风格
export const GAUGE_THEME = {
  ...BASE_CHART,
  series: [{
    type: 'gauge',
    startAngle: 200,
    endAngle: -20,
    min: 0,
    max: 100,
    radius: '85%',
    pointer: {
      show: true,
      length: '60%',
      width: 4,
      itemStyle: { color: '#e2e8f0' },
    },
    axisLine: {
      lineStyle: {
        width: 12,
        color: [
          [0.6, '#10b981'],   // 0-60% 绿色
          [0.8, '#f59e0b'],   // 60-80% 橙色
          [1, '#ef4444'],     // 80-100% 红色
        ],
      },
    },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { show: false },
    detail: {
      fontSize: 20,
      fontWeight: 'bold' as const,
      color: '#e2e8f0',
      offsetCenter: [0, '30%'],
    },
    title: {
      fontSize: 12,
      color: '#94a3b8',
      offsetCenter: [0, '55%'],
    },
  }],
};

// 柱状图主题
export const BAR_THEME = {
  ...BASE_CHART,
  xAxis: {
    axisLine: { lineStyle: { color: '#334155' } },
    axisTick: { show: false },
    axisLabel: { color: '#94a3b8', fontSize: 10 },
  },
  yAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#94a3b8', fontSize: 10 },
    splitLine: { lineStyle: { color: '#1e293b', type: 'dashed' as const } },
  },
};

// 颜色序列 — 用于多系列图表
export const COLOR_PALETTE = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#f97316',
  '#14b8a6', '#a855f7', '#eab308', '#6366f1',
];

// 数字卡片样式
export const STAT_CARD = {
  container: 'rounded-xl border border-slate-700/50 bg-slate-800/50 p-4 backdrop-blur-sm',
  value: 'text-2xl font-bold text-white',
  label: 'text-xs text-slate-400 mt-1',
  trend: {
    up: 'text-emerald-400 text-xs',
    down: 'text-red-400 text-xs',
  },
};

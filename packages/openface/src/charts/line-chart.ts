import type { EChartsOption } from 'echarts';
import { colors } from '../design-tokens';

export interface LineChartOpts {
  smooth?: boolean;
  area?: boolean;
  stack?: boolean;
  legend?: boolean;
  yAxisName?: string;
  xAxisName?: string;
}

export function buildLineOption(
  x: string[],
  y: number[][],
  seriesNames?: string[],
  opts?: LineChartOpts,
): EChartsOption {
  const palette = [colors.info, colors.success, colors.warning, colors.error, colors.primary];

  const series = y.map((data, i) => ({
    name: seriesNames?.[i] ?? `Series ${i + 1}`,
    type: 'line' as const,
    data,
    smooth: opts?.smooth ?? true,
    areaStyle: opts?.area ? { opacity: 0.15 } : undefined,
    stack: opts?.stack ? 'total' : undefined,
    symbol: 'circle' as const,
    symbolSize: 6,
    lineStyle: { width: 2 },
  }));

  return {
    color: palette,
    tooltip: { trigger: 'axis' as const },
    legend: opts?.legend !== false && y.length > 1 ? { top: 0 } : undefined,
    grid: { top: y.length > 1 ? 30 : 16, right: 16, bottom: 24, left: 48, containLabel: true },
    xAxis: { type: 'category' as const, data: x, boundaryGap: false },
    yAxis: {
      type: 'value' as const,
      name: opts?.yAxisName,
      splitLine: { lineStyle: { color: colors.border, type: 'dashed' as const } },
    },
    series,
  };
}

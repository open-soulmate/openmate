import type { EChartsOption } from 'echarts';
import { colors } from '../design-tokens';

export interface AreaChartOpts {
  smooth?: boolean;
  stack?: boolean;
  legend?: boolean;
  yAxisName?: string;
  opacity?: number;
}

/**
 * Area chart — convenience wrapper over line chart with area fill enabled.
 * For more control, use buildLineOption with `area: true`.
 */
export function buildAreaOption(
  x: string[],
  y: number[][],
  seriesNames?: string[],
  opts?: AreaChartOpts,
): EChartsOption {
  const palette = [colors.info, colors.success, colors.warning, colors.error, colors.primary];
  const opacity = opts?.opacity ?? 0.15;

  const series = y.map((data, i) => ({
    name: seriesNames?.[i] ?? `Series ${i + 1}`,
    type: 'line' as const,
    data,
    smooth: opts?.smooth ?? true,
    areaStyle: { opacity },
    stack: opts?.stack ? 'total' : undefined,
    symbol: 'none' as const,
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

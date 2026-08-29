import type { EChartsOption } from 'echarts';
import { colors } from '../design-tokens';

export interface BarChartOpts {
  horizontal?: boolean;
  stack?: boolean;
  legend?: boolean;
  yAxisName?: string;
  xAxisName?: string;
  barWidth?: number | string;
  rounded?: boolean;
}

export function buildBarOption(
  categories: string[],
  values: number[][],
  seriesNames?: string[],
  opts?: BarChartOpts,
): EChartsOption {
  const palette = [colors.info, colors.success, colors.warning, colors.error, colors.primary];
  const isH = opts?.horizontal ?? false;

  const series = values.map((data, i) => ({
    name: seriesNames?.[i] ?? `Series ${i + 1}`,
    type: 'bar' as const,
    data,
    stack: opts?.stack ? 'total' : undefined,
    barWidth: opts?.barWidth,
    itemStyle: opts?.rounded ? { borderRadius: isH ? [0, 4, 4, 0] : [4, 4, 0, 0] } : undefined,
  }));

  const categoryAxis = {
    type: 'category' as const,
    data: categories,
    name: isH ? opts?.yAxisName : opts?.xAxisName,
  };
  const valueAxis = {
    type: 'value' as const,
    name: isH ? opts?.xAxisName : opts?.yAxisName,
    splitLine: { lineStyle: { color: colors.border, type: 'dashed' as const } },
  };

  return {
    color: palette,
    tooltip: { trigger: 'axis' as const },
    legend: opts?.legend !== false && values.length > 1 ? { top: 0 } : undefined,
    grid: { top: values.length > 1 ? 30 : 16, right: 16, bottom: 24, left: 48, containLabel: true },
    xAxis: isH ? valueAxis : categoryAxis,
    yAxis: isH ? categoryAxis : valueAxis,
    series,
  };
}
